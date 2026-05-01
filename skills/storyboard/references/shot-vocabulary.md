# Shot Vocabulary

Cinematic vocabulary for storyboard work. AI video models understand these terms — using them precisely gives you control. Vagueness ("a nice shot of her") yields generic output. Precision ("low-angle medium close-up, 35mm, eye-level dolly-in") yields what you want.

This file is a reference, not a syllabus. Use it to choose the right term for the right narrative function.

---

## Shot scales (distance)

| Code | Name | Description | When to use |
|---|---|---|---|
| **EWS** | Extreme wide shot | Subject tiny or absent in vast environment. | Establishing scale, isolation, geography of an entire region. |
| **VWS** | Very wide shot | Subject visible but small; environment dominates. | Establishing a scene's geography while showing the subject in context. |
| **WS** | Wide shot | Whole figure visible head-to-toe; environment readable. | Master shots, action scenes, group dynamics. |
| **MWS** | Medium wide / "American shot" | Knee-up to head. | Group dialogue, action that needs hands and posture readable. |
| **MS** | Medium shot | Waist-up to head. | Dialogue workhorse. Conversational. |
| **MCU** | Medium close-up | Mid-chest to head. | Closer dialogue, slight intensification. |
| **CU** | Close-up | Shoulders or chin to top of head; face fills frame. | Emotional weight, reaction, intimacy. |
| **ECU** | Extreme close-up | Eyes only, mouth only, hand detail. | Intensity, isolation of one feature, telling detail. |
| **OTS** | Over-the-shoulder | Foreground figure's shoulder/head out of focus, framing the subject beyond. | Dialogue. The relational two-shot disguised as a single. |
| **POV** | Point-of-view | The camera *is* the character; we see what they see. | Subjectivity, immersion, suspense. |
| **2-shot / 3-shot** | Multiple subjects in frame | — | Establishing relationship; equality between subjects. |
| **Insert** | Tight detail of an object | — | Plot information (the gun, the photograph, the screen). |
| **Cutaway** | Non-master shot — a hand, a window, a clock | — | Time compression, mood, rhythm. |

**Rule:** Every storyboard should use at least four scales — typically WS / MS / CU / ECU plus inserts/cutaways. A single-scale storyboard has no rhythm.

---

## Camera angles (vertical)

| Angle | What it says |
|---|---|
| **Eye-level** | Neutrality. Default for most shots. |
| **Low angle** | Power, dominance, threat, scale (the subject looms over us). |
| **High angle** | Vulnerability, smallness, surveillance (we're above the subject). |
| **Bird's-eye / overhead** | Geometry, abstraction, omniscience. Often used for crowd scenes or compositional shots. |
| **Worm's-eye** | Extreme low angle from the ground. Heroic, oppressive, surreal. |
| **Dutch tilt / canted** | Frame rotated. Unease, instability, mental disorientation. Use sparingly. |

**Application:** When you have a scene with a power dynamic (interrogator vs. suspect, parent vs. child, boss vs. employee), the angle choice is not neutral. The lower party gets the high angle (looking down on them). The higher party gets the low angle (looking up at them). The audience reads the relationship from the geometry.

---

## Camera position relative to line of interest

These are Arijon's five canonical triangle positions, repeated here for prompt-language reference:

| Position | Prompt-language description |
|---|---|
| **External reverse / OTS** | "Over-the-shoulder shot, foreground subject's shoulder soft and out of focus, framing the second subject beyond." |
| **Internal reverse** | "Close shot of subject from camera position between the two players, looking directly at her — the other character implied off-camera." |
| **Parallel** | "Matched single shots from the same side of the line; symmetrical framing of each subject." |
| **Common visual axis (head-on)** | "Direct frontal shot, subject looking straight into camera (or just past it)." |
| **Common visual axis (tail-on)** | "Direct rear shot, camera behind the subject, looking along their line of sight." |
| **Right-angle / two-shot** | "Two-shot, camera at 90° to the subjects' line, both visible in profile." |

---

## Camera movement

| Move | Prompt language | What it says |
|---|---|---|
| **Static / locked-off** | "Static shot, camera fixed, no movement." | Observation, stillness, formality. |
| **Pan** | "Slow pan from left to right, camera fixed in position, head rotating." | Following, surveying, suspenseful reveal. |
| **Whip pan** | "Sudden whip pan, blurring as camera snaps from one position to another." | Punctuation, transition, kinetic energy. |
| **Tilt up / tilt down** | "Slow tilt up from her hands to her face." | Vertical reveal, scale, focus shift. |
| **Dolly / push-in** | "Slow dolly push-in toward the subject's face, parallax visible in the background." | Intensification, attention, emotional pressure. |
| **Dolly / pull-out** | "Slow dolly pull-back, the subject staying centred as the world expands around her." | Reveal of context, isolation, recontextualisation. |
| **Tracking / parallel track** | "Lateral tracking shot moving with the subject, camera at her shoulder height, parallel to her motion." | Sustained presence, journey. |
| **Crane / jib up** | "Crane shot rising vertically, the subject staying small in the lower frame as the environment opens up." | Scale reveal, transcendence, departure. |
| **Crane / jib down** | "Descending crane move, camera lowering to meet the subject at eye level." | Arrival, intimacy, focus. |
| **Steadicam / gimbal** | "Smooth gimbal-stabilised tracking shot following the subject from behind, no shake, fluid motion." | Immersive following without static formality. |
| **Handheld** | "Handheld camera, slight organic shake, naturalistic, documentary feel." | Subjectivity, urgency, realism. |
| **Drone / aerial** | "Aerial drone shot, slow descent revealing the geography below." | Scale, omniscience, opening/closing punctuation. |
| **Zoom in** | "Slow zoom-in (lens, not dolly), the background flattening as the focal length compresses." | Different feel from dolly — more clinical, more constructed. |
| **Snap zoom** | "Sudden snap zoom toward subject's face." | Aggression, surprise, period flavour. |
| **Rack focus** | "Rack focus from foreground prop to subject behind." | Shifting attention within a held shot. |
| **Dolly zoom (Vertigo)** | "Dolly zoom — camera dollies in while the lens zooms out, the subject staying the same size as the background distorts and warps." | Disorientation, dread, perceptual shift. |
| **Roll** | "Camera rolls slowly clockwise, horizon tilting." | Disorientation, transition, surrealism. |
| **Lock-off with subject motion** | "Static shot — the camera doesn't move, but the subject moves through the frame." | Observational, theatrical, formal. |

**For Kling specifically:** Kling rewards explicit motion verbs — "the camera dollies forward at a steady, slow pace, parallax visible in the bookshelf at left" works better than "push in slightly." Kling 2.6 sometimes adds handheld shake when not asked; counter with "no handheld shake, no micro-jitter, locked-off camera body" when you want stillness.

**For Veo 3.1:** Veo accepts more naturalistic phrasing — "the camera slowly pushes in toward her face" works as well as "dolly-in." Specify whether the move is *with* or *against* a subject's motion: "the camera moves with her as she walks" vs. "the camera holds still as she walks past frame-right."

---

## Lenses and depth of field

Lens choice changes what the shot *feels* like even at the same distance.

| Focal length | Look | Effect | When to use |
|---|---|---|---|
| **Ultra-wide (16mm, 21mm)** | Spatial expansion, distortion at edges, exaggerated foreground. | Dramatic, immersive, surreal. | Action, environments, surreal effect. |
| **Wide (28mm, 35mm)** | Naturalistic perspective, slight depth expansion. | Documentary, reportage, "you are there." | Default for natural-feeling drama. |
| **Standard (50mm)** | Normal human-eye perspective. | Neutral. | Workhorse, dialogue, naturalism. |
| **Short telephoto (85mm)** | Subject pops, background compresses softly. | Portrait intimacy, isolation. | Beauty close-ups, dialogue with shallow background. |
| **Telephoto (135mm, 200mm)** | Background heavily compressed, strong subject isolation. | Surveillance feel, observed-from-distance. | Sport, action at distance, telephoto effect. |
| **Macro** | Extreme close detail. | Texture, intimacy with object, surreal scale. | ECUs of objects, hands, eyes. |

**Aperture / depth of field:**
- **Shallow (f/1.4–f/2.8)** — subject sharp, everything else creamy bokeh. Intimate, dramatic, "cinematic."
- **Medium (f/4–f/5.6)** — subject sharp, environment readable. Naturalistic.
- **Deep (f/8–f/16)** — everything sharp. Documentary, observational, "Wes Anderson," David Fincher.

**Prompt language:** "Shot on 35mm at f/2, shallow depth of field, background falling into soft bokeh" is concrete and reliable. "Cinematic depth" alone is vague.

---

## Light qualities

The single biggest determinant of cinematic feel after camera position.

| Light type | Description / prompt language |
|---|---|
| **Golden hour** | Low warm sun, long shadows, soft directional light, late afternoon glow. |
| **Magic hour / blue hour** | The 20 minutes after sunset; cool blue ambient with warm sodium-vapor accents, the world saturated and balanced. |
| **Hard sun (midday)** | Bright direct sunlight, harsh shadows, high contrast. |
| **Overcast / soft daylight** | Diffused ambient, no hard shadows, even tones. |
| **Window light (north / south)** | Single directional source from a window. North = soft and even; south = bright and warm if direct sun comes in. |
| **Practical / motivated** | Light from a source visible in frame — a lamp, a fluorescent strip, a candle. |
| **Tungsten / warm interior** | Indoor warm yellow-orange lighting, often from practical lamps. |
| **Fluorescent** | Cool green-tinted overhead institutional light — offices, hospitals, supermarkets. |
| **Neon / LED practicals** | Saturated coloured light from signs or modern fixtures, common in night urban scenes. |
| **Candlelight / firelight** | Warm low flickering light, dramatic shadows, intimacy or threat. |
| **Backlight / silhouette** | Light source behind subject — figure in silhouette or rim-lit. |
| **Top light** | Light from above; eye sockets fall into shadow. Ominous, oppressive. |
| **Underlight** | Light from below; reverses normal facial shadows. Surreal, threatening, B-movie. |
| **Hard rim / kicker** | Strong edge light defining silhouette. |
| **Volumetric / hazy** | Light visible in the air — through smoke, dust, fog, mist. Atmospheric. |
| **Reflected / bounced** | Light bounced from a wall, ceiling, or surface — soft, indirect. |

**Prompt structure for light:** Always name a *source* (sun through window, sodium streetlamp, fluorescent ceiling, candle on table) and a *behavior* (raking across the floor, diffused by mist, casting hard shadows). Veo 3 and Kling both stabilise output significantly when light has physical logic.

---

## Aspect ratios

| Ratio | Use |
|---|---|
| **16:9 (1.78:1)** | Standard TV, YouTube, most ads. |
| **9:16** | Vertical — TikTok, Reels, Stories. |
| **1:1** | Square — older Instagram feed, some social ads. |
| **2.39:1 (Cinemascope)** | Cinematic, theatrical, period blockbuster feel. |
| **2.35:1** | Anamorphic widescreen (similar to 2.39). |
| **4:3 (1.33:1)** | Vintage TV, period film, deliberate retro flavour. |
| **1.85:1** | Standard theatrical projection. |

For Veo 3.1 and Kling, specify aspect ratio in the prompt or via the platform setting. Default to 16:9 unless brief is for vertical / square / theatrical-cinema.

---

## Quick map: narrative function → shot recipe

| Function | Shot recipe |
|---|---|
| **Establishing a scene** | WS or VWS, eye-level, static or slow pan, natural light, lens 35–50mm. |
| **Introducing a character** | Often delayed reveal — start with detail (hands, feet, back) then cut to MS/CU eye-level when you want the audience to "meet" them. |
| **Dialogue beat** | OTS, MS, MCU on speaker; pause shot (CU on listener, no dialogue, 4s hold) after key line. |
| **Emotional moment** | CU or ECU, eye-level, static, 50–85mm shallow depth, soft directional light. |
| **Decision moment** | ECU on eyes, no dialogue, 4–6s hold, sound design carries weight (rather than score). |
| **Action / impact** | Multiple angles, fragmented coverage, rapid cutting. Mix scales. |
| **Reveal** | Pull-back (dolly or crane) from CU/MS to wider — let the new context expand. |
| **Travelling with a character** | Tracking shot or Steadicam follow, MS or MWS, 35mm, parallel motion. |
| **Loneliness / smallness** | EWS or VWS with subject at edge of frame, low contrast, soft natural light. |
| **Suspense build** | Slow push-in (dolly or zoom), increasingly close on subject, holding. |
| **Decision / thought** | Hold on face — long take, no cut, no dialogue. Trust the actor (or model). |
| **Time compression** | Cutaway to clock / window / object, then return. |
| **Match-cut transition** | Two shots designed to share a visual element at the cut — a circle, a movement direction, a colour. |

---

## A note on prompt language for AI models

Both Veo 3.1 and Kling understand the standard cinematic vocabulary above. Use it. But avoid:

- **Vague intensifiers:** "very cinematic", "ultra dramatic", "epic". They produce nothing concrete; the model averages them. Use specific physical descriptors instead.
- **Subjective claims:** "beautiful", "gorgeous", "stunning". Don't tell the model the result is beautiful; tell it the conditions that *make* it beautiful (the light, the lens, the composition).
- **Genre name-drops alone:** "in the style of a Christopher Nolan film" — unreliable. Better: "high-contrast IMAX-style anamorphic look, deep blacks, cool grade, hard practical lighting."
- **Multiple competing instructions:** "low angle but also bird's-eye view." Pick one. Don't stack contradictions.

The vocabulary on this page is the precise language. Use it as built; combine elements; specify physical conditions, not subjective adjectives.
