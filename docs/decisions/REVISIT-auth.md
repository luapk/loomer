# REVISIT: Auth — single-password gate → email accounts

**Status**: Implemented (superseding PROJECT_BRIEF's single-user password gate)
**Date**: 2026-07-04
**Requested by**: Paul (user accounts with email sign-in as the next roadmap step)

## What changed

The v1 auth decision was a single-user password gate (`LOOMER_PASSWORD`
compared against a cookie in the protected layout; API routes deliberately
unauthenticated). That was superseded by email + password accounts:

- `User` model (email unique, scrypt password hash, ADMIN/MEMBER role).
- HMAC-SHA256-signed session cookie (`loomer-session`, 30 days, httpOnly,
  secure in production). Secret: `SESSION_SECRET` env, falling back to
  `LOOMER_PASSWORD` so existing deployments work before the new var is set.
- **Every** `/api/storyboard*` route now requires a session and checks
  storyboard ownership (`src/lib/auth.ts` → `requireSession` +
  `assertStoryboardAccess`). This closes the open-API cost exposure: an
  unauthenticated caller can no longer spend Gemini/Anthropic budget.
- Storyboards carry `user_id`. Boards created before accounts existed are
  orphans (`user_id null`): admins see them, and the first signed-in user to
  open one claims it.
- Admin bootstrap: `paulknott@gmail.com` is hardcoded as an admin default;
  `ADMIN_EMAILS` (comma-separated) extends the list. Admins see and can act
  on every storyboard.
- Debug endpoints (`/api/debug-*`) are admin-only.

## Why not an auth provider

The hard rule against Clerk/Auth.js/etc. still stands — this implementation
is dependency-free (node:crypto scrypt + HMAC). If requirements grow to
magic links, OAuth, or password reset emails, revisit with a provider or an
email service (Resend) as a separate decision.

## Known limitations (accepted for this iteration)

- No password reset flow (no email sender configured). Admin can reset a
  hash manually in the DB if needed.
- Open signup: anyone reaching /login can create a MEMBER account. Members
  only ever see their own boards, but signups do get generation access —
  add an invite gate before sharing the URL beyond trusted people.
- Session revocation is expiry-only (rotate `SESSION_SECRET` to force
  global sign-out).
