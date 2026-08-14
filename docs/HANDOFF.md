# Handoff — 14 Aug 2026

Written at the end of a session that added frame deletion, a credit system, named
director styles, and a global nav. Read `CLAUDE.md` first for the operating rules
and `PROJECT_BRIEF.md` (repo root, **not** `docs/` — see Loose ends) for architecture.

**Live**: https://loomer-eight.vercel.app
**Branch**: `claude/verify-session-1-tests-8d0Zg`, also pushed to `main` (deployed)
**Build sessions**: 1–5 all shipped. Work since then is post-roadmap.

---

## 1. What shipped this session

| Commit | What |
|---|---|
| `1af4feb` | Delete a frame from a board |
| `a131540` | `docs/decisions/REVISIT-billing.md` — credit-pack proposal |
| `46dc832` | Credit ledger + spending gate |
| `78dd9ae` | Named director styles (up to 4 images, 5 per account) |
| `3e5a2d1` | Burger menu — Projects / How it works / Billing / Styles |
| `2728e6a` | Back-fill starter credits for pre-ledger accounts |

Earlier the same day: the coffee-break wait card with rotating film facts
(`fbe5764`), holding each fact 28s (`097aaf5`).

---

## 2. Credits — how it works

**The point**: members fund their own generation so the owner isn't paying
everyone's Gemini bill. `docs/decisions/REVISIT-billing.md` holds the pricing
rationale and unit economics; keep it in step with the code.

- `src/lib/credits.ts` is the whole model. It knows nothing about payments —
  only how to move credits.
- `CreditLedger` is **append-only**. Balance is always `SUM(delta)`. Do not add
  a mutable balance column; a lost update there either gives away compute or
  eats credits someone paid for.
- **Debit before the API call, refund what fails.** Batch routes charge for the
  planned run and refund the shortfall in a `finally` block. Single-image routes
  refund on the error path. Users must never pay for a failed render.
- Costs: 1 credit per Flash image, 2 for Flash 3.1, 3 for Pro, 2 per script
  parse. Unknown models fall back to the top rate — fail expensive, not cheap.
- Admins are exempt (`isExempt`), but their usage is still visible in history.
- At zero, routes return **402** with `code: 'INSUFFICIENT_CREDITS'`. The
  workspace catches this and shows a top-up banner rather than an error.
- `ensureStarterCredits` is idempotent on a unique `payment_ref` and runs before
  every debit, so accounts predating the ledger aren't locked out at zero.

Wired into: `generate-refs`, `generate-shots`, `regen-shot`, `regen-ref`, `parse`.
**Any new route that spends API budget must debit too** — that's the whole gate.

### Not built: payments

Checkout does not exist. Credits are handed out by hand at `/billing` (admin
section). Three decisions block the build, all in the REVISIT doc:

1. **VAT** — selling digital services to consumers carries obligations that vary
   by buyer country. Stripe Tax can calculate it; registration is real-world
   admin. Most likely thing to be overlooked.
2. **Currency** — packs drafted in GBP against USD API costs; FX moves squeeze
   margin. Pricing in USD removes it but reads oddly to UK clients.
3. **Stripe SDK vs dependency-free** — recommendation is the official package;
   hand-rolling webhook signature verification to save a dependency is a bad
   trade in payment code. The dependency-free route matches the auth precedent.

A Stripe MCP connection appeared in the session after this was written — worth
checking whether it changes the SDK-vs-manual calculus.

When payments do land: credit purchases by **webhook, never by browser
redirect**, and rely on the `payment_ref` unique constraint for idempotency.
`grant()` already supports this.

---

## 3. Styles

`Style` = a name plus up to 4 reference images. Five per account, enforced in the
API (`src/lib/styles.ts` holds both caps).

- `/styles` manages them; the generation picker is a carousel — Photoreal,
  Watercolour sketch, then saved styles with thumbnail strips.
- `loadStyleImages()` resolves what to condition on: the named style if set,
  else the legacy `style_ref_url` for boards predating this. Images that fail to
  fetch are dropped rather than failing the run.
- The old single-image upload UI and its route are **gone**. The column stays as
  a read fallback only — don't write to it.
- Deleting a style doesn't break boards using it (`onDelete: SetNull`); they fall
  back to the house style.

**Watch**: a 4-image style adds 4 inline images to *every* generation call. On a
large board that will be noticeably slower than the old single image. If it
drags, cap conditioning at 2–3 images for key frames while keeping 4 for
reference stills.

---

## 4. Nav

`app/(protected)/NavMenu.tsx`, mounted in the protected layout, so it's on every
signed-in page. Projects / How it works / Billing / Styles, plus email, live
balance and sign out. "How it works" links to `/?how=1`, which opens the existing
modal in the workspace rather than duplicating the content.

The list page's standalone sign-out button was removed — the menu carries it.

---

## 4b. Error monitoring

Sentry is wired up and **live in production** — server, browser and root-layout
errors all report. `src/lib/sentry-scrub.ts` drops request bodies wholesale
(the pasted script is a request body), strips cookies and auth headers, and
truncates any string over 500 chars. Session Replay is deliberately off.

Client tracing is tree-shaken out (`__SENTRY_TRACING__: false` in
`next.config.ts`), holding the browser cost to +34 kB.

`/api/debug-sentry` is an admin-only smoke test; `?throw=1` exercises the
automatic capture path. Full write-up: `docs/decisions/REVISIT-observability.md`.

## 5. Loose ends and gotchas

- **`npm run lint` is broken** and was already broken before this session.
  `next lint` passes flat-config options that the installed ESLint 8.57.1
  rejects (`Unknown options: useEslintrc, extensions, …`), exit code 1. The
  pre-commit checklist in `CLAUDE.md` mandates it, so this needs fixing —
  likely migrating to `eslint` 9 + `@typescript-eslint` v8, or pinning
  `next lint` to the legacy config path. **Everything this session was verified
  with `tsc --noEmit`, `scripts/schema-test.ts` and a full `next build`
  instead.**
- **`CLAUDE.md` points at `docs/PROJECT_BRIEF.md`; the file is at the repo
  root.** Either move it or fix the reference.
- **Deleted frames have no undo.** The blob is left in storage but unreferenced.
  If undo is wanted, soft-delete plus a toast is the shape.
- **No password reset.** Still true from the auth work. Admin resets a hash by
  hand. Blocks sharing beyond a handful of trusted people.
- **`SESSION_SECRET` may still be unset in Vercel** — sessions then sign with
  `LOOMER_PASSWORD`. Works, but set the dedicated secret.
- **Signup is open unless `SIGNUP_CODE` is set.** With credits in place the cost
  exposure is capped at 30 starter credits per account, but it's still open.
- Schema changes deploy via `prisma db push` in the build script. The new
  `credit_ledger` and `styles` tables land automatically.

---

## 6. Verifying a change

```bash
npx tsc --noEmit                  # must be zero errors
npx tsx scripts/schema-test.ts    # 10/10 (the count in CLAUDE.md is stale)
SKIP_ENV_VALIDATION=1 npx next build
```

Parser or schema changes additionally want a real API call:

```bash
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY npx tsx scripts/parse-test.ts samples/leo-and-the-dolphin.md
```

Manual smoke test for this session's work: sign in as a non-admin, confirm the
balance in the burger menu, save a style at `/styles`, pick it in the carousel,
generate a board, delete a frame, and check `/billing` history shows the debit
and any refunds.

---

## 7. Suggested next steps

1. Fix the lint setup — the pre-commit checklist is currently unenforceable.
2. Answer the three billing decisions, then build checkout + auto-reload.
3. Pre-flight cost estimate on the generate buttons ("this board will use ~42
   credits, you have 150"). Designed in the REVISIT doc, not built.
4. Admin cost dashboard: realised API cost vs credit revenue per board, so
   margin is observed rather than assumed.
5. Password reset, before sharing the link more widely.
