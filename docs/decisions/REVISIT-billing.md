# REVISIT: Billing — credit packs so users fund their own generation

**Status**: Implemented (14 Aug 2026). Currency and VAT decided below.
**Date**: 2026-08-14
**Requested by**: Paul ("how can other people buy tokens… I'm not footing the bill")

## The problem

Every image and every parse currently bills to Paul's Google and Anthropic
keys. Auth (see `REVISIT-auth.md`) closed the *anonymous* exposure, but any
signed-up member can still spend without limit. Sharing the link with anyone
outside a small circle of trust is currently a direct financial liability.

## What this proposes

A prepaid credit system. Users buy credit packs; generation debits credits;
at zero, generation refuses. Credits are sold at roughly **2× blended API
cost**, so the margin covers the Google bill with the remainder to Paul.

### Why credits and not raw token pass-through

1. **Insulation from price changes.** Google reprices models regularly. If
   we sold "tokens" at cost + markup, every price change is a pricing crisis.
   With credits we change the credit→image ratio and packs stay the same.
2. **Comprehensibility.** "This board will use 42 credits, you have 150" is
   legible. "This board will use 54,180 output tokens" is not.
3. **Prepaid caps the risk.** Money arrives before compute is spent. There is
   no scenario where a user runs up a bill we then have to chase.

## Unit economics

Measured API cost per image ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
Aug 2026):

| Model | Cost/image | Credits charged |
|---|---|---|
| `gemini-2.5-flash-image` | $0.039 | 1 |
| `gemini-3.1-flash-image` (1K) | $0.067 | 2 |
| `gemini-3-pro-image` (1K) | $0.134 | 3 |

Script parse (Claude Sonnet, ~$0.10/board): **2 credits**.

Packs (GBP, assuming ~1.26 USD/GBP — see open questions):

| Pack | Credits | Effective $/credit | Blended margin |
|---|---|---|---|
| £10 | 150 | ~$0.084 | ~2.15× on Flash |
| £25 | 400 (+7% bonus) | ~$0.079 | ~2.02× |
| £50 | 850 (+13% bonus) | ~$0.074 | ~1.90× |

A typical 24-shot board is ~40 images (16 reference candidates + 24 frames)
plus a parse — **~42 credits**. So the £10 pack is about three and a half
boards; it costs roughly $1.70 in API spend and returns roughly £2.85 of
revenue per board.

Note the Pro tier at 3 credits is slightly *under*-priced relative to Flash
(1.87× vs 2.15×) because credits must be integers. Acceptable — it nudges
users toward the cheaper model, which is also the faster one.

**Stripe fees** are ~1.5% + 20p on UK domestic cards, so ~3.5% on a £10
pack. This is why £10 is the minimum pack — below that, fees eat the margin.

## Data model

```prisma
model CreditLedger {
  id          String   @id @default(uuid())
  user_id     String
  user        User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  // Positive = credits added (purchase, grant, refund).
  // Negative = credits consumed (generation).
  delta       Int
  reason      String   // purchase | grant | signup_bonus | debit | refund
  // Provenance: Stripe payment intent, or storyboard+shot for a debit.
  stripe_ref    String?
  storyboard_id String?
  note        String?
  created_at  DateTime @default(now())

  @@index([user_id, created_at])
  @@map("credit_ledger")
}
```

Append-only. Balance is `SUM(delta)` for the user. Never a mutable
`balance` column — a single lost update there means either giving away
compute or taking credits a user paid for.

`User` gains:
- `auto_reload_pack` (`String?`) — pack ID to recharge with, null = off.
- `auto_reload_threshold` (`Int`, default 25) — recharge below this.
- `stripe_customer_id` (`String?`) — saved card for off-session charges.

## Flow: spending

1. Pre-flight — the generate button shows estimated cost against balance.
2. **Debit before the API call**, inside the same transaction that marks the
   frame `generating`.
3. On failure, write a compensating `refund` entry. Users never pay for
   errors — this matters more than it sounds, because a failed render is
   exactly when someone is most annoyed.
4. At zero, the route returns `402` with a `code: 'INSUFFICIENT_CREDITS'`;
   the UI opens the top-up sheet inline rather than dumping them to an error.

Admins are exempt from debits (Paul's own use stays free, and the ledger
records the exemption so usage is still visible).

## Flow: buying

- **Stripe Checkout** in hosted mode. No card details ever touch Loomer.
- The `checkout.session.completed` webhook writes the ledger entry. Purchases
  are credited by webhook, never by the browser redirect — a user closing the
  tab must not lose credits they paid for.
- Webhook idempotency: unique constraint on `stripe_ref` so a replayed event
  can't double-credit.
- **Auto-reload**: with a saved card, when a debit drops the balance below
  the threshold, charge the pack off-session. Runs mid-generation without
  interrupting it. Opt-in at first purchase, receipt emailed each time,
  switchable off in settings. This is the "never run out" mechanism.
- If an auto-reload charge fails (expired card), generation continues on
  remaining credits and the UI shows a persistent banner. We do not hard-stop
  someone mid-board over a declined card.

**Signup bonus**: 30 credits, enough for one small board. Without it, the
first-run experience is a paywall before anyone has seen the tool work.

## The dependency question

Stripe is not in the approved list in `CLAUDE.md`. Two routes:

1. **`stripe` npm package** — official SDK, typed, handles webhook signature
   verification. One dependency, well-maintained. **Recommended.**
2. **Dependency-free** — hosted Checkout links via REST, webhook signatures
   verified with `node:crypto` HMAC (the same approach as our session
   cookies). No new dependency, maybe 150 extra lines, and we own the
   signature-verification correctness.

Route 1 is recommended: payment code is the wrong place to hand-roll
signature verification to save one dependency. But route 2 is genuinely
viable and matches the auth precedent, so it's Paul's call.

No alternative provider is proposed. Paddle/Lemon Squeezy act as merchant of
record and handle VAT, which is attractive, but both take a significantly
larger cut and neither is in the stack.

## Decisions taken

- **Currency: GBP.** Packs are £10/£25/£50 (150/400/850 credits). API costs are
  in USD, so an adverse FX move compresses margin. Paul accepted that risk
  explicitly rather than pricing in USD.
- **VAT: not collected, deliberately deferred.** Paul's call, risk accepted and
  documented. Stripe Tax can be switched on later without touching the credit
  ledger — the grant path doesn't care what was charged, only that it settled.
- **Stripe SDK, not hand-rolled.** Webhook signature verification is the wrong
  place to save a dependency.

## What was built

- `src/lib/stripe.ts` — packs (GBP, in pence), client, customer creation.
- `POST /api/billing/checkout` — hosted Checkout session. Optionally saves the
  card (`setup_future_usage: off_session`) so auto top-up can charge it.
- `POST /api/billing/webhook` — **the only place a purchase grants credits.**
  Verifies the signature against `STRIPE_WEBHOOK_SECRET`, reads the raw body
  (a reserialised body fails verification), and grants with
  `payment_ref = stripe:<event.id>`. That column is unique, so Stripe's retries
  are no-ops rather than double payouts.
- `src/lib/auto-reload.ts` — off-session charge when a debit drops the balance
  below the user's threshold. Never awaited by the debit path and never throws:
  a card problem must not fail the render that triggered it. It charges but
  never grants — the credit still arrives by webhook, with the same idempotency.
  A decline is recorded and backed off for six hours.
- `GET/POST /api/billing/auto-reload` — settings.
- Billing UI: real purchase buttons, save-card opt-in, auto top-up controls.

## Risks and open questions

- **VAT is not being collected.** Decided, not forgotten. Selling digital
  services to consumers carries obligations that vary by buyer location; at
  low volume the exposure is small, but it grows with revenue and is not
  retroactively cheap to fix. Revisit before any real marketing push.
- **FX.** GBP prices against USD costs. Margin moves with the rate; the pack
  sizes are the lever if it drifts.
- **`stripe_customer_id` is not unique in the database.** Adding a unique
  constraint to an existing table makes `prisma db push` demand
  `--accept-data-loss`, which would fail the Vercel build. Only `ensureCustomer`
  writes it, once per user.
- **Refunds.** No self-serve refund flow proposed. Manual via the Stripe
  dashboard plus an admin ledger grant.
- **Credit expiry.** None proposed. Expiring prepaid credits is a common
  source of complaints and, in some jurisdictions, a consumer-rights problem.
- **Cost drift.** If Google raises prices, margin silently erodes. Mitigation:
  an admin dashboard showing realised cost vs revenue per board, so the ratio
  is observable rather than assumed.
- **Regeneration costs are user-driven.** Someone regenerating a frame twenty
  times spends twenty credits. That's correct — but the UI should make the
  per-click cost visible so it doesn't feel like a trap.

## What ships if approved

1. `CreditLedger` model + `src/lib/credits.ts` (`getBalance`, `debit`,
   `refund`, `grant`) — pure, unit-tested, no Stripe knowledge.
2. Debit/refund wired into `generate-refs`, `generate-shots`, `regen-shot`,
   `regen-ref`, `parse`.
3. `app/api/billing/checkout` + `app/api/billing/webhook`.
4. Balance pill in the header, top-up sheet, pre-flight estimate on generate,
   auto-reload settings, ledger history page.
5. Admin: grant credits, view per-user usage and realised margin.

Sequenced so step 1–2 can ship alone if Paul wants the spending gate live
before payments are wired up.
