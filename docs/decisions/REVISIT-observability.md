# REVISIT: Observability — Sentry for error monitoring

**Status**: Implemented
**Date**: 2026-08-14
**Requested by**: Paul ("is Sentry linked up to this project? If not can we add")

## Why

Until now a production 500 was invisible unless someone was tailing Vercel logs
at the moment it happened — failures were discovered by a user noticing a board
didn't render. With accounts open and credits letting other people generate,
silent failures now cost real money and goodwill.

`@sentry/nextjs` is a new dependency, not in `CLAUDE.md`'s approved list. It
earns its place: there is no other way to see a server error after the fact, and
the alternative (log-scraping) is not a product Paul will actually check.

## What was added

- `sentry.server.config.ts` — Node runtime init, loaded via `instrumentation.ts`.
- `instrumentation-client.ts` — browser init (Next 15.3+ auto-loads it).
- `instrumentation.ts` — `register()` plus `onRequestError`, which is the only
  way server-component and route-handler errors get captured.
- `app/global-error.tsx` — catches root-layout render errors, which never reach
  the server SDK.
- `next.config.ts` — wrapped in `withSentryConfig`.
- `/api/debug-sentry` — admin-only smoke test that fires a real event.

**No Edge config.** This app deliberately runs nothing on the Edge runtime
(see `REVISIT-auth.md` on why middleware was removed), so an edge init file
would be dead weight.

## Scrubbing — the part that matters

Storyboards carry unreleased client work: scripts, brand names, treatments. An
error report is exactly where that leaks, because request bodies and breadcrumbs
ride along with the stack trace by default.

`src/lib/sentry-scrub.ts` is deny-by-default:

- **Request bodies are dropped wholesale.** Not filtered — dropped. `/api/storyboard`
  takes the entire pasted script as its body; there is no version of that worth
  sending to a third party.
- Cookies and auth headers are stripped (`loomer-session` would otherwise be a
  session-hijacking token sitting in an issue feed).
- Keys matching script/prompt/credential names are redacted recursively.
- Any string over 500 characters is replaced with a length marker — the catch-all
  for prompt content arriving through a field we didn't anticipate.
- `sendDefaultPii: false`, and the user object is reduced to an id.
- **Session Replay is off.** It would record the script being typed and the
  frames on screen.

## Cost of the client SDK

The browser bundle grew from 102 kB to 188 kB on first load. Tree-shaking the
tracing integration (`__SENTRY_TRACING__: false` in `next.config.ts`, client
build only) brought it back to **136 kB** — a net **+34 kB**. Client tracing is
therefore off (`tracesSampleRate: 0`); server-side tracing still samples at 5%.

That 34 kB is the price of client-side error reporting. If it ever matters more
than the visibility does, the client init can be dropped and server-only
monitoring kept.

## What Paul needs to do

1. Create a project at sentry.io (Next.js platform).
2. In Vercel → Settings → Environment Variables, set `SENTRY_DSN` and
   `NEXT_PUBLIC_SENTRY_DSN` to the same DSN value.
3. Optionally add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` so source
   maps upload and stack traces are readable rather than minified.
4. Visit `/api/debug-sentry` while signed in as admin — it reports whether the
   DSN is live and fires a test event.

Until step 2, the SDK is inert. Builds and requests work exactly as before.

## Known limitations

- **No alerting configured.** Sentry's defaults email on new issues; tuning
  (Slack, thresholds, ownership rules) is a dashboard task, not a code one.
- **`tunnelRoute: '/monitoring'`** proxies browser events through the app's own
  domain so ad blockers don't drop them. It also means those requests count
  toward Vercel function invocations.
- **Source maps are deleted after upload**, so the deployed bundle can't be
  un-minified by a visitor.
- No performance budget or release health tracking — errors only, for now.
