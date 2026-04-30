# Loomer — Project Brief

This document is the canonical context for anyone (or any AI) building Loomer. It captures every architectural decision, design principle, and convention that's been locked in so we don't re-litigate them every session.

If you're Claude Code working on this project: **read this entire document before making changes.** The decisions here are not suggestions — they're conclusions from prior reasoning sessions and reversing them is a meaningful action that should be flagged for human review, not done silently.

---

## 1. What Loomer is

Loomer is a storyboard-to-stills pipeline for advertising and short-form film work. It takes a script (or premise, or beat list) as input, runs it through the **storyboard skill** (a custom Claude skill that encodes Daniel Arijon's *Grammar of the Film Language*), extracts a structured spec, generates locked reference stills for every Bible entity (characters, locations, story-critical props), then batch-renders shot key frames using Gemini Nano Banana Pro with the reference stills as conditioning images.

The output is a **web-shareable storyboard with PDF download** — production-grade panels with shot metadata beside each frame, ready for client review or hand-off to a video generator (Veo 3.1, Kling 2.5/2.6).

### Why this exists

The author (Paul) is a Creative Director at adam&eve/TBWA. Storyboard work is a recurring deliverable across PlayStation, Waymo, IAMS, Twix, Mars Snacking and other accounts. Existing tools either:

- Produce technically okay but cinematically uninformed shots (Midjourney with prompt-engineering) that lack continuity across panels.
- Produce great single shots but break character likeness, wardrobe, location across multiple panels (raw image generation).
- Treat the storyboard as a series of independent prompts rather than a coherent narrative-grammatical sequence (every existing AI storyboarding tool we've seen).

Loomer addresses all three by treating the storyboard as a **structured spec** with a Continuity Bible and Arijon grammar metadata, then using that spec to drive consistent multi-shot generation with locked reference imagery.

### What Loomer is NOT

- Not a video generator. We hand off to Veo / Kling for motion if needed; Loomer's deliverable is stills + metadata.
- Not a public SaaS. v1 is single-user (Paul), gated by a password env variable. Multi-tenant is post-v1.
- Not an image editor. Generated stills are immutable; users iterate by regenerating, not by editing pixels.
- Not opinionated about cinematic style by default. The skill defaults to cinematic photoreal, but the spec carries any aesthetic the user briefs in.

---

## 2. The five-session plan

Loomer is being built across five sessions. Each session ships something testable end-to-end. Don't skip ahead — every session lays groundwork for the next.

### Session 1 — Parser foundation (COMPLETE)

**Status:** Built and tested. Lives at the repo root.

**What it does:** Takes storyboard markdown, returns a validated `ParsedStoryboard` JSON via Claude Sonnet with structured outputs (tool use). Includes integrity checks (cross-reference Bible IDs in shots, duration math, prompt verbatim verification) that produce warnings rather than hard errors.

**Key files:**
- `src/schema/storyboard.ts` — Zod schemas for `ParsedStoryboard` (parser output) and `Storyboard` (database state). Source of truth for everything.
- `src/prompts/parser-system.ts` — System prompt instructing Claude how to extract.
- `src/pipeline/02-parse.ts` — Parser implementation.
- `scripts/parse-test.ts` — CLI to parse any markdown file.
- `scripts/schema-test.ts` — Schema validation tests, no API calls. 12/12 passing.

**What's tested:** Schema accepts well-formed data, rejects malformed. JSON Schema output is Anthropic-compatible. TypeScript strict mode passes including `noUncheckedIndexedAccess`.

**What's NOT tested yet:** End-to-end parser run against the Leo storyboard. Paul will run this manually with his Anthropic API key as the first verification step.

### Session 2 — Skeleton Next.js app

**Status:** Not started.

**Scope:** A working Next.js 15 + App Router app deployed to Vercel that lets the user paste a script, get a storyboard markdown back, parse it, and view the parsed JSON. No generation yet — just plumbing.

**Specifically:**

- Next.js 15 with App Router (`app/` directory).
- Vercel Postgres via Prisma. Schema for `storyboards` (id, source_input, source_markdown, parsed_json, status, timestamps).
- Single page (`/`) with three states: empty (paste script), generating (markdown streaming or done), parsed (show parsed JSON).
- API routes:
  - `POST /api/storyboard` — takes script, calls Claude with the storyboard skill, returns markdown. Handles streaming.
  - `POST /api/storyboard/[id]/parse` — runs the parser from Session 1 against the stored markdown, returns parsed JSON.
  - `GET /api/storyboard/[id]` — returns the storyboard record with all fields.
- Password gate: middleware that reads `LOOMER_PASSWORD` env var and prompts on first visit, sets a cookie. No auth provider, no user accounts.
- A storyboard list view (`/list`) showing prior storyboards by title/created_at.
- Tailwind CSS, shadcn/ui for components. Pastel-glassmorphic UI consistent with the PULSE dashboard aesthetic.

**Critical:** the storyboard skill must be loaded into the Claude API call. The skill file (`storyboard.skill`) lives in `skills/` in the repo root. The API route reads the SKILL.md and reference files from that directory and includes them as system context. **Don't try to embed the skill into the source code** — keep it as a loose file so future skill updates can ship without code changes.

**Done when:** Paul can paste the Leo and the Dolphin script, see the markdown stream in, see it parse, and see the JSON. Deployed to Vercel at a `loomer.<paul's domain>` URL, password-gated.

### Session 3 — Reference still generation + approval gate

**Status:** Not started.

**Scope:** For every Bible entity in a parsed storyboard, generate 4 candidate reference stills using Gemini Nano Banana Pro. Show them in an approval grid. Block downstream stages until every entity is approved.

**Specifically:**

- New API route `POST /api/storyboard/[id]/references` that fans out per Bible entity, generates 4 candidates each via Gemini `gemini-3-pro-image-preview`, stores image URLs in Vercel Blob, updates state per entity.
- Job queue: **Inngest**. Reference generation is parallelisable across entities; serverless functions can't sustain the duration. Don't try to cram this into a Vercel function.
- New UI route `/storyboard/[id]/references` showing each entity as a card with: name, full description, 4 candidate images in a 2x2 grid, "Approve" / "Regenerate all 4" / "Edit description" buttons.
- "Edit description" lets the user tweak the Bible description and trigger regeneration. The edited description writes back to the storyboard's parsed_json so all downstream stages use the corrected version.
- Storyboard-level "Generate shots" button gated on every entity having `status: approved`.
- Optional: file upload to override a reference still with a user-supplied image (for actor likeness, mood-board references). Skip for v1 unless time allows.

**Done when:** Paul can take a parsed Leo storyboard, generate references for Leo + the dolphin + the kite + both locations, approve them, and the system stores the locked references keyed to entity IDs.

### Session 4 — Shot key frame batch generation

**Status:** Not started.

**Scope:** Once references are approved, batch-generate shot key frames using Gemini Nano Banana Pro with the relevant reference stills as conditioning images.

**Specifically:**

- New API route `POST /api/storyboard/[id]/shots` that fans out per shot via Inngest.
- For each shot, the call to Gemini includes:
  - The shot's `key_frame_prompt` (parser-derived, motion-stripped, ready for stills).
  - Conditioning images: every approved reference still for entities in `shot.continuity` (characters, location, story-critical props). Cap at 4 conditioning images per call (Nano Banana Pro supports up to 8 but quality plateaus around 4).
  - Aspect ratio from `style_lock.aspect_ratio`.
- New UI route `/storyboard/[id]/shots` showing the 14-panel storyboard layout: each panel is the key frame with shot metadata (number, function, dialogue, duration) beside it. Cards have a "Regenerate" button.
- Failure handling: if Gemini rejects a prompt (content filter, ambiguity, NSFW false positive), surface the failure with the suggested fix from the API and let the user edit the prompt or skip the shot.
- Progress indicator: "8 of 14 shots generated" with a real-time update.

**Done when:** Paul can go from script → approved references → 14 generated panels in a single workflow, total wall time under 10 minutes for a typical storyboard.

### Session 5 — Web share link + PDF export

**Status:** Not started.

**Scope:** Make storyboards shareable as web links (no auth needed by recipient — public URL with a UUID slug) and exportable as PDFs.

**Specifically:**

- New public route `/share/[uuid]` that renders a storyboard without the password gate. Recipients see the same panel layout, can scroll, click panels to expand, but cannot regenerate or edit.
- "Copy share link" button on the editor view.
- "Download PDF" button on both editor and share views.
- PDF generation: server-side, using a templated layout. Each panel gets one page (or 2-up for compact density). Top of each page: shot number, function. Centre: the key frame image. Below: scale, camera, location, duration, dialogue (if any), sound design notes.
- PDF generation runs as an Inngest job — not in the request path — and the user gets a download link by email or polling.
- Cover page: title, format, total duration, narrative arc paragraph, style lock summary. Last page: followability audit.

**Done when:** Paul can share a Loomer link with a client and they see the storyboard, plus download a PDF version that's print-ready.

---

## 3. Architectural decisions (non-negotiable without explicit review)

These are conclusions from extended reasoning sessions. Don't reverse them silently.

### 3.1 The storyboard skill stays as the thinking layer

The skill (`skills/storyboard/`) produces rich markdown optimised for cinematic reasoning. **Do not** modify the skill to output JSON natively. Forcing JSON output during the cinematic-grammar pass measurably degrades output quality (we saw this exact failure mode in HORIZON v1).

The pipeline pattern is:
1. Claude with the skill produces markdown (thinks in prose).
2. A separate Claude call with structured outputs extracts JSON from the markdown.

Two calls. The cost is small. The quality lift is large.

### 3.2 The parser produces TWO derived prompt fields per entity

Beyond verbatim extraction, the parser generates:

- `reference_still_prompt` on each Bible entity — a neutral-lit, plain-background, front-three-quarter version of the description, optimised for canonical reference generation.
- `key_frame_prompt` on each shot — derived from the Veo prompt with motion verbs and audio stripped, optimised for still-image generation.

These are produced **at parse time** by the same Claude call doing extraction. Don't move them to generation time; don't make them deterministic transforms. The model needs the full context to generate them well, and parse time is when it has that context.

### 3.3 Two-Bible-description architecture

Every Bible entity has both `full_description` (rich, scene-aware, used for shot prompts) and `reference_still_prompt` (neutral, plain, used for reference generation). They are NOT the same. Don't unify them; they serve different stages with different requirements.

### 3.4 Reference stills are generated, then locked, then conditioned

The pipeline is:
1. Generate 4 candidates per Bible entity.
2. User picks one (or regenerates, or uploads their own).
3. Once approved, that image becomes the **locked reference** for that entity.
4. Every subsequent shot generation that references that entity passes the locked reference as a conditioning image to Gemini.

The lock is what produces consistency. Without it, every shot is a fresh roll of the dice. **The approval gate is the single most important UX moment in the app.**

### 3.5 Gemini Nano Banana Pro for v1, direct API

We use Google's `gemini-3-pro-image-preview` (Nano Banana Pro) for both reference stills and shot key frames in v1. Reasons:

- Best multi-image conditioning in market (up to 8 reference images per call).
- Explicitly designed for storyboard / multi-reference workflows by Google.
- Best character consistency in current generation models.
- $0.134/image is noise at v1 volumes (~$5/storyboard total).

We use the **direct Google Gemini API** with the official `@google/genai` SDK. Not Vercel AI Gateway, not Replicate, not any third-party proxy. Direct. Reasons: lowest latency, full feature access (multi-image conditioning especially), one fewer billing surface.

We may expose a model switch later (`gemini-3.1-flash-image-preview` for cheaper, `gemini-2.5-flash-image` for cheapest) but v1 ships with Pro hard-coded.

### 3.6 Inngest for job queues

Reference still generation and shot key frame generation both involve fan-out across multiple entities/shots, with each generation taking 5-30 seconds. This exceeds Vercel function timeouts. Use **Inngest** for these workflows.

Why Inngest over alternatives:
- Native Vercel integration (one-line install).
- Free tier covers v1 volumes comfortably.
- Durable workflows handle partial failures cleanly.
- Step functions make it easy to chain "generate references" → "wait for approval" → "generate shots".

Don't use BullMQ (needs Redis), don't use SQS (more setup), don't try Vercel Cron (wrong tool). Inngest.

### 3.7 Sonnet 4.5 for the parser, not Opus

The parser is structurally simple — extract from a known markdown shape into a known schema. Sonnet 4.5 with strict tool-use schemas is fast (15s typical), cheap ($0.10-0.20 per parse), and reliable. Opus is overkill and 5x more expensive.

If we ever see real quality issues in extraction (which we'd surface via integrity warnings), we can switch. Until then: Sonnet.

### 3.8 Postgres via Prisma, hosted on Vercel

For v1: Vercel Postgres (or Supabase if Vercel Postgres pricing changes unfavourably) accessed via Prisma. The data model is tabular and relational; SQL is the right fit. Don't use Mongo, don't use Convex, don't store JSON blobs in disk files.

Schema sketch:

```prisma
model Storyboard {
  id              String   @id @default(uuid())
  title           String
  source_input    String   @db.Text
  source_markdown String   @db.Text
  parsed_json     Json     // The full ParsedStoryboard from session 1
  status          StoryboardStatus
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  
  bibles          BibleEntity[]
  shots           Shot[]
}

model BibleEntity {
  id              String   @id @default(uuid())
  storyboard_id   String
  storyboard      Storyboard @relation(fields: [storyboard_id], references: [id], onDelete: Cascade)
  entity_id       String   // CHAR-LEO, LOC-PIER, etc.
  entity_type     EntityType
  full_description String  @db.Text
  reference_still_prompt String @db.Text
  status          ReferenceStillStatus
  selected_url    String?
  candidate_urls  String[] // Array of URLs
  user_uploaded   Boolean  @default(false)
  generated_at    DateTime?
  approved_at     DateTime?
  regeneration_count Int   @default(0)
  
  @@unique([storyboard_id, entity_id])
}

model Shot {
  id              String   @id @default(uuid())
  storyboard_id   String
  storyboard      Storyboard @relation(fields: [storyboard_id], references: [id], onDelete: Cascade)
  shot_number     Int
  veo_prompt      String   @db.Text
  kling_prompt    String   @db.Text
  key_frame_prompt String  @db.Text
  shot_data       Json     // The full Shot object from parsed_json
  
  key_frame_status KeyFrameStatus
  key_frame_url    String?
  generated_at     DateTime?
  failure_reason   String?
  regeneration_count Int   @default(0)
  
  @@unique([storyboard_id, shot_number])
}

enum StoryboardStatus {
  DRAFT
  PARSED
  REFS_PENDING
  REFS_APPROVED
  SHOTS_GENERATING
  COMPLETE
  FAILED
}

enum EntityType { CHARACTER LOCATION PROP }
enum ReferenceStillStatus { PENDING GENERATING REVIEW APPROVED REJECTED }
enum KeyFrameStatus { PENDING GENERATING REVIEW APPROVED FAILED }
```

This schema lives in `prisma/schema.prisma`. **Single source of truth for data shape**. The Zod schemas in `src/schema/storyboard.ts` should mirror this — when one changes, the other must change to match.

### 3.9 Vercel Blob for image storage

Reference stills, candidate stills, and shot key frames go in Vercel Blob. Public URLs. No CDN fronting (Vercel Blob is already CDN-fronted). Naming convention: `{storyboard_id}/refs/{entity_id}/{candidate_index}.png` and `{storyboard_id}/shots/{shot_number}.png`.

### 3.10 Single-user password gate, not full auth

For v1: a single `LOOMER_PASSWORD` env var. Middleware checks for an `auth` cookie; if missing or wrong, prompts for password; if correct, sets cookie for 30 days. No user accounts, no email, no providers.

When the agency wants this multi-user, swap the middleware for Clerk in 30 minutes. Don't pre-build for that case.

---

## 4. Code conventions

### 4.1 TypeScript strict mode

`tsconfig.json` already has strict mode on with `noUncheckedIndexedAccess`. Don't relax these. If TypeScript flags an array access as `possibly undefined`, fix the access pattern (assign to a variable, guard with `if`), don't disable the rule.

### 4.2 ESM throughout

The project is `"type": "module"`. Use ESM imports. Use `.js` extensions in import paths (TypeScript convention for NodeNext resolution — yes, even though the source is `.ts`).

### 4.3 No `any` without comment

If you find yourself reaching for `any`, it's almost always a sign of a type modeling gap. The two places it's currently used — both in `02-parse.ts` for the JSON Schema output cast and an error response — are commented and intentional. Don't add more without an explanatory comment.

### 4.4 Zod for runtime validation, types derived from schemas

Don't write parallel TypeScript types and Zod schemas. Define the Zod schema, derive the type with `z.infer<typeof Schema>`. Single source of truth.

### 4.5 Server components by default, client only when needed

In the Next.js app: every component is a server component unless it explicitly needs `useState`, `useEffect`, or event handlers. Mark client components with `'use client'`. Don't reach for client components by default.

### 4.6 Routes are colocated with their UI

App Router pattern. The route `/storyboard/[id]/references` lives at `app/storyboard/[id]/references/page.tsx`. Loading state at `loading.tsx`, error boundary at `error.tsx`. Don't centralise routes.

### 4.7 API routes use Next.js Route Handlers

`app/api/storyboard/route.ts` for `POST /api/storyboard`. Use `Request` / `Response` directly, return JSON via `NextResponse.json()`. Don't pull in Express patterns.

### 4.8 Error responses follow a consistent shape

Every API error response: `{ error: string, details?: unknown, code?: string }`. Status codes: 400 for validation, 401 for auth, 404 for not found, 500 for unexpected.

### 4.9 Database access via Prisma client only

Don't write raw SQL. If a query is genuinely too complex for Prisma, talk about it before adding raw SQL. The data model isn't complex enough to need it.

### 4.10 Tests live next to source files

`storyboard.ts` and `storyboard.test.ts` in the same directory. Don't create a parallel `tests/` tree. Use Vitest (faster than Jest, better ESM support).

### 4.11 Commit messages follow Conventional Commits

`feat: add reference still approval UI`, `fix: handle null DP reference in style lock`, `chore: bump @anthropic-ai/sdk to 0.30.1`. Keep the subject line under 72 characters. Body if needed for context.

### 4.12 Commit per logical unit, not per file

A logical unit is "one feature added" or "one bug fixed" or "one refactor done." Don't commit every file save. Don't bundle unrelated changes in one commit.

---

## 5. Project structure (target)

This is what the repo should look like by end of Session 5:

```
loomer/
├── README.md
├── CLAUDE.md                          ← Operating instructions for Claude Code
├── docs/
│   ├── PROJECT_BRIEF.md               ← This file
│   └── decisions/                     ← ADRs for any new architectural decision
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── prisma/
│   └── schema.prisma                  ← Database schema (source of truth for data shape)
├── src/
│   ├── schema/
│   │   └── storyboard.ts              ← Zod schemas (mirror of Prisma schema)
│   ├── prompts/
│   │   ├── parser-system.ts           ← System prompt for the parser
│   │   └── reference-still-system.ts  ← (Future) System prompt for reference still generation
│   ├── pipeline/
│   │   ├── 01-generate.ts             ← Run the storyboard skill via Claude API
│   │   ├── 02-parse.ts                ← Parse markdown to ParsedStoryboard
│   │   ├── 03-references.ts           ← Generate Bible reference stills
│   │   └── 04-shots.ts                ← Generate shot key frames
│   ├── lib/
│   │   ├── anthropic.ts               ← Anthropic SDK wrapper
│   │   ├── gemini.ts                  ← Google GenAI SDK wrapper
│   │   ├── blob.ts                    ← Vercel Blob wrapper
│   │   ├── db.ts                      ← Prisma client singleton
│   │   └── inngest.ts                 ← Inngest client + workflow definitions
│   └── components/
│       ├── ui/                        ← shadcn/ui components
│       ├── storyboard/                ← Storyboard-specific components
│       └── shared/                    ← Shared UI bits
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       ← Empty state / paste script
│   ├── api/
│   │   ├── storyboard/
│   │   │   ├── route.ts               ← POST: create storyboard
│   │   │   └── [id]/
│   │   │       ├── route.ts           ← GET: storyboard by id
│   │   │       ├── parse/route.ts     ← POST: trigger parser
│   │   │       ├── references/route.ts ← POST: trigger reference generation
│   │   │       └── shots/route.ts     ← POST: trigger shot generation
│   │   ├── inngest/route.ts           ← Inngest webhook handler
│   │   └── auth/route.ts              ← Password gate cookie set
│   ├── list/
│   │   └── page.tsx                   ← All storyboards list
│   ├── storyboard/
│   │   └── [id]/
│   │       ├── page.tsx               ← Markdown view + parsed JSON debug
│   │       ├── references/page.tsx    ← Reference still approval grid
│   │       └── shots/page.tsx         ← Shot panel grid
│   └── share/
│       └── [uuid]/page.tsx            ← Public read-only storyboard view
├── scripts/
│   ├── parse-test.ts                  ← CLI: parse a markdown file
│   ├── schema-test.ts                 ← Zod schema validation tests
│   └── check-schema-output.ts         ← Inspect JSON Schema output
├── skills/
│   └── storyboard/                    ← The unpacked storyboard skill
│       ├── SKILL.md
│       └── references/
│           ├── arijon-grammar.md
│           ├── narrative-followability.md
│           └── ... (etc)
└── samples/
    └── leo-and-the-dolphin.md         ← Reference fixture
```

---

## 6. Cost model

For one typical 14-shot storyboard:

| Stage | API | Volume | Cost |
|-------|-----|--------|------|
| Generate | Anthropic Sonnet 4.5 | ~50k tokens (skill loaded) | $0.30 |
| Parse | Anthropic Sonnet 4.5 | ~30k tokens | $0.15 |
| References | Gemini Nano Banana Pro | ~5 entities × 4 candidates = 20 images | $2.68 |
| Shot key frames | Gemini Nano Banana Pro | ~14 shots × 1.3 (with regens) ≈ 18 | $2.41 |
| **Total** | | | **~$5.50** |

Optional: PDF export adds ~$0.05 (server-side rendering, no API).

Volume target for v1: 50 storyboards / month internal usage = ~$275/month API cost. Under the agency's discretionary spend threshold.

---

## 7. Failure modes to design for

### 7.1 Skill doesn't trigger

If the user pastes a script and the storyboard skill doesn't fire (description didn't match well), the API returns regular Claude prose instead of a structured storyboard. **Detect this** — check whether the response contains the expected markdown structure (e.g., presence of "## Continuity Bible" and "### Shot 01"). If not, surface a clear error: "Skill didn't trigger. Try rephrasing your prompt with the word 'storyboard'."

### 7.2 Parser misses entities

The parser may extract a storyboard whose shots reference entities the parser didn't capture (the integrity check catches this and produces warnings). **Surface warnings prominently** in the UI — they're not blocking but the user should see them before approving references. If a critical warning is present (e.g., shot references entity not in Bible), require an explicit "Proceed anyway" confirmation.

### 7.3 Reference still generation fails for an entity

Gemini might refuse a prompt (content filter) or produce 4 unusable candidates. **Don't silently fail.** Surface a clear failure state in the entity card: "Gemini rejected this prompt — likely cause: [content filter detail]." Provide an "Edit description" button to let the user reword. Failed entities block the storyboard's "Generate shots" gate.

### 7.4 Shot generation fails for a single shot

Same content filter risk plus prompt ambiguity. **Don't roll back the whole batch.** The other 13 shots may have generated fine. Mark the failed shot with a clear failure state and let the user regenerate it individually after editing the prompt or simplifying.

### 7.5 User abandons mid-pipeline

A storyboard at status `REFS_PENDING` with the user gone away should remain resumable. Returning to the list view and clicking the storyboard should drop the user back at the references approval page exactly where they left off. **State machine progression must be durable** — every transition is a database update.

### 7.6 Conditioning images blow the Gemini context limit

Nano Banana Pro supports up to 8 reference images, but quality plateaus around 4 and large images can cause the call to fail. **Resize reference stills to 1024×1024 max before passing as conditioning** — Vercel Blob serves them at original size, but the Gemini wrapper should compress.

### 7.7 Inngest workflow gets stuck

A reference generation step that times out at the Gemini level should retry (Inngest does this automatically with exponential backoff up to 3 retries). If all retries fail, mark the entity as `REJECTED` with the failure reason and let the user manually retry.

---

## 8. UI / UX principles

### 8.1 The reference approval page is the most important screen

The whole pipeline's quality depends on the user picking good references. Design accordingly:

- Big candidate images (each at least 400px on the long side).
- The Bible description visible and editable inline.
- Clear approval state per entity (green checkmark when approved, grey when pending).
- Visible storyboard-level progress: "3 of 5 references approved."
- The "Generate shots" CTA is disabled until 100% approved, with a tooltip explaining why.

### 8.2 The shot panel page should feel like a storyboard

Each panel: the key frame image (fills the available width), shot number top-left, shot function as a one-line caption below the image, then a metadata block underneath (scale | camera | location | duration | dialogue if any).

Layout: 3-column grid on desktop, 1-column on mobile. Aspect ratio of the panel should match the storyboard's aspect ratio (16:9, 9:16, etc).

### 8.3 Loading states are real states

Don't show a spinner alone. Show what's happening: "Generating reference for Maya... (1 of 5)". Show partial results as they come in. A 10-minute generation with no feedback feels broken.

### 8.4 Errors are dialogues, not endings

When something fails, show what failed, why, and what the user can do. Never "Something went wrong." Always: "Failed to generate Maya reference (Gemini content filter triggered on the word 'scrubs' — try 'medical uniform' instead). [Edit description] [Retry] [Skip this entity]".

### 8.5 Aesthetic: pastel-glassmorphic

Consistent with the PULSE dashboard. Rounded corners (16px panels, 12px cards). Soft glassmorphism on overlays. Pastel background tints (cream, soft pink, soft blue) zoned by section. Generous whitespace. No hard shadows; subtle blurs only. Type: Inter for UI, IBM Plex Mono for code/IDs/IDs in panels.

---

## 9. Quality bars

Before merging any session's work to main:

- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] `npx tsx scripts/schema-test.ts` passes (12/12 schema tests)
- [ ] `npm run lint` passes (no ESLint errors)
- [ ] Any new feature has at least one happy-path manual test passing
- [ ] If a new failure mode is introduced, it's listed in this brief's section 7
- [ ] If a new architectural decision is made, it's added to this brief's section 3 (or an ADR is added in `docs/decisions/`)
- [ ] Commit history is clean — no "wip" commits, no "fix typo fix typo fix typo" chains; squash before merge
- [ ] PR description explains what changed, why, and what to test

---

## 10. What to do when stuck

If Claude Code hits a blocker — an architectural question this brief doesn't answer, an integration issue with Gemini or Anthropic, a UX decision that has no clear right answer:

1. **Don't guess.** Open a draft PR with the work-in-progress, document the blocker in the PR description, and ping Paul.
2. **Don't reverse a decision in section 3 silently.** If you genuinely think a decision needs revisiting, write up the case in `docs/decisions/REVISIT-<topic>.md` and flag for human review.
3. **Don't ship workarounds.** If the right answer is "we need to use a different library" or "the data model needs reshaping," surface that. Workarounds become permanent.

The goal is a tool Paul will actually use to ship client work. Quality matters more than speed.

---

## Appendix A — Glossary

- **Bible** — The Continuity Bible from the storyboard skill: locked descriptions of every character, location, and story-critical prop. The pipeline's consistency depends on the Bible being injected verbatim into prompts.
- **Bible entity** — A single Bible entry. Identified by an ID like `CHAR-LEO`, `LOC-PIER-AFTERNOON`, `PROP-KITE`.
- **Reference still** — The canonical, locked image of a Bible entity. Generated once, approved by the user, then used as a conditioning image for every shot featuring that entity.
- **Key frame** — The single still image generated per shot, representing the shot's central moment. Loomer's deliverable is 14 (or however many) key frames assembled into a storyboard.
- **Conditioning image** — A reference image passed to Gemini alongside a text prompt. Gemini uses the conditioning images to keep characters / locations / props consistent with the locked references.
- **Style lock** — The look-and-feel spec applied to the whole storyboard (DP reference, lens default, colour grade, film stock, lighting register). Injected into every shot prompt.
- **Followability audit** — The skill's final pass that verifies every shot answers WHO/WHERE/WHAT/WHEN/WHY for the audience and surfaces deliberate withholdings and visual rhymes.
- **Arijon grammar** — Daniel Arijon's *Grammar of the Film Language* (1976). The cinematic continuity rules the storyboard skill encodes: line of interest, triangle principle, screen direction, eyeline matching, 30° rule, etc.
- **Veo prompt** — The full prompt for Google's Veo 3.1 video model. Paragraph form, 100-150 words, includes audio inline. Used if the user takes the storyboard to motion generation; not used by Loomer's stills pipeline directly.
- **Kling prompt** — The full prompt for Kuaishou's Kling 2.5+ video model. Structured (SUBJECT / ACTION / ENVIRONMENT / CAMERA / LIGHTING / STYLE). Same purpose as Veo.

## Appendix B — External references

- Storyboard skill: lives at `skills/storyboard/SKILL.md` in this repo.
- Anthropic API docs: https://docs.claude.com/en/api
- Anthropic tool use: https://docs.claude.com/en/api/tool-use
- Gemini Image API: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini multi-image conditioning: https://ai.google.dev/gemini-api/docs/image-generation#image-input
- Inngest Next.js quickstart: https://www.inngest.com/docs/getting-started/nextjs
- Vercel Postgres: https://vercel.com/docs/storage/vercel-postgres
- Vercel Blob: https://vercel.com/docs/storage/vercel-blob
- shadcn/ui: https://ui.shadcn.com
