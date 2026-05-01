# Veo 3.1 Prompting

This reference covers how to write Veo 3.1 prompts that consistently produce the storyboard's intended output. Veo 3.1 (current Google video model as of 2026) accepts paragraph-form prompts of 100–150 words / 3–6 sentences, generates 4 / 6 / or 8-second clips at 720p or 1080p, and produces synchronised native audio (dialogue, SFX, ambient).

Veo 3.1 rewards cinematic vocabulary and physical specificity. It penalises vague intensifiers and overlapping instructions.

---

## The 7-layer prompt template

Veo 3.1 outputs improve markedly when prompts contain all seven layers, in any order but ideally with the most important leading. The layers:

1. **Camera + lens** — shot scale, angle, movement, focal length.
2. **Subject** — character description (paste from Bible verbatim).
3. **Action + physics** — what happens, with concrete verbs.
4. **Setting + atmosphere** — location (paste from Bible verbatim), time, weather.
5. **Light source + behavior** — where light comes from, how it behaves.
6. **Texture / details** — surface qualities, micro-details that resist the AI-plastic look.
7. **Audio** — dialogue (in quotes), SFX, ambient noise.

**Sweet spot:** 100–150 words. Shorter and the model fills in averages; longer and it starts to drop instructions.

### The master template

```
[CAMERA]: A [SCALE] shot, [ANGLE], [LENS focal length and aperture if relevant], [CAMERA MOVEMENT].

[SUBJECT]: [Paste verbatim character description from Bible — face, hair, build, wardrobe, distinguishing features.]

[ACTION + PHYSICS]: [What happens, with concrete verbs — not "she reacts" but "her shoulders drop, her gaze drifts to the window."]

[SETTING + ATMOSPHERE]: [Paste verbatim location description from Bible — geography, time, palette, identifiable details.]

[LIGHT]: [Source — "hard afternoon sunlight from camera-right window" — and behaviour — "raking across the oak table, deep shadows on opposite wall."]

[TEXTURE]: [Surface qualities — "fine grain, slightly soft focus, matte plaster walls, brushed metal." This layer is the strongest defense against AI-plastic look.]

[AUDIO]: 
DIALOGUE: [Character], in [voice description from Bible], says, "[Line]."
SFX: [Concrete sound — "the faint hiss of a kettle on the range, a distant car passing outside."]
AMBIENT: [Background soundscape — "quiet domestic interior, faint hum of appliances."]

[STYLE LOCK]: [Paste the storyboard-wide style line — "shot on Kodak Vision3 500T, 35mm full-frame, naturalistic colour, restrained grade, slight grain."]
```

---

## Fully worked example

A real Veo 3.1 prompt for a single shot:

> Medium close-up at eye-level, 35mm lens at f/2.8, slow dolly push-in toward the subject's face. Maya — a 34-year-old Black woman with shoulder-length tightly curled black hair worn loose, faint scar above her right eyebrow, wearing faded blue surgeon's scrubs and a thin gold chain — stands at a kitchen island, facing camera-right, holding a chipped white enamel mug with a faded blue rim. Her shoulders are tense. She inhales slowly through her nose; her jaw tightens; she looks down at the coffee in the mug for two beats, then closes her eyes briefly. The kitchen is a long galley with sink and window on the left wall, an oak island down the centre, archway to the dining room visible at the far end; cream walls, brass fittings, lived-in. Hard afternoon sunlight from the camera-left window rakes across the oak surface and falls into shadow on the camera-right walls; faint dust visible in the light beam. Fine 35mm film grain, matte textures, no plastic gloss. Maya, in a soft slightly hoarse alto: "I wasn't going to tell you tonight." SFX: faint kettle hiss from the range, a distant car passing outside. Ambient: quiet domestic interior. Style: Kodak Vision3 500T, naturalistic warm grade, shallow depth of field, slight grain.

That's roughly 220 words — slightly over the sweet spot, but it's a dialogue shot with full Bible injection, so the length is justified. For shorter shots without dialogue, target 100–130 words.

---

## Audio syntax (the most underused capability)

Veo 3.1 generates synchronised audio in the same pass as the visual. Three audio elements:

### Dialogue
Use **direct quotation marks** for spoken lines. Specify voice quality from the Bible.
> Maya, in a soft, slightly hoarse alto: "I wasn't going to tell you tonight."

Avoid: paraphrases ("she says she didn't plan to"), descriptions ("she speaks softly").

### Sound effects
Tag with **SFX:** and describe sounds concretely.
> SFX: a single chair leg scrapes against the wooden floor; a kettle's whistle rises slowly to a peak.

Multiple SFX in one prompt are fine, separated by semicolons.

### Ambient noise
Tag with **Ambient:** for the background soundscape.
> Ambient: distant traffic on a wet road; faint domestic interior — fridge hum, ticking clock.

### Music
Veo 3.1 can generate score elements but is less reliable here. Better to leave score for post-production unless the score is *part* of the shot's content (a character humming, a radio playing).

### Negative audio
If the brief needs silence, say so explicitly:
> No music, no score. Diegetic sound only — her breathing, the kettle, the room.

---

## Camera movement language

Veo 3.1 understands standard cinematic vocabulary. The most reliable terms:

- "Static shot, camera fixed."
- "Slow dolly push-in toward [subject]."
- "Slow dolly pull-back, [subject] held centred."
- "Lateral tracking shot, parallel to [subject's] motion, camera at [height]."
- "Slow pan from left to right."
- "Slow tilt up from [foreground element] to [background element]."
- "Crane shot rising vertically."
- "Steadicam follow, smooth, no shake, behind [subject]."
- "Handheld, organic shake, documentary feel."
- "Aerial drone shot, slowly descending."
- "Rack focus from [foreground] to [background]."

**For specifying speed and easing:** "Slow," "steady," "gradual" produce smoother moves; "rapid," "sudden," "snap" produce kinetic ones. Specify *both ends* of a move ("starts slow then accelerates into the second half") for energy curves.

**For specifying parallax / depth feeling:** "Visible parallax in the background as the camera moves" stabilises the move and prevents the subject-lurch failure mode.

**For specifying NO movement:** Veo sometimes adds drift even in static shots. Counter explicitly: "Camera is locked off — no pan, no tilt, no zoom, no drift."

---

## Lens language

Veo responds well to focal length numbers:

- "16mm wide-angle, expanded perspective, slight edge distortion."
- "35mm full-frame, naturalistic perspective, mild depth compression."
- "50mm full-frame, normal human-eye perspective."
- "85mm short telephoto, subject pops, background falls into soft bokeh."
- "Macro lens, extreme close detail, shallow depth."

**Aperture / depth of field:** "Shot at f/2, shallow depth of field, [background element] falling into soft bokeh."

**Avoid:** "cinematic depth of field" alone — vague. Pair with the f-stop or with what's in / out of focus.

---

## First / last frame conditioning (the chaining workflow)

Veo 3.1 supports **start frame** and **end frame** image conditioning. This is the single most reliable way to maintain character consistency across cuts.

### Workflow

1. Generate shot N with full Bible-injected prompt.
2. Take the final frame of shot N as a still image.
3. For shot N+1, supply that still as the **start frame** image. Write the prompt for the action / camera move that proceeds from that frame.
4. The character in shot N+1 will inherit the appearance from shot N's final frame.

### When to chain

- **Always** within a continuous scene (same room, same time, same characters).
- **For cut-on-action shots** where shot N's end and shot N+1's start show the same gesture mid-completion.
- **For dialogue scenes** where the listener's reaction in shot N+1 should match the listener's last frame in shot N.
- **Not necessary** between scenes (cut to a new location) — there a fresh prompt with full Bible is cleaner.

### Marking in storyboards

In each shot block, note: `CHAIN: end-frame-of-N → start-frame-of-(N+1).` This tells the user which generations to chain.

### Workflow with Gemini 2.5 Flash Image (Nano Banana)

For the *first* frame of a scene, generate a still image with Nano Banana using the same Bible-injected description. Use that still as Veo's start frame. This gives you total control over the opening composition before Veo animates it.

This combo (Nano Banana → Veo 3.1) is now the standard professional pipeline for character-consistent storyboard generation.

---

## Negative phrasing

Veo handles negation but with a specific quirk: **describe what should be present, not absent.** "A peaceful garden with no people" works less reliably than "an empty peaceful garden, no figures, no movement, only foliage and stone paths."

For unwanted elements:
- "no handheld shake" → better: "camera is locked off, no movement"
- "no music" → better: "diegetic sound only, no score"
- "no AI plastic skin" → better: "natural skin texture with visible pores, slight imperfections, fine 35mm grain"

---

## Reliable style modifiers (the canon)

These modifiers consistently lift Veo 3.1 output toward photoreal cinematic:

- "Cinematic photoreal."
- "Shot on 35mm film, fine grain, naturalistic grade."
- "Sharp focus throughout / shallow depth of field with subject in sharp focus."
- "Naturalistic lighting, motivated by visible practicals."
- "Restrained colour grade, no over-saturation, lifted blacks."
- "Documentary realism, observational tone."
- "Editorial photography aesthetic, clean and contemporary."
- "Anamorphic 2.39:1 framing." (For cinema-scope feel.)
- "16mm grain, slight halation in highlights, faded blacks." (For period / indie feel.)

**Avoid as standalone modifiers:** "epic," "cinematic" alone, "8K ultra HD" (cosmetic only — the model already outputs at native resolution), "masterpiece," "professional cinematography." These don't add information.

---

## Common failure modes and fixes

| Failure | Cause | Fix |
|---|---|---|
| **Plastic skin / AI-perfect faces** | Underspecified texture and grain. | Add: "natural skin texture, visible pores, slight asymmetry, fine 35mm film grain, no plastic gloss." |
| **Subject lurches when camera moves** | The model interprets the camera move as subject motion. | Specify: "Subject is locked centre-frame; the camera moves around them; visible parallax in the background." |
| **Dialogue rushed / mismatched lip sync** | Line is too long for the clip duration. | Shorten the line; aim for 1.5–2 seconds of dialogue per 4-second clip, 3–4 seconds per 8-second clip. |
| **Inconsistent character between clips** | Bible not injected verbatim, or paraphrased. | Strict copy-paste discipline. Better: chain via first/last frame. |
| **Generic environment** | Setting underspecified. | Inject identifiable details — signage, specific props, light direction, micro-textures. |
| **Camera doesn't move when asked** | Vague verb. | Use specific direction: "dolly forward 1 metre toward subject" rather than "push in." |
| **Too much motion in supposedly still shot** | Default model bias. | Explicit: "Static shot. Camera fixed. No pan, no tilt, no zoom. Subject the only moving element." |

---

## Clip duration discipline

Veo 3.1 outputs 4, 6, or 8 second clips. Choose deliberately based on shot function:

- **4 seconds** — establishing details, cutaways, brief reactions, action beats. Snappy, doesn't outstay welcome.
- **6 seconds** — most dialogue beats with one line + reaction, or two short actions. The mid-range workhorse.
- **8 seconds** — held emotional moments, long takes, slow camera moves with destination, dialogue beats with response. Use sparingly — earns weight.

A storyboard mixing all three durations has rhythm. A storyboard of all-6s clips has none.

**Time budgeting for ads:** A 30-second ad = roughly 5–8 shots if you're using 4s and 6s clips with cuts. A 60-second ad = 10–15 shots. Plan duration and cut count together.

---

## A final discipline note

Veo 3.1 is most powerful when treated as a **director's tool**, not a wishing well. Director-mindset prompts (specifying camera, lens, light, action, audio) consistently outperform wishing-well prompts ("a beautiful cinematic shot of a woman in a kitchen").

If a prompt feels too long, it's probably right. If a prompt feels under-specified, it's probably wrong.
