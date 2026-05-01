---
name: storyboard
description: Use this skill whenever the user wants to develop a storyboard, write sequential AI video generation prompts, or break a script, premise, or beat-list into a shot-by-shot visual sequence. Trigger on phrases like "storyboard," "shot list," "break this into shots," "AI video prompts," "Veo 3 prompts," "Kling prompts," "sequence of clips," "storyboard for an ad / music video / short film." Trigger when the user gives a script, premise, beat-list, or rough idea to develop into a sequential plan another model can generate as video. Produces craft-grade storyboards informed by Daniel Arijon's Grammar of the Film Language — shots respecting line of interest, screen direction, eyeline matching, and the triangle principle. Output is rich markdown with a continuity bible, Arijon grammar metadata per shot, and ready-to-use Veo 3.1 and Kling 2.5+ prompts. Default aesthetic is cinematic photoreal. Do NOT use for static decks, one-off prompts, film criticism, or screenplay drafting.
---

# Storyboard

This skill produces storyboards for AI video generation that are spatially coherent, narratively compelling, and visually followable. It encodes the cinematic grammar of Daniel Arijon's *Grammar of the Film Language* (1976) — the canonical text on shot composition, screen direction, and editing continuity — and translates it into sequential prompts for Veo 3.1 and Kling 2.5+.

A storyboard from this skill is not a list of pretty shots. It is a system for moving an audience through space and time without losing them. Every shot has a function. Every cut has a rule. Every prompt carries forward the continuity that AI video models otherwise break.

## Core philosophy

Three principles override everything else in this skill:

**Followability is not optional.** If a viewer cannot answer *who is where, doing what, and why* at every cut, the storyboard has failed regardless of how beautiful the shots are. The Arijon rules exist to keep the audience oriented. They are not aesthetic preferences.

**Continuity is fought for, not assumed.** AI video models break character likeness, wardrobe, location, and prop continuity between clips by default. This skill solves that with a Continuity Bible that gets injected verbatim into every shot prompt. No exceptions.

**Compelling = specific. Creative = unexpected. Followable = grounded.** The greatest risk for any storyboard is genericness — generic prompts produce generic AI output, and AI's already strong gravitational pull is toward the average of everything in its training data. This skill fights that pull at every step with specificity, withholding, and visual rhyme.

## Reference files

Read these as needed during the workflow. Read `arijon-grammar.md` and `narrative-followability.md` on the first pass for any storyboard. Read the others as the brief demands.

- `references/arijon-grammar.md` — **Read every time.** The cinematic grammar rules from the book, condensed: line of interest, triangle principle, screen direction, eyeline matching, cutting on action, the 30° rule, establishing/re-establishing, scene matching, motion grammar, film punctuation. The single most important reference in the skill.
- `references/narrative-followability.md` — **Read every time.** How to make a sequence of shots tell a story that is compelling, creative, *and* followable. The audience's WHO/WHERE/WHAT/WHEN/WHY questions, withholding and reveal, subtext through framing, visual rhyme between shots.
- `references/continuity-bible.md` — How to construct the Bible (characters, locations, props) and how to inject it into every prompt. Templates for each entity type.
- `references/shot-vocabulary.md` — Shot distances (ECU through EWS), angles (high/low/dutch/POV/OTS), camera moves (static/pan/tilt/dolly/track/crane/zoom/handheld/gimbal/drone), lenses (16mm/35mm/50mm/85mm) — what each *says* and when to use it.
- `references/veo3-prompting.md` — How to write a Veo 3.1 prompt: the 7-layer template, native audio syntax (dialogue in quotes, SFX, ambient), 4/6/8s clip discipline, first/last frame conditioning for chaining, negative phrasing.
- `references/kling-prompting.md` — How to write a Kling 2.5/2.6 prompt: the prompt spine, motion vocabulary, beats/duration markers, the "no handheld shake" trick, 5s/10s clip discipline, start/end frame for consistency.
- `references/cinematic-style-library.md` — The default photoreal aesthetic library: photographer references (Hido, McLellan, Hawkesworth, Bush, Soth), DP references (Lubezki, Khondji, Deakins, Doyle), light qualities, lens-feeling vocabulary, film stock cues. Use this to lock a consistent look across the whole storyboard.
- `references/output-template.md` — The exact markdown structure to output. Includes the bible header, per-shot block, and the followability audit footer.

---

## The workflow

Run these six steps in order. Do not skip steps. Do not collapse them into a single pass — each step exists to catch mistakes the others can't.

### Step 1 — Intake and brief

The user will arrive with one of three input types. Detect which, then gather only the information you genuinely need to proceed.

**A. Full script** — labeled scenes, action, dialogue. Treat scenes as the unit. Ask only about: target duration per scene, format (ad / music video / short film), generator preference (Veo 3 / Kling / both), aspect ratio, and any aesthetic references the user wants to lock in beyond the default photoreal.

**B. Premise or treatment** — a paragraph, a brief, an idea. Develop the narrative spine before any shots — beats first, shots later. Ask: who's the protagonist (specifics — not "a woman" but "a 34-year-old midwife on a night shift in Lagos"), what's the dramatic arc (the change between shot 1 and shot N), what's the format and duration, what tone, what the user is *afraid* of seeing in the output (this surfaces the genuinely creative direction faster than asking what they want).

**C. Beat list or scene fragments** — bullets, scribbled moments. Confirm sequence, fill gaps, ask what binds them.

**Bias toward action.** If the user gave you enough to start, start. If something critical is missing, ask at most two questions. Never run a list of clarifying questions when the brief is workable — make the smartest assumption you can and flag it inline so the user can correct on review.

### Step 2 — Construct the Continuity Bible

**Mandatory. No shot prompts get written before this exists.**

Open `references/continuity-bible.md` and follow the templates. Produce locked descriptions for:

- **Every named character** — face (age, ethnicity, hair colour and cut, distinctive features), build, wardrobe (every item — even items that won't change), voice quality (for Veo 3 dialogue), characteristic micro-behaviours.
- **Every location** — geography (interior layout, exterior orientation), light direction and time of day, dominant colours, textures, identifiable props or signage.
- **Every story-critical prop** — the coffee cup that recurs across three shots, the photograph passed between hands, the watch the protagonist keeps checking. Lock the description.

Each entity gets an ID (`CHAR-MAYA`, `LOC-KITCHEN-NIGHT`, `PROP-COFFEE-CUP`). These IDs are referenced in shot blocks but the *description* is what gets pasted verbatim into prompts. AI video does not understand IDs. It understands "a 34-year-old Black midwife with shoulder-length box braids, wearing faded blue scrubs and white Crocs, a silver bangle on her left wrist."

If the user specified a real photographer or DP reference (e.g., Hido, McLellan, Lubezki), encode the *technical specifics* of that reference in the Bible's style section, not just the name — name-dropping in prompts is unreliable.

### Step 3 — Beat the story

Before shot grammar, verify the narrative shape. Read `references/narrative-followability.md` and apply:

- What does the audience know at shot 1? At the midpoint? At the final shot? The information curve must rise (or invert deliberately).
- Where is the withholding? What does the audience *not* see until the right moment? A storyboard with no withholding is a literal description, not a story.
- What's the dramatic question that opens the piece, and where is it answered? Even a 15-second ad has one.
- Is there visual rhyme — a shape, gesture, prop, or composition that recurs and rewards a second viewing? Most great commercials and music videos rhyme. Build one in deliberately.
- For dialogue/VO scenes: what's said vs. what's seen? Subtext through framing is the single highest-leverage move in the skill.

Output of this step: a beat-list of 4–12 narrative moments with one line each. Do not write shots yet. Get the story right first.

### Step 4 — Apply Arijon's grammar

Now translate beats into shots. Open `references/arijon-grammar.md` and `references/shot-vocabulary.md`. For each beat, decide:

1. **Line of interest** — Where is the imaginary axis between subjects (or between subject and what they're looking at)? Once set, the camera lives on one side of it for the whole scene unless there's a deliberate, motivated crossing.
2. **Triangle position** — External reverse / internal reverse / parallel / common visual axis / right-angle. Each has a specific function — see grammar reference.
3. **Shot scale** — ECU, CU, MS, MWS, WS, EWS. Vary scale across the sequence (number contrast). Never run three identical scales in a row unless you're deliberately building monotony.
4. **Camera position relative to previous shot** — If the same subject appears in consecutive shots, the camera angle must shift by at least 30° or it reads as a continuity error / jump cut. Use this to plan adjacent shot pairs.
5. **Screen direction** — If a subject moves screen-right in shot N, they must continue screen-right in shot N+1, *or* there must be a neutral angle (head-on / tail-on) in between to safely pivot direction. Mark direction on every shot.
6. **Cut motivation** — Cut on action (movement carries across the cut), cut on eyeline (gaze pulls us to next), cut on sound match, cut on visual rhyme. Never cut just because the previous shot is over — the cut must do something.
7. **Establishing logic** — Open a new location with a wide that maps geography. If the scene is long, re-establish periodically. If the scene fragments coverage from shot 1, you owe the audience an establishing shot soon.

Produce a shot list with these annotations *before* writing prompts. This is the storyboard skeleton.

### Step 5 — Write per-shot prompts (Veo 3 + Kling)

Now the prompts. Read `references/veo3-prompting.md` and `references/kling-prompting.md` and `references/cinematic-style-library.md`.

For each shot, produce a markdown block following `references/output-template.md`. Each block contains:

- **Shot header** — number, scene, scale, framing
- **Function** — what this shot does for the story (one line, ruthless)
- **Grammar metadata** — line of interest position, triangle position, screen direction, cut motivation in/out, the 30° relationship to adjacent shots
- **Continuity check** — which Bible entries appear, which props persist from previous shots, what time of day / light direction
- **Action / beat** — what happens, with physics-specific verbs
- **Dialogue / VO / sound** — only what this shot carries
- **Duration** — 4 / 6 / 8s for Veo 3, 5 / 10s for Kling — pick consciously
- **Veo 3.1 prompt** — paragraph form, 100–150 words, all 7 layers, audio inline in quotes, character description from Bible verbatim
- **Kling 2.5 prompt** — Subject + Action + Environment + Camera Movement + Lighting/Atmosphere structure, motion-led, beats/duration markers if precision matters

For dialogue and voiceover *content*, the lines themselves should follow craft-grade copywriting principles — restraint, subtext, no over-writing, trust the audience. If the user has the copywriting skill installed, draw on its anti-patterns and craft canon for the actual word choice. Lines like "Welcome to the future of dog food" are exactly what to avoid.

Default style is cinematic photoreal — apply the style library throughout unless the user specified otherwise. Lock film stock / lens / lighting style across the whole storyboard so the look is consistent shot to shot.

For **Veo 3.1 first/last frame chaining** or **Kling start/end frame** workflows, note in the shot block which shots are intended as chained pairs. This is the most reliable way to maintain character/wardrobe consistency across cuts when the user has access to those features.

### Step 6 — Followability audit

Before delivering the storyboard, run an audit. Read it as if you've never seen the brief. At each cut, ask:

- **WHO** is in this shot? Have they been seen before? Is their identity clear?
- **WHERE** are we? Has the geography been established? If the location changed from the previous shot, was there a punctuation device (cutaway, fade, dissolve, location-establishing wide)?
- **WHAT** just happened? Does the cause-and-effect from the previous shot read?
- **WHEN** are we? Is the time-of-day consistent with the previous shot, or has time elapsed? If time elapsed, is that signalled?
- **WHY** is this shot here? If you removed it, what would be lost? If nothing, kill the shot.

Where a shot fails the audit, fix it — either re-frame the shot, add a cutaway, change the cut motivation, or insert a punctuation device. Do not deliver a storyboard with broken followability and explain it in commentary; fix it in the shots.

Add a brief audit summary at the bottom of the output noting which shots are intentional withholdings (audience deliberately doesn't know something yet, with payoff at shot N) so the user knows you didn't miss them.

---

## Output rules

The output is always a single, complete markdown document containing:

1. **Header** — title, format, target duration, aspect ratio, total shot count, summary of narrative arc.
2. **Continuity Bible** — full Bible at the top of the doc, ready for the user to copy-paste reference descriptions.
3. **Style lock** — the photoreal aesthetic settings for the whole piece (DP/photographer reference if any, film stock, lighting register, palette, lens default).
4. **Shot list summary** — a compact table at the top (shot # / scale / camera / location / duration / direction) for at-a-glance review. This is the *only* table in the doc.
5. **Per-shot blocks** — full rich blocks in the format from `output-template.md`. One per shot. Sequential.
6. **Followability audit** — short final section confirming the audit passed and flagging any deliberate withholdings.

Do not present three modes ("here's a markdown version, here's a JSON version"). Markdown only, per user preference.

For long pieces (40+ shots, e.g. a music video), the per-shot block can use a *compact mode* — same fields, less prose — but never drop the Veo 3 / Kling prompts or the grammar metadata. Brevity in the descriptive fields is fine; brevity in the actual prompts and grammar is not.

---

## Anti-patterns

What this skill must never do:

- **Generic prompts.** "A woman in a kitchen" produces generic AI output. Always: which woman (Bible), which kitchen (Bible), what time, what light, what lens, what move. Specificity is the entire skill.
- **Skip the Bible.** Without the Bible, character/wardrobe/location continuity will break across clips. Every time. Always do the Bible.
- **Aesthetic name-drop without specifics.** "In the style of Todd Hido" is unreliable. "Twilight, sodium-vapor streetlight, suburban window glow, slight diffusion, deep blues and oranges, melancholic stillness, 6×7 medium format feel" is reliable. The reference informs the words; the words go in the prompt.
- **Cross the line of interest without motivation.** If you must cross it, use a neutral angle (head-on/tail-on) or a cutaway between the two shots. Never cut directly across the axis.
- **Identical adjacent shot scales.** Two close-ups in a row of the same subject from similar angles is a jump cut. Vary scale, vary angle by 30°+.
- **Camera moves with no dramatic motivation.** A push-in says "pay attention to her face." A pull-back says "look at the wider truth." A dolly says "we are travelling with her thought." Never camera move because "it looks cinematic." Movement is grammar, not decoration.
- **All shots the same length.** Rhythm is built from variance. A 4s shot followed by a 4s shot followed by a 4s shot has no rhythm. Be deliberate about which shots breathe (8s) and which snap (4s).
- **Punchline shot too early.** If the storyboard has a reveal, a money shot, a payoff — that shot is *not* shot 2. Earn it across the sequence.
- **Dialogue that explains the visual.** If the line says what the picture already says, kill the line. Subtext is what good film is made of.
- **Showing the audience why instead of letting them figure it out.** Trust the viewer. The Bible / grammar / specificity all exist to give the audience enough to reason from. Don't hand them the answer.
- **A storyboard without withholding.** A literal description of events from start to end is a logline, not a story. Identify what's withheld from the audience and where it's revealed. If nothing's withheld, you're missing the story.

---

## A note on the source material

Daniel Arijon's *Grammar of the Film Language* (Focal Press, 1976) is a 648-page systematic treatment of cinematic continuity built on diagrams of camera positions and the cuts between them. The references in this skill compress its 28 chapters into actionable rules for AI-storyboard work. Where a problem isn't in the references and the user wants a deep answer (e.g., "how do I cut a four-person dialogue with one character pivoting"), the source book has it — Arijon catalogued nearly every configuration of bodies, axes, and cuts. The skill leans on that exhaustiveness without replicating it page-for-page.
