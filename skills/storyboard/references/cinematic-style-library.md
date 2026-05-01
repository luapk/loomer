# Cinematic Style Library

This reference is the default aesthetic palette for storyboards produced by this skill. The default look is **cinematic photoreal** — naturalistic, motivated lighting, restrained colour, fine grain, lens-felt depth. This file expands that into specific reference vocabulary that goes into prompts.

If the user specifies a different style (animated, claymation, surrealist, hyper-glossy commercial, period genre, etc.), abandon this default and build a style lock for that instead. But when no style is specified, use this.

---

## The default style lock

```
LOOK: Cinematic photoreal, naturalistic, restrained.
LENS DEFAULT: 35mm full-frame, f/2.8, shallow depth of field unless shot calls for deeper.
COLOUR GRADE: Naturalistic warm whites, restrained saturation, soft contrast curve, lifted blacks.
FILM STOCK FEEL: Kodak Vision3 500T (digital sensor with 35mm film grain emulation).
LIGHTING REGISTER: Naturalistic, motivated by visible practicals or natural sources, soft directional, hard sources used for drama.
TEXTURE: Fine 35mm grain, matte surfaces, micro-imperfections in skin, no plastic gloss.
NEGATIVE STYLE: No HDR look, no over-saturation, no slick CGI gloss, no glossy commercial polish, no AI-perfect skin.
```

This block (or a tightened version of it) goes into every shot prompt as the **STYLE** layer. Consistency across the whole storyboard is more important than perfection of any single shot.

---

## Photographer references — what each *technically means*

Naming a photographer in a prompt is unreliable. Translating their visual signature into specific technical descriptors is reliable. Below: Paul's go-to photographer references with their technical translations.

### Todd Hido
**Visual signature:** Twilight melancholy. Suburban houses lit from inside, viewed from outside in fog or rain. Deep blues and oranges. Sodium-vapor streetlamp colour. Empty interiors. Through-windscreen-in-rain photography. Mood of solitude, longing, the moment after something happened.

**Technical translation for prompts:**
> "Twilight, sodium-vapor streetlamp glow, suburban window light bleeding into fog, deep blue ambient with warm orange accents, slight diffusion or rain-on-glass, low contrast, melancholic stillness, 6×7 medium format feel, slight grain, no figures or distant figures only."

### Alasdair McLellan
**Visual signature:** British youth portraiture. Naturalistic light from windows. Pale skin, freckled, soft. Grey overcast English skies. Editorial fashion intimacy. Worn jeans, school uniform, rumpled bedsheets. Authentic, unposed feel. Fashion editorial that doesn't look like fashion editorial.

**Technical translation for prompts:**
> "Soft overcast British daylight from a north-facing window, naturalistic palette — pale skin, faded indigo, weathered creams, soft grey-greens, no saturation push. Subject in unposed natural posture, candid feeling. 35mm at f/2, shallow depth, fine grain, slight diffusion, editorial youth portraiture register."

### Jamie Hawkesworth
**Visual signature:** British naturalism — bus stops, working-class portraits, regional UK landscapes. Documentary register but with elevated composition. Often bright sunlight, slightly washed-out. People photographed without performance.

**Technical translation for prompts:**
> "Bright but slightly hazy English daylight, washed-out warm palette, subject photographed in unposed naturalism, environment-as-portrait. Documentary feel with formal composition. 50mm lens, f/4, mostly deep depth of field, subject in their context."

### Andrew Bush (Vector Portraits)
**Visual signature:** Drivers photographed from the next car at highway speed. The driver oblivious, in their natural state. Wide windshield framing, motion blur in side windows, the universe of one car interior. American, suburban, isolated.

**Technical translation for prompts:**
> "Subject photographed from the side at car-window height, framed by car interior — driver visible through their open window, eyes on the road ahead, oblivious to camera. Motion blur in background. American highway. Daylight from windshield direction. The car interior as portrait frame."

### Alec Soth
**Visual signature:** Large-format colour American portraiture. Quiet, slightly faded palette. Subjects photographed in their environments — often small towns, riverside, isolated. Deeply still.

**Technical translation for prompts:**
> "Large-format colour photography aesthetic. Subject in their environment — small-town American context. Soft, slightly faded palette, restrained saturation, deep focus throughout (large-format depth-of-field). Stillness — subject looks at or past camera with quiet composure. 50mm-equivalent perspective, f/8, fine medium-format grain."

---

## Cinematographer (DP) references

For specifically *moving image* references — the way the camera moves, the way light is built for motion:

### Emmanuel Lubezki ("Chivo")
**Films:** *The Tree of Life*, *Children of Men*, *The Revenant*, *Birdman*.
**Signature:** Long takes, motivated natural light, wide-angle (24–35mm), Steadicam following, magic-hour photography, diffusion. Sense of being-with the subject.
**Translation:**
> "Wide-angle Steadicam follow shot, naturalistic motivated light, long take aesthetic, slight diffusion in highlights, magic hour or window-light interiors only, fluid handheld-feel without shake."

### Darius Khondji
**Films:** *Se7en*, *Uncut Gems*, *Amour*, *Midnight in Paris*, *The Beach*.
**Signature:** Range — but the through-line is rich shadow detail, warm ambient saturation in some films and cool desaturation in others. Hard practicals. Intimate close coverage.
**Translation (per film):**
- *Se7en* feel: "Heavily underexposed, deep shadows, single hard practical sources, desaturated palette except for skin and key colour, raining-throughout damp atmosphere."
- *Uncut Gems* feel: "Hard fluorescent overhead practicals, saturated jewel tones, claustrophobic close coverage, restless handheld camera."

### Roger Deakins
**Films:** *Blade Runner 2049*, *1917*, *Skyfall*, *No Country for Old Men*.
**Signature:** Architectural composition, motivated practical light (often a single hard source), wide-format framing, deep focus mixed with selective shallow.
**Translation:**
> "Architectural composition, single hard motivated practical light source, wide framing (anamorphic 2.39:1), deep blacks, restrained palette, subject often centred or at strong compositional point, considered stillness."

### Christopher Doyle
**Films:** *In the Mood for Love*, *Chungking Express*, *Hero*.
**Signature:** Saturated colour, intimate handheld, neon and practical-rich interiors, slow-motion for emotion.
**Translation:**
> "Saturated palette — deep reds and blues — handheld intimacy, neon practicals as key sources, slight motion blur or slow-shutter feel, dense urban atmospherics, intimate close coverage."

### Hoyte van Hoytema
**Films:** *Interstellar*, *Dunkirk*, *Oppenheimer*, *Her*.
**Signature:** IMAX-scale, deep focus, hard contrast, often natural-light dominant or single-practical, scale-conscious framing.
**Translation:**
> "Large-format IMAX feel, deep focus throughout, hard contrast curve, natural sources or single hard practical, sense of scale in framing — subject in vast environment or extreme close on small detail."

---

## Light qualities — the canonical descriptions

These descriptions go directly into prompts (in the LIGHT layer for Veo, the LIGHTING field for Kling):

| Light | Prompt language |
|---|---|
| **Golden hour** | "Low warm sun from camera-left, long shadows raking across the foreground, soft golden ambient bouncing into shadows, late afternoon light." |
| **Magic hour / blue hour** | "Twilight — the 20 minutes after sunset — cool deep-blue ambient sky with warm sodium-vapor street lights, balanced exposure between sky and practicals." |
| **Hard midday sun** | "Direct overhead sun, harsh shadows, high-contrast lighting, bleached highlights, deep clear-sky blue ambient." |
| **Overcast daylight** | "Diffused soft overcast daylight, no hard shadows, even exposure across the frame, slightly cool grey-white tonality." |
| **North window** | "Soft directional cool light from a north-facing window, gentle falloff, indirect natural light, even, no hard shadows on the subject." |
| **South window with sun** | "Hard directional warm sunlight through a south-facing window, raking across the floor, casting hard shadows in the camera-opposite direction." |
| **Tungsten interior / lamp light** | "Warm yellow-orange ambient from visible practical lamps, soft falloff, deep shadows in unlit corners, intimate domestic feel." |
| **Fluorescent / institutional** | "Cool green-tinted overhead fluorescent strips, even but flat lighting, no hero shadow, slight buzz in highlights, institutional feel — office, hospital, supermarket." |
| **Neon / urban night** | "Saturated neon practicals — pink, cyan, magenta — reflecting off wet asphalt, deep ambient blacks, faint volumetric haze in the air, urban night." |
| **Candlelight / firelight** | "Warm low flickering light from a single candle (or fire) on the camera-right, the rest of the room falling into deep shadow, soft falloff, intimate or threatening register." |
| **Backlight / silhouette** | "Strong backlight from behind the subject, subject in silhouette or rim-lit, source lens-flaring slightly, high contrast against subject." |
| **Top light** | "Hard light from directly above the subject, eye sockets falling into shadow, the cheekbones and nose lit, ominous mood." |
| **Volumetric / hazy** | "Visible light beams in the air, atmospheric haze, dust or fog catching the light, dramatic shafts." |

---

## Palette options

Pre-built colour grade descriptors for common looks:

- **Naturalistic warm**: "Warm-leaning grade, lifted blacks, restrained saturation, skin tones true, no teal-orange push."
- **Cool documentary**: "Cool-leaning grade, slightly desaturated, even exposure, slight blue cast in shadows, naturalistic skin."
- **Bleach bypass**: "Desaturated, high contrast, harsh blacks, washed colour in midtones — *Saving Private Ryan* feel."
- **Period faded**: "Slightly faded warm tones, low saturation, mild halation in highlights, slight grain — 1970s film stock memory."
- **Hollywood teal-orange**: (Use only when explicitly briefed for blockbuster register.) "Pushed teal in shadows, warm orange in midtones and skin, high saturation, glossy."
- **Scandinavian cool**: "Cool blue-grey ambient, low saturation, restrained warmth, skin slightly desaturated, even contrast — Nordic noir register."
- **Mediterranean warm**: "Warm honeyed ambient, sun-baked palette, deep amber shadows, slight skin warmth, no saturation push."
- **Cyberpunk neon**: "Saturated cyan + magenta dominant, deep blacks, bright neon practical sources, urban night, glossy wet surfaces."

---

## Lens-feeling vocabulary

In addition to focal length numbers, these descriptive terms reliably shift Veo and Kling output:

- "Subject pops, background falls into soft creamy bokeh." (Short telephoto, shallow depth.)
- "Naturalistic perspective, environment readable, slight depth compression." (35mm.)
- "Wide expansive view, slight edge distortion, sense of space and scale." (Wide-angle.)
- "Background heavily compressed, subject isolated, surveillance feel." (Telephoto, deep compression.)
- "Macro detail, surface textures clear, shallow depth on a single feature." (Macro.)

---

## Texture / grain / film stock cues

These produce the tactile quality that distinguishes "shot on a camera" from "AI-rendered":

- "Fine 35mm film grain throughout."
- "Visible halation in highlights, slight bloom around bright sources."
- "Slight gate weave, the frame breathing imperceptibly." (Period film feel.)
- "Mild diffusion / slight softness in highlights, period lens look."
- "16mm grain, more pronounced, slightly noisier shadows." (Indie / documentary feel.)
- "Polaroid SX-70 feel — soft focus, slightly washed colour, instant-film vignette."
- "Digital cinema clean — sharp throughout, no grain, controlled colour." (When the brief is glossy commercial.)
- "VHS-era video — interlace artefact, slight chromatic noise, lo-fi colour." (Period 80s/90s feel.)

---

## Negative style — what to exclude

The default cinematic photoreal *avoids*:

- "AI plastic skin" — counter with "natural skin texture, visible pores, subtle asymmetry, slight imperfections."
- "Over-saturation / HDR look" — counter with "restrained saturation, naturalistic colour, soft contrast curve."
- "Slick CGI gloss" — counter with "matte surfaces, naturalistic textures, no over-rendered shine."
- "Generic cinematic lens flares" — counter with "no anamorphic flares" (unless the brief calls for them).
- "Wide-eyed AI faces" — counter with "natural eye proportions, subject's gaze focused and grounded, no exaggerated features."

Include these negatives explicitly in prompts when the model is drifting toward them.

---

## Adapting the default for specific briefs

When the user names a different aesthetic, build a fresh style lock by combining:

- A photographer or DP reference (translated technically).
- A palette choice.
- A film stock / texture cue.
- A lens preference.
- A lighting register.
- Explicit negatives for what to avoid.

Lock that combined style at the top of the storyboard and inject into every shot. The single most important consistency lever is having one style block, not many.
