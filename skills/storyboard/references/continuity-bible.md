# The Continuity Bible

The single most reliable way to keep AI video output consistent across a sequence of clips is to lock the descriptions of every recurring entity at the start of the storyboard, then paste those descriptions verbatim into every shot prompt that contains them.

AI video models do not remember between clips. They do not understand that "the same character" should appear consistently across two prompts unless the prompts use the *exact same words* to describe that character. Names don't carry. References don't carry. Even paraphrases drift.

This file covers what to lock, how to lock it, and how to inject it.

---

## What to lock

Three categories:

### Characters
Anyone who appears in more than one shot. Even if they're not central — the bartender who recurs, the kid in the background who matters in shot 7. Lock them.

### Locations
Every distinct space the camera enters. Even if a location only appears once, lock it for internal consistency across the multiple shots that cover it.

### Props
Any object that recurs, *or* is a story object (the photograph, the gun, the coffee cup, the watch, the note, the phone). One-time generic props (a glass of water nobody references later) don't need locking.

---

## Templates

### Character template

```
ID: CHAR-[SHORT-NAME]
NAME: [If any]
AGE: [Specific — "34" not "30s"]
ETHNICITY / FEATURES: [Skin tone described in physical terms — "warm brown skin, broad nose, dark almond eyes" — not just label. Eye colour, eye shape. Eyebrow shape if distinctive.]
HAIR: [Colour, length, cut, texture, styling — "shoulder-length tightly curled black hair worn loose" — never just "long black hair"]
BUILD: [Height/build descriptor — "tall, lean, slightly stooped"]
FACE: [Distinctive features — "narrow jaw, slight dimple in left cheek, faint scar above the right eyebrow, perpetually tired eyes"]
WARDROBE: [Every item — "navy wool peacoat, single button fastened, oatmeal cable-knit jumper, dark indigo selvedge jeans, scuffed brown leather boots, brass-rim aviator sunglasses pushed up on her head, thin gold chain necklace"]
DISTINGUISHING DETAILS: [Glasses, jewellery, tattoos, scars — anything visible]
VOICE (for Veo 3 dialogue): [Tonal description — "soft Brooklyn-inflected alto, slightly hoarse"]
MICRO-BEHAVIOUR: [Characteristic gestures — "tucks hair behind left ear when uncertain", "speaks slightly out of the side of her mouth"]
```

**Critical:** Every adjective in the wardrobe section is load-bearing. "Blue jacket" produces inconsistent jackets across clips. "Faded indigo denim chore jacket with copper buttons and slightly frayed cuffs" produces a recognisable, repeatable jacket.

### Location template

```
ID: LOC-[SHORT-NAME]
TYPE: [Interior / Exterior]
PLACE: [Specific — "1970s American diner", "Edwardian terraced house kitchen, London", "Tokyo subway platform"]
GEOGRAPHY: [Layout — what's where. "Long galley kitchen, sink and window on left wall, range against right wall, narrow island down centre, archway to dining room at far end"]
TIME OF DAY: [Specific — "late afternoon, golden hour" / "3am, fluorescent overhead" / "overcast morning, soft directional light from north window"]
LIGHT DIRECTION: [Where it comes from — critical for cross-shot consistency. "Hard sunlight from camera-right window, raking across the table; deep shadow on camera-left walls"]
PALETTE: [Dominant colours — "muted warm — cream walls, oak floors, brass fittings; small accent of cobalt blue from a kettle on the range"]
TEXTURES: [Surface qualities — "matte plastered walls, glossy oak floor, brushed steel range, woven wicker baskets"]
PROPS / SIGNAGE / DETAILS: [Identifiable items that lock the location — "a hand-painted sign above the doorway reading 'THE GROCER'S DAUGHTER', three blue-and-white striped tea towels hanging from the oven handle, a chipped enamel canister labelled FLOUR"]
ATMOSPHERE: [Mood — "lived-in, slightly cluttered, warm but tired"]
```

### Prop template

```
ID: PROP-[SHORT-NAME]
TYPE: [What it is]
DESCRIPTION: [Visual specifics — "a chipped enamel mug, white with a faded blue rim, a small chip on the lip nearest the handle, ¾ full of black coffee, faint steam rising"]
CONDITION / STATE: [Important if the prop changes — "in shot 03 the mug is full; in shot 11 it's empty with a coffee ring on the table"]
SIGNIFICANCE: [Why it recurs — "the mug is hers; passing it to him in shot 17 is the gesture that signals reconciliation"]
```

---

## How to inject the Bible into prompts

This is the operational part. The Bible exists at the top of the storyboard for the user's reference. But its descriptions also get pasted *verbatim* into every shot prompt where the entity appears.

**Veo 3.1** — paste descriptions inline within the prompt's natural sentence flow:

> "Medium shot. The kitchen — a long galley with sink and window on the left wall, hard afternoon sunlight raking across an oak island down the centre, deep shadow on the camera-left walls. Maya — a 34-year-old Black woman with shoulder-length tightly curled black hair worn loose, faint scar above her right eyebrow, wearing faded blue surgeon's scrubs and a thin gold chain necklace — stands at the island, facing camera-right, holding a chipped white enamel mug with a faded blue rim, ¾ full of black coffee, faint steam rising. Her brother enters frame from camera-left..."

**Kling 2.5/2.6** — descriptions are tighter but the same principle applies, possibly slightly more compressed:

> "Subject: Maya, 34, Black woman, shoulder-length curly black hair, faint scar above right eyebrow, faded blue scrubs, thin gold chain. Setting: long galley kitchen, oak island centre, hard afternoon sun raking from left window. Action: stands at island facing camera-right, holding chipped white-and-blue enamel mug, steam rising. Camera: medium shot, static, eye-level, 35mm lens. Lighting: hard directional sun from camera-left, deep shadows on opposite wall. Mood: tense, charged stillness."

**The rule:** The character's hair, face, wardrobe phrasing must be *literally identical* across all prompts in the same storyboard. Even small variation ("dark hair" vs "black hair") can cause drift between clips. Copy-paste discipline.

---

## Naming and ID conventions

Use IDs in the storyboard's metadata and grammar fields, but **never** in the actual generation prompts. The IDs help the human user track entities; the AI model sees only the descriptive text.

Suggested format:
- `CHAR-FIRSTNAME` (CHAR-MAYA, CHAR-DAVID)
- `LOC-PLACE-TIME` (LOC-KITCHEN-AFTERNOON, LOC-STREET-NIGHT)
- `PROP-OBJECT` (PROP-COFFEE-MUG, PROP-PHOTOGRAPH)

When the same location appears at different times of day, lock each as a separate entry — they are visually different scenes (LOC-KITCHEN-AFTERNOON vs LOC-KITCHEN-NIGHT).

---

## Style lock — the one-doc-wide aesthetic Bible

In addition to entity-level Bibles, lock the style of the *whole piece* once at the top:

```
STYLE LOCK
LOOK: [Cinematic photoreal / 16mm grain / Polaroid faded / glossy commercial / etc.]
DP / PHOTOGRAPHER REFERENCE: [Name plus the *technical specifics* of the reference]
LENS DEFAULT: [35mm full-frame equivalent unless a shot specifies otherwise]
APERTURE / DEPTH: [Shallow / medium / deep]
COLOUR GRADE: [Specific — "desaturated teal-orange Hollywood blockbuster", "naturalistic warm whites and saturated greens", "cool blue-grey Scandinavian"]
FILM STOCK FEEL (optional): ["Kodak Vision3 500T feel", "Fuji Eterna 250D feel", "16mm Kodachrome", "video / digital crispness"]
LIGHTING REGISTER: [Naturalistic / theatrical / high-contrast / soft / harsh]
GRAIN / TEXTURE: [Clean / fine grain / noticeable grain / scanned-film artefacts]
NEGATIVE STYLE: [What this is NOT — "no slick CGI gloss, no glossy commercial polish, no over-saturation"]
```

Paste this style lock — at minimum the LOOK, DP REFERENCE, LENS, COLOUR GRADE, and LIGHTING REGISTER lines — into every shot prompt. This is what makes a 24-shot storyboard feel like one piece rather than 24 separate AI tests.

---

## When the user has Veo 3.1 first/last frame or Kling start/end frame access

If the user can chain clips via first/last frame conditioning — and most professional users now can — note in the shot block which shot's *end frame* feeds the next shot's *start frame*. This carries character likeness across the cut more reliably than text-only Bible injection.

Workflow:
1. Generate shot N normally with the full Bible-injected prompt.
2. Use the final frame of shot N as the start frame for shot N+1.
3. The prompt for shot N+1 still includes the full Bible descriptions, but now the model also has the literal previous frame as visual anchor.

For storyboard work: mark `CHAIN: end-frame-of-N → start-frame-of-(N+1)` in the shot blocks where this applies. This is most useful for cutting on action and for shots that are within the same continuous scene.

---

## A final reminder

The Bible isn't ceremony. It is the difference between a storyboard whose 24 clips read as a single piece of film and a storyboard whose 24 clips look like 24 separate experiments featuring vaguely similar people. Spend the time on the Bible. Be obsessive about wardrobe specifics. The payoff is a storyboard that actually delivers a coherent piece of work.
