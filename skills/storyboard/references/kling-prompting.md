# Kling 2.5 / 2.6 Prompting

This reference covers how to write Kling prompts for the storyboard's intended output. Kling 2.5 Turbo Pro and Kling 2.6 (current as of 2026) generate 5 or 10-second clips at 1080p in 16:9, 9:16, or 1:1 ratios. Kling's strengths are camera control, motion physics, and stable cinematic language. Its weaknesses are over-specified prompts (it drops instructions when overloaded) and ambiguous referents (when "push in" is ambiguous, it sometimes makes the *subject* walk forward instead of the camera).

Kling rewards **precision over prose**. Where Veo 3.1 likes paragraph-form writing, Kling prefers structured, motion-led, layered language.

---

## The Kling prompt spine

The reliable Kling structure has five layers:

1. **Subject** — character description (from Bible).
2. **Action** — what the subject does, with concrete verbs and physics.
3. **Environment** — location and atmosphere (from Bible).
4. **Camera movement** — explicit motion verb and direction.
5. **Lighting / atmosphere / style** — visual register.

Order matters less than presence. Front-loading subject works for character shots; front-loading environment works for establishing shots; front-loading camera movement works for movement-led shots.

### Master template

```
SUBJECT: [Bible-verbatim character description.]
ACTION: [Concrete verb-led action — "walks slowly forward, stops at the edge of the table, places her right hand flat on the surface, looks down at the photograph."]
ENVIRONMENT: [Bible-verbatim setting — geography, time, palette, identifiable details.]
CAMERA: [Explicit motion — "Static shot, MS, eye-level, 35mm lens" or "Slow dolly push-in toward subject's face, 50mm lens, parallax visible in background."]
LIGHTING: [Source + behaviour — "Hard afternoon sunlight from camera-left window, raking across the table; deep shadows on opposite wall."]
STYLE: [Photoreal cinematic, Kodak Vision3 500T feel, naturalistic grade, fine grain, no over-saturation.]
```

---

## Worked example

Same shot as the Veo 3.1 example, in Kling format:

> SUBJECT: Maya, 34, Black woman, shoulder-length tightly curled black hair worn loose, faint scar above right eyebrow, faded blue surgeon's scrubs, thin gold chain necklace.
> ACTION: Stands at the kitchen island facing camera-right, holding a chipped white enamel mug with a faded blue rim. Her shoulders tense; she inhales slowly through her nose; her jaw tightens; she looks down at the coffee in the mug for two beats; she closes her eyes briefly.
> ENVIRONMENT: Long galley kitchen interior, oak island down the centre, sink and window on the left wall, archway to the dining room visible at the far end, cream walls, brass fittings, lived-in domestic feel.
> CAMERA: Medium close-up, eye-level, 35mm lens at f/2.8, slow dolly push-in toward her face. Camera is locked to its dolly track — no handheld shake, no micro-jitter. Visible parallax in the background as the camera moves.
> LIGHTING: Hard afternoon sunlight from camera-left window, raking across the oak surface; deep shadow on opposite wall; faint dust visible in the light beam.
> STYLE: Cinematic photoreal, Kodak Vision3 500T feel, naturalistic warm grade, shallow depth of field, fine 35mm grain, matte textures, no plastic gloss.

Kling does not generate audio natively in the same way as Veo 3.1 — for dialogue, plan to lip-sync via a separate tool (ElevenLabs voice + Kling's lip-sync feature, or post-production layering). Note dialogue lines in the shot block but don't put them in the Kling prompt itself.

---

## Camera control — Kling's strongest area

Kling 2.5/2.6 has best-in-class camera control. Use precise vocabulary:

### Linear moves
- "Slow dolly push-in toward [subject]" — camera body moves forward.
- "Slow dolly pull-back" — camera body moves backward.
- "Lateral tracking shot, camera moves left to right at [speed], parallel to [subject's motion]."
- "Camera trucks left along the [foreground element]."
- "Vertical pedestal up/down."

### Rotational moves
- "Slow pan left to right, camera body fixed, head rotating."
- "Whip pan, sudden, blurring."
- "Slow tilt up from [foreground] to [background]."
- "Slow camera roll clockwise, horizon tilting from level to 15 degrees off-axis." (Use sparingly.)

### Compound moves
- "Steadicam follow shot — camera tracks behind [subject] at shoulder height, smooth gimbal stabilisation, no shake."
- "Crane shot — camera rises vertically while panning slightly right to keep [subject] centred."
- "Dolly zoom (Vertigo effect) — camera dollies forward while lens zooms out, [subject] staying same size as background distorts."

### Special perspectives
- "Aerial drone shot, slowly descending from high altitude."
- "Low-angle worm's-eye, looking up at [subject]."
- "Bird's-eye overhead, looking straight down."
- "POV shot — camera is the [subject's] eyes, looking at [target]."

### Specifying speed
Kling responds to: "very slow," "slow," "steady," "moderate," "rapid," "fast," "snap." Pair with a duration if precision matters: "slow dolly push-in over the full 5 seconds of the clip."

### Specifying NO movement
Kling 2.6 sometimes adds handheld wobble for "cinematic feel" when not asked. To get a true static shot:
> "Locked-off shot. Camera fixed on tripod. No pan, no tilt, no zoom, no drift, no handheld shake, no micro-jitter."

### Avoiding "subject lurches when camera should move" failure
Always disambiguate who's moving:
> "Camera dolly-in toward Maya. Maya is locked in centre frame and does not lean or step. Visible parallax on the bookshelf behind her as the camera moves forward."

The "visible parallax" instruction is critical — it forces Kling to express the camera move as background motion, preventing the "subject walks forward" misinterpretation.

---

## Beats and duration markers (precision technique)

For shots where exact timing matters — dialogue moments, choreographed actions, beat-driven cuts — Kling responds well to bracketed timing markers:

```
SUBJECT: Maya, [character description].
ACTION: 
[0.0s–1.5s]: stands still at the island, looking down at the mug, breathing slowly.
[1.5s–3.0s]: looks up toward camera-right, jaw tightening, eyes narrowing slightly.
[3.0s–5.0s]: closes her eyes briefly, exhales, lifts the mug to her lips.
CAMERA: [as before]
```

This formatting is unusual for typical Kling prompts but reliable when precision is needed. Use sparingly — only when the timing is dramatically important.

---

## Image-to-video and start/end frame chaining

Kling supports image-to-video generation and start/end frame conditioning. Use this for character consistency across cuts.

### Image-to-video
1. Generate a reference still (in Nano Banana, Midjourney, or another image model) using the Bible description.
2. Submit the still + a Kling prompt that focuses on **what motion happens** — don't redescribe what's already in the image.
3. Kling animates the still based on your motion prompt.

**Critical:** When using image-to-video, the prompt should describe action and camera movement only. Re-describing the subject when the image already shows it can confuse the model.

### Start/end frame
Submit a starting frame and an ending frame; Kling generates the interpolation. Useful for:
- Cut-on-action shots where you want a precise gesture from start to end.
- Transition / morph shots between two visual states.
- Locked geometric moves where you know the start and end compositions.

### For storyboards
Mark in shot blocks: `KLING: image-to-video using Nano Banana still of [shot N] start frame.` Or: `KLING: start-frame [N] / end-frame [N+1] for chained generation.`

---

## Element binding and character consistency

Kling 2.6 / 3.0 support **element binding** — locking specific characters or props to reference images so they appear consistently across multiple generations. For storyboard work:

1. Generate a high-quality reference still of each main character using Nano Banana (Bible-described).
2. Use that still as the locked element in every Kling prompt featuring that character.
3. The character will appear consistently across all generations.

For storyboards: produce 1–2 reference stills per Bible character at the top of the workflow. Note in each shot block which reference applies. This is the single most reliable consistency mechanism Kling offers.

---

## Common failure modes and fixes

| Failure | Cause | Fix |
|---|---|---|
| **Subject moves forward when only camera should** | Ambiguous "push in." | "Camera dolly-in. Subject locked centre-frame. Visible parallax in background." |
| **Hand / finger morphing** | Hand partly hidden or in motion. | Specify hand position clearly: "right hand resting flat on the table, fingers slightly spread, thumb pointing toward camera." |
| **Generation hangs at 99%** | Open-ended motion with no endpoint. | Add a clear endpoint: "She raises her arm, then settles it back at her side." |
| **Camera angle different from prompt** | Camera spec too vague or buried. | Front-load camera spec; use explicit angle ("low-angle, looking up at the subject from waist height"). |
| **Background warps during pan** | Slider value too high (in UI), or unrealistic motion ask. | Reduce camera move magnitude. "Slow pan, 30 degrees total" rather than "wide sweeping pan." |
| **Subject identity drift between clips** | No element binding or reference image. | Use Nano Banana reference stills as locked elements across generations. |
| **Filtered / refused for content** | Innocent words can trigger filters (e.g., "shot" in "tracking shot" combined with other context). | Replace ambiguous trigger words: "tracking move" instead of "tracking shot," "camera follows" instead of "shooting from behind." |

---

## Clip duration

Kling outputs 5 or 10-second clips. Most storyboard work uses 5s for snappy beats, 10s for held moments or complex camera moves with destination.

For action sequences: chain multiple 5s clips with cuts between them, rather than a single 10s clip — gives more directorial control.

For dialogue: the line itself is added in post (lip-sync workflow), so plan the visual at 5s or 10s and accommodate the dialogue rhythm in editing.

---

## Style modifiers Kling responds to well

- "Cinematic photoreal" / "documentary realism" / "editorial commercial photography aesthetic."
- "Shot on 35mm film, fine grain, naturalistic grade."
- "Anamorphic 2.39:1 framing, slight horizontal lens flares, oval bokeh."
- "16mm grain, slight halation in highlights." (Indie / period feel.)
- "High-contrast Hollywood blockbuster grade, deep blacks, lifted teal-orange." (Awareness-of-cliché — use only when the brief calls for it.)
- "Soft directional natural light, restrained palette, no saturation push."
- "Vintage film stock — Kodachrome 64 feel, warm reds, soft cyan blues."
- "Shallow depth of field, soft creamy bokeh, subject isolated."

Avoid generic intensifiers ("ultra cinematic," "epic"). Kling, like Veo, averages them.

---

## Aspect ratio

Specify in the platform interface (16:9 / 9:16 / 1:1) and reinforce in the prompt:
- "Composed for 16:9 landscape framing."
- "Vertical 9:16 composition, subject centred in upper third, leaving space below for text overlay."
- "Square 1:1 composition, symmetrical framing."

---

## A discipline note

Kling rewards **deliberate, layered prompts** that name camera, subject, action, environment, and lighting clearly. It penalises poetic or impressionistic prompts. If you find yourself writing "an evocative dance of light and shadow," delete and replace with "hard tungsten practical lamp from camera-right, raking across the brushed steel surface, casting long shadows toward camera-left."

The Kling failure mode is rarely "the model misunderstood you." It's almost always "the model couldn't identify the precise instruction in your prose." Use the spine. Layer the elements. Be explicit.
