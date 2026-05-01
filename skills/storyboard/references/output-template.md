# Output Template

This is the exact markdown structure every storyboard from this skill outputs. Follow it. Don't deviate. Consistency of output format is what makes the skill usable across many briefs.

---

## Document structure

```
# [Storyboard Title]

[Brief intro line — what this is, format, total duration, aspect ratio.]

## Narrative arc
[1–3 sentences. The dramatic question, the withholding, the reveal.]

## Style lock
[The block from cinematic-style-library.md — look, lens, grade, lighting register, film stock, negative style.]

## Continuity Bible

### Characters
[Each character entry, full template from continuity-bible.md.]

### Locations
[Each location entry, full template.]

### Props
[Each prop entry, full template.]

## Shot list summary

| # | Scale | Camera | Loc | Subject(s) | Direction | Dur | Function |
|---|---|---|---|---|---|---|---|
| 01 | EWS | Static | LOC-STREET-DAWN | — | — | 4s | Establishing |
| 02 | MS | Dolly-in | LOC-KITCHEN-MORNING | CHAR-MAYA | → | 6s | Introduce protagonist |
| ... | ... | ... | ... | ... | ... | ... | ... |

## Per-shot blocks

[Full block for each shot in sequence — template below.]

## Followability audit
[Short paragraph confirming the audit passed; flagging deliberate withholdings.]
```

---

## Per-shot block template

```
### Shot [NN] — [LOCATION ID] — [BRIEF DESCRIPTOR]

**Function**: [One line. Ruthless. What does this shot do for the story?]

**Grammar**:
- Scale: [EWS / VWS / WS / MWS / MS / MCU / CU / ECU / OTS / POV / 2-shot / etc.]
- Angle: [Eye-level / low / high / overhead / dutch / etc.]
- Triangle position: [External reverse / internal reverse / parallel / common visual axis (head-on or tail-on) / right-angle]
- Camera move: [Static / pan / tilt / dolly-in / dolly-out / track / crane / steadicam / handheld / etc.]
- Lens: [Focal length and aperture]
- Line of interest: [Where the axis runs, which side of it the camera is on]
- Screen direction: [→ / ← / Toward camera / Away from camera / Neutral]
- 30° check: [How the angle relates to adjacent shots — "30°+ from shot N-1 around CHAR-MAYA"]
- Cut into this shot: [On action / on eyeline / on sound match / on rhythm / hard cut / fade in / dissolve from N-1]
- Cut out of this shot: [On action / on eyeline / on sound match / hard cut / fade / dissolve to N+1]

**Continuity**:
- Characters: [List of CHAR-IDs in shot]
- Location: [LOC-ID]
- Props persisting from previous shots: [PROP-IDs]
- New props introduced: [PROP-IDs]
- Light direction: [Where light comes from — must match previous if same scene]
- Time of day: [Specific]

**Action / beat**:
[2–4 sentences describing what happens in concrete physical terms — verbs, gestures, micro-actions. Not "she reacts" but "her shoulders drop, her gaze drifts to the window."]

**Dialogue / VO**:
[CHAR-NAME]: "[Line]"
[Or: VO (CHAR-NAME): "[Line]"]
[Or: — (none)]

**Sound design**:
- SFX: [Concrete sounds]
- Ambient: [Background soundscape]
- Music: [If diegetic — a radio, a hummed tune. Score is left for post unless specified.]

**Duration**: [4 / 6 / 8s for Veo, 5 / 10s for Kling]

**Chain instruction (if applicable)**:
[CHAIN: end-frame-of-N → start-frame-of-(N+1)]
[Or: KLING: image-to-video using Nano Banana reference still]
[Or: KLING: start-frame [N] / end-frame [N+1] for chained generation]
[Or: — (no chaining)]

---

#### Veo 3.1 prompt

> [Full paragraph-form prompt, 100–150 words, all 7 layers, Bible descriptions verbatim, audio inline.]

---

#### Kling 2.5 prompt

> SUBJECT: [Bible-verbatim character description.]
> ACTION: [Concrete verb-led action.]
> ENVIRONMENT: [Bible-verbatim setting.]
> CAMERA: [Explicit motion + lens + height.]
> LIGHTING: [Source + behaviour.]
> STYLE: [Style lock from top of doc.]

---
```

---

## Compact mode (for long pieces — 40+ shots)

For music videos, longer films, or any storyboard where the per-shot block above would result in a doc too long to navigate, use this compact variant. Keep all the prompts and grammar metadata; tighten the prose.

```
### Shot [NN] — [LOCATION ID] — [DESCRIPTOR]

**Function**: [One line.]

**Grammar**: [Scale] | [Angle] | [Triangle pos] | [Camera move] | [Lens] | [Direction] | [Cut in / Cut out]

**Continuity**: [CHAR-IDs] in [LOC-ID]; props: [list]; light: [direction]; time: [specific].

**Action**: [1–2 sentences max.]

**Audio**: [Dialogue / SFX / Ambient compressed to one line.]

**Duration**: [Number]s

**Chain**: [If any.]

**Veo 3.1 prompt**:
> [Full prompt — same length and quality as standard mode. Don't compress prompts.]

**Kling 2.5 prompt**:
> [Full prompt — same structure as standard mode. Don't compress prompts.]

---
```

The rule: prompts and grammar are never compressed; the descriptive prose (function, action) can be tightened.

---

## Followability audit footer

At the end of every storyboard, include:

```
## Followability audit

✅ Establishing logic: [Confirm WS/establishing in first 2-3 shots.]
✅ Line of interest: [Confirm camera respected the axis or that crossings are properly punctuated.]
✅ Screen direction: [Confirm continuity across cuts or that resets are punctuated.]
✅ 30° rule: [Confirm no jump cuts between adjacent same-subject shots.]
✅ Number / scale contrast: [Confirm rhythm.]
✅ Cut motivation: [Confirm every cut is *on* something.]
✅ Pause / reaction shots: [Confirm dialogue scenes have breathing room.]

**Deliberate withholdings**: [List any — "Maya's face is withheld until shot 09; the photograph's content is withheld until shot 14."]

**Flags for review**: [Any shots the user should look at carefully — risky chains, ambitious camera moves, dialogue lines whose lip-sync timing could be tight.]
```

---

## What to omit

The output should NOT include:

- Multiple format alternatives (no JSON-and-markdown — markdown only).
- Extended preamble or framing prose.
- Meta-commentary about the workflow.
- Apologies or hedges ("you may want to adjust...").
- Generic boilerplate about AI video generation.

The output is a working document the user takes to their generator and uses. Treat it as a deliverable, not a chat reply.

---

## Example header

For reference, a complete header section for a real piece:

```
# THE NIGHT SHIFT

A 60-second short film for a hospital documentary anthology. 16:9 aspect ratio. 12 shots, total runtime 64 seconds.

## Narrative arc
A midwife on a 3am shift delivers a baby; the camera withholds the mother's face until the final shot, when we realise she is the midwife's daughter. The dramatic question — "why does this midwife look so haunted?" — is set in shot 1 and answered in the final reveal. The visual rhyme is the small gold pendant the midwife wears; an identical pendant appears on the mother in the reveal shot.

## Style lock
LOOK: Cinematic photoreal, naturalistic, restrained.
DP REFERENCE: Hoyte van Hoytema (deep-focus IMAX feel, single hard practical sources, clinical contrast).
LENS DEFAULT: 35mm full-frame, f/2.8.
COLOUR GRADE: Cool clinical institutional — desaturated greens and blues from fluorescent overheads, warm flesh tones in skin only.
FILM STOCK FEEL: Kodak Vision3 500T with mild grain.
LIGHTING REGISTER: Hospital fluorescents as motivated practical sources; surgical task lighting as hard accent. No fill.
NEGATIVE STYLE: No teal-orange push. No HDR. No glossy commercial polish. No sentimentality in colour.
```

That's the level of specificity expected at the top of every storyboard from this skill.
