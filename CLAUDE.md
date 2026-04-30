# Operating Instructions for Claude Code

This file is read on every invocation. **Read `docs/PROJECT_BRIEF.md` before doing significant work** — this file is the operational summary; the brief is the architectural context.

## What this project is

**Loomer** — a storyboard-to-stills pipeline. Script in, web-shareable storyboard out, with PDF export. Uses the custom storyboard skill (in `skills/storyboard/`) for cinematic-grammar reasoning, Anthropic Claude Sonnet for parsing, and Google Gemini Nano Banana Pro for image generation.

Read `docs/PROJECT_BRIEF.md` section 1 for the full description.

## Build sessions

The build is structured into 5 sessions. Each session ships something testable end-to-end.

- **Session 1** — Parser foundation. **COMPLETE.** Lives at repo root.
- **Session 2** — Skeleton Next.js app on Vercel + Postgres. (Next up.)
- **Session 3** — Reference still generation + approval gate.
- **Session 4** — Shot key frame batch generation.
- **Session 5** — Web share link + PDF export.

When the user asks to "build session N," read `docs/PROJECT_BRIEF.md` section 2 for that session's full scope and done-when criteria.

Don't skip ahead between sessions. Each session lays groundwork for the next.

## Hard rules

These are non-negotiable. If you find yourself wanting to violate one, stop and ask.

1. **Don't modify the storyboard skill.** It lives at `skills/storyboard/` and is the thinking layer. Reverse-engineering it into TypeScript or simplifying it to "just produce JSON" is a known-bad path. See PROJECT_BRIEF.md section 3.1.

2. **Don't reverse decisions in PROJECT_BRIEF.md section 3 silently.** If you genuinely need to revisit a decision, document the case in `docs/decisions/REVISIT-<topic>.md` and surface it for human review. Don't just rewrite the code.

3. **Don't add `any` types without an explanatory comment.** Strict TypeScript is non-negotiable.

4. **Don't write raw SQL.** Use Prisma. If a query is too complex for Prisma, surface that as a discussion before adding raw SQL.

5. **Don't commit secrets.** No API keys in source. Always `.env` + `.env.example`. Always check `.gitignore` covers `.env`.

6. **Don't push to main directly.** Open a PR, even for small changes. The user reviews and merges.

7. **Don't bundle unrelated changes in one commit.** One logical unit per commit. If you find yourself writing "and also..." in a commit message, split the commit.

## Pre-commit checklist

Before every commit:

```bash
npx tsc --noEmit                       # TypeScript: zero errors
npx tsx scripts/schema-test.ts         # Schema tests: 12/12 passing
npm run lint                           # ESLint: zero errors  
```

If any of these fail, fix before committing. Don't commit broken code.

For commits that touch the parser or schema, additionally:

```bash
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx tsx scripts/parse-test.ts samples/leo-and-the-dolphin.md
```

This makes a real API call (~$0.10). The parsed output should have zero integrity warnings on the Leo storyboard. If new warnings appear after a parser change, investigate before committing.

## Commit style

Conventional Commits. Short, imperative, descriptive.

- `feat: add reference still approval grid`
- `fix: handle null DP reference in style lock`
- `chore: bump @anthropic-ai/sdk to 0.30.1`
- `refactor: extract Inngest workflow into pipeline/workflows.ts`
- `test: add coverage for Bible verbatim injection check`
- `docs: update PROJECT_BRIEF section 3.7 with Sonnet 4.5 cost data`

Subject line under 72 chars. Body if context is needed for the why.

## PR style

PR description must include:

1. **What** — one-sentence summary of the change.
2. **Why** — what problem this solves, or what session this advances.
3. **How to test** — manual steps the user can run to verify.
4. **Risks** — what could break, what's untested, what's deferred.

Tag the PR with the session number: `[Session 2]`, `[Session 3]`, etc.

If the PR doesn't fully complete a session, mark it as draft and explain in the description what's left.

## When stuck

Three valid moves, in order of preference:

1. **Re-read PROJECT_BRIEF.md.** The answer is often there. Section 3 (architectural decisions), section 7 (failure modes), and section 8 (UI principles) are the most-referenced sections.

2. **Open a draft PR with the work-in-progress.** Document the blocker in the PR description. Tag the user. Don't keep grinding on a problem that has multiple reasonable answers.

3. **Don't ship workarounds.** If the right answer is "we need a different library" or "the data model needs reshaping," surface that as a discussion. Workarounds become permanent.

## Code conventions (summary)

Full version in PROJECT_BRIEF.md section 4. Key points:

- TypeScript strict mode with `noUncheckedIndexedAccess`.
- ESM throughout. `.js` extensions in import paths.
- Zod schemas as source of truth, types derived with `z.infer`.
- Server components by default. Client components only when needed.
- App Router pattern: routes colocated with pages.
- API routes: `app/api/.../route.ts`, return `NextResponse.json()`.
- Errors: `{ error: string, details?: unknown, code?: string }`.
- Tests next to source files. Vitest, not Jest.

## Tools you have

- Anthropic API (`@anthropic-ai/sdk`) — for the storyboard skill calls and the parser.
- Google GenAI API (`@google/genai`) — for Gemini image generation.
- Prisma — for database.
- Inngest — for job queues.
- Vercel Blob — for image storage.
- shadcn/ui — for UI components.
- Tailwind — for styling.

Don't add libraries without strong justification. The dependency list in `package.json` is the canonical set.

## Tools you DON'T have (don't reach for these)

- Replicate — we use Gemini direct, not Replicate.
- BullMQ / SQS / other job queues — Inngest only.
- Cloudflare R2 — Vercel Blob only for v1.
- Supabase / Firebase / Convex — Postgres via Prisma only.
- Mongo / DynamoDB / any NoSQL — Postgres only.
- Auth providers (Clerk, Auth.js, etc.) — single-user password gate for v1.
- Express / Fastify / any other server framework — Next.js Route Handlers.

If you genuinely think one of these is needed, surface it as a discussion before installing.

## Project-specific conventions

### Bible entity ID format

- `CHAR-{NAME}` — e.g. `CHAR-LEO`, `CHAR-MAYA`. All caps, hyphens.
- `LOC-{PLACE}-{TIME}` — e.g. `LOC-PIER-AFTERNOON`. Time-of-day as a separate entity if visual differs.
- `PROP-{OBJECT}` — e.g. `PROP-KITE`, `PROP-PHOTOGRAPH`.

The IDs are user-facing in the UI. Don't normalise or rewrite them.

### Image storage paths in Vercel Blob

- Reference candidates: `{storyboard_id}/refs/{entity_id}/{candidate_index}.png`
- Selected reference: `{storyboard_id}/refs/{entity_id}/selected.png` (copied from chosen candidate)
- Shot key frames: `{storyboard_id}/shots/{shot_number}.png`

### Aspect ratios

`16:9`, `9:16`, `1:1`, `2.39:1`, `2.35:1`, `4:3`, `1.85:1`. The schema enforces this; don't add new ones without checking the storyboard skill supports them.

### Veo durations: 4, 6, 8 seconds only

Kling: 5, 10 seconds only. The schema enforces this. Don't relax it.

## When the user asks for something this file doesn't cover

Default to the principles in PROJECT_BRIEF.md, especially section 8 (UI principles) and section 9 (quality bars). When in doubt, optimise for: **a tool the user will actually use to ship client work to clients**. That's the success criterion.
