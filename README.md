# Loomer

Storyboard-to-stills pipeline. Takes script input through the storyboard skill (cinematic grammar from Daniel Arijon's *Grammar of the Film Language*), extracts a structured spec, generates locked reference stills for every Bible entity, then batch-renders shot key frames with Gemini Nano Banana Pro.

The output is a web-shareable storyboard with PDF download — production-grade panels with shot metadata, ready for client review or generator hand-off.

## What's in this build

This is **Session 1 of 5** — the parser foundation. Everything downstream depends on this working cleanly.

```
loomer/
├── src/
│   ├── schema/storyboard.ts       ← Source of truth: Zod schemas for parsed + state
│   ├── prompts/parser-system.ts   ← How we instruct Claude to extract
│   └── pipeline/02-parse.ts       ← The parser implementation
├── scripts/
│   └── parse-test.ts              ← CLI: parse any markdown file
├── samples/
│   └── leo-and-the-dolphin.md     ← Reference storyboard for round-trip testing
├── .env.example
├── package.json
└── tsconfig.json
```

## Quick start

```bash
# 1. Install
npm install

# 2. Set your Anthropic API key
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Parse the Leo storyboard
ANTHROPIC_API_KEY=sk-ant-... npm run parse:leo
```

You should see:

- Parse success
- 14 shots extracted, ~3 characters / 2 locations / 2 props in the Bible
- Cost ~$0.05–$0.15
- Duration ~10–25s
- Sample shot prompts printed for verbatim verification
- Full JSON written to `out/leo-and-the-dolphin.parsed.json`

## What the parser does

**Input:** Markdown storyboard from the storyboard skill — narrative arc, style lock, Continuity Bible, per-shot blocks with Veo and Kling prompts.

**Output:** A validated `ParsedStoryboard` JSON object containing:

- Metadata (title, format, duration, aspect ratio, total shots)
- The full style lock as both structured fields and the raw block (for prompt injection)
- Bible entries with two descriptions per entity:
  - `full_description` — paste-ready for shot prompts (rich, dramatic, scene-aware)
  - `reference_still_prompt` — derived: neutral lighting, plain background, front-3/4 angle, for the canonical reference still
- Shots with full grammar metadata, continuity refs, and three prompts:
  - `veo_prompt` — verbatim from the markdown
  - `kling_prompt` — verbatim from the markdown
  - `key_frame_prompt` — derived: motion verbs and audio stripped, ready for Nano Banana
- Audit fields (withholdings, visual rhymes, flags for review)

**The two derived fields are the critical innovation.** The skill produces prompts optimised for *moving image* generation. Loomer's pipeline needs prompts optimised for *still image* generation (with character/location reference conditioning). Doing this transform inside the parser — at the same Claude call as extraction — gives much better quality than any deterministic transform we could write.

## Integrity checks

After Zod validation passes, the parser runs cross-reference checks:

- Every shot's continuity IDs (CHAR-*, LOC-*, PROP-*) resolve to a Bible entity
- Every Bible entity is used in at least one shot
- Total Veo durations match the stated `duration_seconds` (within ±20%)
- Every prompt is non-trivially long
- Bible character names appear in the Veo prompt of any shot they're in (verbatim-injection check)

These produce **warnings, not errors** — the parser still returns the storyboard, but the warnings get surfaced in the UI for human review before reference still generation.

## Architecture (the full pipeline)

```
Stage A — Storyboard generation       (Claude + storyboard skill)
            │
            ▼ markdown
Stage B — Parsing                     ◄── YOU ARE HERE (Session 1)
            │                              src/pipeline/02-parse.ts
            ▼ ParsedStoryboard JSON
Stage C — Reference still generation  (Gemini Nano Banana Pro, fan-out per Bible entity)
            │
            ▼ 4 candidates per entity
Stage D — Reference still approval    (UI gate — user must approve all)
            │
            ▼ approved reference URLs locked to entity IDs
Stage E — Per-shot key frame batch    (Gemini Nano Banana Pro, with reference conditioning)
            │
            ▼ key frame URL per shot
Stage F — Panel review                (UI — regenerate individuals or rewind)
            │
            ▼
Stage G — Export                      (web link + PDF download)
```

## Cost expectations

For a typical 14-shot storyboard with 5 Bible entities:

| Stage | API | Volume | Cost |
|-------|-----|--------|------|
| A. Generate | Anthropic Sonnet 4.5 | ~50k tokens | $0.30 |
| B. Parse | Anthropic Sonnet 4.5 | ~30k tokens | $0.15 |
| C. References | Gemini Nano Banana Pro | 5 entities × 4 candidates = 20 images | $2.68 |
| E. Shot key frames | Gemini Nano Banana Pro | 14 shots × ~1.3 (with regens) ≈ 18 | $2.41 |
| **Total** | | | **~$5.50** |

Cheaper alternatives:
- Use Nano Banana 2 (`gemini-3.1-flash-image-preview`) at $0.045/image instead of Pro: total ~$2
- Use original Nano Banana (`gemini-2.5-flash-image`) at $0.039/image: total ~$1.80

Recommendation: ship v1 on Pro (better consistency = fewer regens = better UX), expose a model switch for power users who want to trade quality for cost.

## What's next

- **Session 2** — Skeleton Next.js app on Vercel with Postgres. Single page: paste script → run storyboard skill → show markdown → parse → debug-display the parsed JSON.
- **Session 3** — Reference still generation with Gemini, 4-candidate UI per Bible entity, approval gate.
- **Session 4** — Batch shot key frame generation with reference conditioning, panel review UI.
- **Session 5** — Web-shareable link routes + PDF export.

Each session ships something testable end-to-end. Don't skip ahead — the reference-still UX is where consistency lives or dies, and getting it right at Session 3 is more valuable than rushing to motion at Session 4.

## Design decisions worth remembering

**Why two Claude calls (skill + parser) rather than one.** The skill produces better storyboards because it's optimised for prose-shaped thinking. Forcing JSON output during the cinematic-grammar pass measurably degrades the work. Two calls: first thinks in prose, second extracts deterministically.

**Why we derive `reference_still_prompt` and `key_frame_prompt` at parse time.** Both are required by downstream stages and both are non-trivial to produce. Doing them at parse time keeps the pipeline stages clean (Stage C just sends `reference_still_prompt`; Stage E just sends `key_frame_prompt`) and lets the parser model do the cleverness (which it's already in context for).

**Why Nano Banana Pro for v1.** Up to 8 reference images per generation, explicitly designed for storyboard / multi-reference workflows, best-in-class character consistency. Cost difference vs. cheaper variants is noise at v1 volumes.

**Why human approval gate at the reference stage.** One bad approved Maya reference = 14 bad shots. The cost of the gate is one click per Bible entity. The cost of skipping it is regenerating the whole storyboard.

**Why Sonnet for the parser, not Opus.** Parser is structurally simple — extract from a known markdown shape into a known schema. Sonnet 4.5 with strict tool-use schemas is fast, cheap, and the right call. We can switch to Opus if we ever see real quality issues in extraction.
