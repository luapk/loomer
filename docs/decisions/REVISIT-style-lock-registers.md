# REVISIT — the style lock is now authoritative, and can carry registers

Status: implemented
Date: 2026-08-16
Touches: PROJECT_BRIEF.md §3 (architectural decisions), `src/schema/storyboard.ts`

## What changed

Two things, both to `StyleLockSchema` and its consumers.

**1. The style lock reaches the image model.**

`buildStyleDeclaration` in both generation routes took the style lock as
`_styleLock` — underscore-prefixed, deliberately unused — and emitted the
hardcoded `PHOTOREAL_STYLE` constant instead. Every photoreal shot on every
board got Loomer's house look regardless of what the storyboard skill had
written.

On a board whose lock asked for a Se7en aesthetic (crushed blacks,
near-monochrome, single hard overhead source), every prompt was prefixed with
"No teal-and-orange push. No crushed blacks. No HDR processing." The house
style did not merely fail to help — it contradicted the per-shot prompts on
every frame, and the skill's DP reference, film stock, grade, lighting register
and texture never reached the model at all.

The lock now wins. `src/lib/style-lock-prompt.ts` assembles the declaration
from the lock's own fields. `PHOTOREAL_STYLE` is the fallback for boards whose
lock is absent or too thin to describe a look (`hasUsableStyleLock`), which
keeps older and badly-parsed boards rendering as they do today.

The medium guard — "PHOTOREALISTIC PHOTOGRAPH, NOT an illustration…" — is
orthogonal to any particular look and is still appended unconditionally.
It's split out as `PHOTOREAL_MEDIUM_GUARD`.

**2. `style_lock.registers`.**

`StyleLockSchema` was single-valued. A board that declares two visual registers
— an interrogation act in cold near-monochrome that resolves into warm daylight
for the last third — could only carry one of them, so every shot rendered in the
same grade and the tonal shift the script is built around never happened.

`registers` is an optional array. Each entry states an inclusive `from_shot` /
`to_shot` range and only the fields that differ from the baseline lock; nulls
inherit. `resolveRegister` picks the narrowest range covering a shot, so a
short dream sequence declared inside a board-wide register wins.

## Why not something else

**Why not per-shot style fields?** They'd be a fifth copy of the same prose on
every shot, and nothing would stop shot 07 and shot 08 from drifting apart
inside what is meant to be one continuous register. A register is the unit the
skill actually writes and the unit a colourist would recognise.

**Why optional rather than required?** Existing `parsed_json` rows have no
`registers` key, and `parsed_json` is read back with a cast rather than
re-validated. Making the field required would either invalidate every stored
board or force a migration for a field most boards will never use.

**Why keep `PHOTOREAL_STYLE` at all?** Boards parsed before the skill wrote
proper locks, and boards whose lock parses to a two-word `look`, would otherwise
get a weaker declaration than they do today. The fallback is a floor, not a
default.

## Risks

- Boards whose style lock is well-written but *bad* now render as written. That
  is the intent, but it does mean a weak lock is no longer masked by the house
  style. The `hasUsableStyleLock` threshold is deliberately low; if weak locks
  turn out to be common, raise it rather than reinstating the override.
- Register ranges come from the parser reading prose. A misread range silently
  applies the wrong grade to a stretch of shots. Registers are only emitted when
  the lock declares them explicitly, and the parser is told not to invent one
  from a single mood word.
- Reference stills (`generate-refs`, `regen-ref`) deliberately still use
  `PHOTOREAL_STYLE`. A reference is a flat-lit neutral portrait; applying
  "crushed blacks, single hard overhead source" to one would produce a reference
  that is useless as an identity anchor.
