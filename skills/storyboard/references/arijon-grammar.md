# Arijon's Grammar of the Film Language — Working Reference

This file compresses the actionable rules from Daniel Arijon's *Grammar of the Film Language* (Focal Press, 1976) into a working reference for storyboard construction. The book is exhaustive; this is the operational subset. When a configuration isn't covered here and the brief calls for it, the source book has it — Arijon catalogued nearly every body-axis-cut combination across 28 chapters and 1,500+ diagrams.

The deepest principle in the book, beneath all the specific rules: **film grammar is a system for telling the audience where they are.** Every rule below exists to keep the viewer spatially and temporally oriented across cuts. Break a rule on purpose and you create disorientation — sometimes that's the goal. Break a rule by accident and you've made the audience work to follow what should have been effortless.

---

## 1. The Line of Interest (the 180° axis)

The single most important concept in the book.

The **line of interest** is an imaginary axis that runs through the subjects of a scene. In a two-person dialogue, it runs from one character's eyes to the other's. In a chase, it runs along the direction of motion. In a single-subject scene, it runs along their line of sight or motion.

**The rule:** Once the line is set, the camera lives on one side of it for the entire scene. All shots are taken from that 180° half-space.

**Why:** It preserves screen direction. If A is camera-left and B is camera-right in shot 1, then in shot 2 (the reverse on A), A still occupies camera-left in the audience's mental model and B is implied off-screen camera-right. Cross the line and A jumps to camera-right — the audience reads this as A having physically swapped sides, or worse, two different scenes spliced together.

**Crossing the line legitimately requires one of:**
- A neutral shot in between — head-on or tail-on (looking straight along the axis), which has no left/right and lets the camera "swing" to the other side.
- A character physically crosses the line in the next shot (we *see* them move from one side to the other).
- A cutaway (a non-master shot — a prop, a hand, a clock) — the cutaway breaks the spatial logic and lets us re-establish from the new side.
- A camera move that *carries* us across — a tracking shot or pan that physically traverses the axis.
- A punctuation device (fade, dissolve, jump cut) — but this signals time/space discontinuity, not just a new angle.

**For storyboard work:** Mark line-of-interest direction on every shot. When two adjacent shots are on opposite sides, verify one of the legitimate crossing devices is in place.

---

## 2. The Triangle Principle and the 5 Camera Positions

The triangle principle is the geometric foundation of the book. For any line of interest, draw a triangle whose **base is the line of interest** and whose **apex is the camera**. Move the apex around the line and you generate every legitimate camera position. The five canonical positions:

### A. External reverse (over-the-shoulder, OTS)
Camera is behind one subject, looking past them toward the other. Includes the foreground subject's shoulder/head as a soft frame element. Triangle apex is far from the line.

**What it says:** Two subjects, in conversation, with one momentarily privileged. Establishes spatial relationship while focusing on the second subject's reaction. Workhorse of dialogue scenes.

### B. Internal reverse
Camera is *between* the two subjects, on or close to the line, looking at one of them. The other subject is implied off-screen behind the camera. Triangle apex is close to the line, between the players.

**What it says:** Subjective intensity. Closer to the experience of *being* the other person. Stronger emotional weight than external reverse. Often paired with closer focal lengths.

### C. Parallel
Two cameras on the same side of the line, both looking across it from similar angles, framing each subject in their own shot. The two shots cut together as a matched pair — same lens, same height, same angle relative to the line.

**What it says:** Equality. Two subjects in symmetrical relationship. Common in confrontation scenes where neither character dominates.

### D. Common visual axis (head-on / tail-on)
Camera is on the line itself, looking directly along it. This is the **neutral angle** — it has no left/right screen direction. Critical use: it lets the camera safely jump to the other side of the line in the next shot.

**What it says:** Confrontation (head-on toward a subject is direct, almost accusatory) or detachment (tail-on, observing from behind). Also the tool for legitimate axis crossing.

### E. Right-angle (90° to the line)
Camera is perpendicular to the line, viewing both subjects in profile. This is the classic **two-shot**.

**What it says:** Both subjects are equally present, equally observed. The audience sees the relationship in geometry. Good for establishing or for moments of equilibrium.

**Compositional note:** Arijon emphasises that the *heads* are the visual anchor — eyelines define the line of interest, so head positions in frame must agree with the line. A correctly composed shot positions the on-screen head such that their eyeline points toward the off-screen partner's implied position.

---

## 3. Screen Direction

Screen direction is the **left-right movement vector** in the frame. It must remain consistent across cuts unless deliberately broken.

**The rule:** A subject moving screen-right in shot N continues moving screen-right in shot N+1. A subject looking screen-left in shot N is implicitly looking at something screen-right of them — and in the cut to that something, the something must be on the screen-right side of its own frame.

**Tools for changing direction safely:**
- **Neutral angle in between** — a head-on or tail-on shot has no direction, so the next shot can establish a new direction.
- **The subject visibly turns** — we see them change direction within a shot.
- **Cutaway** — break the direction tracking with a non-character shot.
- **Establishing wide** — re-orient the audience with a fresh geographic shot.

**For dialogue:** Two subjects looking at each other have *opposed glances*. A looks screen-right; B looks screen-left. Cut between them and the audience reads them as connected. Mismatched glances (both looking the same direction) read as both looking at a third party off-screen, not at each other.

---

## 4. Eyeline Matching

Tighter than screen direction, the **eyeline match** is the rule that when we cut from a person looking at something to a shot of that something, the geometry of their gaze must match the geometry of where the something is in its own frame.

**Rules of thumb:**
- A's eyeline points screen-right and slightly up → cut to B framed slightly low (we're looking down at B from A's eyeline).
- A's eyeline points screen-left and level → cut to B framed at eye level, on the screen-left side of B's frame.
- If A is significantly taller than B, A's eyeline tilts down; in the reverse, B's eyeline tilts up. Mismatched height reads as the characters are not in the same room.

**Implication for storyboarding AI video:** Eyeline data does not live in the prompt language naturally. You have to *describe* it. "She glances down and to her right toward the open notebook on the table" puts the geometry into Veo 3 directly, where prompt structure can preserve it.

---

## 5. Establishing and Re-establishing

The **establishing shot** is the wide that maps geography. Where are we, what's the layout, who's here, what's the time of day, what's the mood. It's the audience's spatial anchor.

**The rule:** Open every new location with an establishing shot, or with a sequence that builds to one within the first 2–3 shots. If you start tight (a close-up), you owe the audience the wide soon — typically by the third shot — or they'll never know where they are.

**Re-establishing:** For longer scenes, periodically return to the wide. Arijon's exact frequency rule: re-establish whenever the audience's spatial awareness might have decayed — typically every 8–12 shots in dense coverage, sooner if the subject's positions have changed or the scene has fragmented into close coverage.

**Modern variant:** Modern editing often uses a *delayed* establishing shot — open with intimate fragments and reveal the wide as a payoff. This works *only* when the fragments are interesting enough to hold attention without the spatial anchor. Doing this routinely is a tell that the storyboard hasn't earned its withholding.

**For ads:** A 30-second ad usually wants its establishing shot in shot 1 or 2 — viewer attention is a finite resource. A music video can withhold longer.

---

## 6. The 30° Rule

When two adjacent shots are on the same subject from the same side of the line, the camera angle must shift by **at least 30°** between them. Less than 30° and the cut reads as a jump cut — a mistake, a continuity error, a print of the same shot played twice.

**Why:** Below 30°, the subject's silhouette doesn't change enough to register as a new perspective. The audience's brain reads the cut as a glitch.

**Application:** When designing close-coverage of a single subject (e.g., a monologue), plan the angles. CU front, then CU at 45° camera-left, then ECU front, then OTS from the listener's position — each successive shot is well clear of the 30° threshold.

**Deliberate violation (jump cut):** Used as a *style* — Godard's *Breathless* — to convey jaggedness, anxiety, time-skip, or kinetic disorientation. Used on purpose, it's a punctuation device. Used by accident, it's an error.

---

## 7. Number Contrast and Coverage Rhythm

A scene's **rhythm** comes from variance in shot scale and number of subjects in frame.

- **Number contrast** — alternating between 1-shots, 2-shots, 3-shots, group shots. Three close-ups in a row of three different characters loses spatial relationships; cutting to a 2-shot or wide re-grounds them.
- **Scale contrast** — alternating between WS, MS, CU. A scene of all close-ups feels claustrophobic (sometimes desired); a scene of all wides feels detached.
- **Pace contrast** — varying shot duration. A scene of all 4-second shots has no breath. Mix 2s, 5s, 8s shots to create rhythm.

**Rule of thumb:** Look at the storyboard's shot list. If every shot is a CU, or every shot is 5 seconds, or every shot is a 1-shot, the rhythm is broken. Diversify before generating.

---

## 8. Master Scene and Coverage

The classical method:
1. Shoot the entire scene as a **master** (a wide that captures all the action).
2. Shoot **coverage** — closer angles on each character/moment from the master, matching action and dialogue exactly.
3. In editing, cut between the master and coverage to produce the rhythm and emphasis.

**For storyboarding:** Even when generating with AI video, the master-and-coverage logic still applies as a *planning* tool. Decide what your "master" is for a given scene (the wide that establishes the geography), then decide which moments need closer coverage and from which angles. The master is your geographic insurance — if any cut feels disorienting, you can return to the master.

In AI video terms, the master and coverage are separate clips. The Bible carries continuity across them.

---

## 9. Cutting On Action

The cleanest cut is one that **happens during a movement** — a door opening, a head turn, a sit-down, a hand reaching for an object. The motion carries across the cut, and the eye's focus on the moving thing hides the change in angle.

**Technique:**
- Identify a movement that occurs in both shot A (end) and shot B (start).
- The motion vector should match — if the door swings camera-right in A, it continues camera-right in B.
- The cut point is mid-motion, not at start or end.

**Why:** The audience's eye is following the motion, not analyzing the cut. Spatial discontinuities are forgiven.

**For AI video:** Cutting on action means the *end frame* of clip N and the *start frame* of clip N+1 should depict the same moving subject mid-action. Veo 3's first/last frame and Kling's start/end frame features are exactly the tool for this.

---

## 10. Cutaways and Inserts

A **cutaway** is a shot of something other than the main action — a listener's face, a clock, a hand, a window — used to:
- Compress time (cut from "starting to write the letter" to "finishing it" via a cutaway to the clock).
- Hide a continuity error or transition (the cutaway breaks the eye's tracking of the master).
- Punch a beat (cutaway to a tear, a smile, a clenched fist).
- Re-establish a relationship (cutaway to the listener reminds us they're still there).

An **insert** is similar but specifically a close shot of an object (the gun on the table, the photograph in her pocket, the message on the screen). Inserts carry plot information; cutaways carry mood or rhythm.

**For storyboarding:** Plan your cutaways and inserts. They are not afterthoughts — they're load-bearing. The cutaway to the clock is what makes the time-compression cut work.

---

## 11. The Pause

The **silent reaction shot** — a held look on a character without dialogue or action — is the single most underused tool in the book. Arijon dwells on it across multiple chapters.

**Why it works:** Dialogue carries information; the pause carries emotion. After a difficult line, the pause on the listener tells the audience how to feel about what was said. Without the pause, the audience moves on without absorbing.

**Rule:** After a key line, hold on the listener for 2–4 seconds. The held look is more often the most memorable shot of the scene than the line itself.

**For AI video:** A pause is its own clip. Don't merge it into a multi-action shot. Generate the held reaction as a separate clip with no dialogue, ambient sound only, the character's face slowly shifting (a micro-expression — the eyes lower, the jaw tightens). 4–6 seconds is the right duration.

---

## 12. Motion Cutting and Direction Match

When a subject moves between shots, the **motion direction** must continue consistently or be deliberately reset.

**Rules:**
- A walks screen-right in shot N → A enters frame from screen-left in shot N+1, still moving screen-right.
- If A exits frame-right at the end of shot N, the next shot opens with A entering frame-left (continuing the trajectory) or with the destination already in view.
- To reverse direction: head-on or tail-on shot in between, OR A visibly turns within a shot, OR cutaway.

**Subject converges with another subject** (Player A walks toward Player B):
- Show A walking toward camera, then cut to B awaiting (with A entering B's frame from behind camera or from B's POV).
- Or, master shot of both, then cut to closer coverage as they meet.

**Subject moves away from another subject:**
- Hold on the static subject (B) as A exits frame, with B's gaze tracking A's exit direction.
- Cut to A walking away (back to camera, or in profile).

**Both subjects move:** Either keep a master shot for the duration, or cut between matched coverage that maintains both subjects' direction relative to the line.

---

## 13. Camera Movement as Grammar

Camera moves are not decoration. Each one is a grammatical choice with a specific function.

| Move | What it says |
|---|---|
| **Static** | Observation, stillness, attention to subject performance. |
| **Pan** (horizontal) | Following a movement, revealing geography, surveying. Slow pan = suspense; whip pan = punctuation/transition. |
| **Tilt** (vertical) | Revealing scale (tilt up to reveal a tall building), looking up to authority / down to vulnerability. |
| **Dolly / track** (linear movement of camera body) | Travelling with the subject's emotional state. Push-in = pay attention to what's coming into focus. Pull-out = reveal context. Tracking parallel = sustained presence. |
| **Crane / jib** (vertical movement) | Scale reveal, transcendence (rising up), descent (lowering into intimacy). |
| **Zoom** (lens-focal-length change) | Different feeling than dolly — flattens or compresses. Slow zoom = unease (the lens feels wrong). Snap zoom = aggression. |
| **Handheld** | Subjectivity, urgency, documentary realism, instability. |
| **Steadicam / gimbal** | Smooth tracking with characters, immersive without the static feel. |
| **Drone / aerial** | Scale, omniscience, geography. |
| **Lock-off (no move)** | Formal, observational, sometimes ironic. |

**The 20 rules from chapter 20 (Arijon), in compressed form:**
1. Movement requires dramatic motivation. No purposeless moves.
2. Movement is initiated by a story event, not for its own sake.
3. The camera moves *with* the subject (following) or *against* (resisting) — the choice carries meaning.
4. Stop movement before the line is delivered, or move on a beat where the audience is processing visually, not linguistically.
5. Match movement direction to story direction — if she's leaving him, the camera moves with her, not him, unless the focus is his abandonment.
6. End on a static frame. The held final position lets the move register.
7. Pace of camera move should match emotional pace — slow for grief, fast for panic.
8. Don't cut mid-move unless cutting on action.
9. After a moving shot, the next shot can be static — the contrast is rhythmic.
10. After a static-heavy run of shots, a moving shot lifts the energy.

(The full 20 are in the source book; the above 10 cover most decisions.)

---

## 14. Action Scenes

For physical action (fights, chases, sport):

**Five ways to enhance action** (chapter 24):
1. **Multiplied angles** — fragment the action across many quick shots from many angles. Each shot shows a small piece. The audience reconstructs the whole.
2. **Subjective POV** — put the camera in the action (over the shoulder of the runner, in the fist's path). Visceral.
3. **Variable shot length** — the frequency of cuts can match heartbeat. A fight cuts every 0.5–1.5s; a chase can be 1–3s.
4. **Slow motion** — for dramatic emphasis on a moment within action. Use sparingly.
5. **High-speed (under-cranking)** — for chaos. Faster than reality.

**Climax via fragmentation:** When approaching the action's peak, accelerate the cutting. Wider shots become close-ups. Long takes become flash-frames. The audience's pulse follows the cutting rhythm.

**Cutting after movement vs. on peak:** Old rule (Arijon): let the movement end before cutting. Modern rule (post-1980s editing): cut at the peak of the movement to carry energy across the cut. Both work; the modern method is more kinetic.

---

## 15. Punctuation Devices (Chapter 28)

Transitions between scenes, used as the prose punctuation of film:

| Device | Function |
|---|---|
| **Cut** | The default. No transition; instant. |
| **Fade in / fade out** | Significant time passage, beginning/ending a section, formal closure. |
| **Dissolve** | Soft time bridge; dream / memory / parallel; gentler than a cut. |
| **Wipe** | Lateral pull-through. Stylistic, period-flavoured (Star Wars, classic Hollywood). |
| **Iris in / out** | Highly stylised, period transition (silent cinema). Use ironically or for tonal flavour. |
| **Whip pan / smash cut** | Aggressive transition, often comedic or kinetic. |
| **Match cut** | Cut between two shots that share a visual rhyme (the bone in *2001* matching the spaceship). The most powerful transition in film grammar. |
| **Sound bridge** | Audio of next scene begins under final shot of current scene; smooths transition and sets up. |
| **Jump cut** | Same subject, slight angle shift, used for time-compression or stylistic anxiety. |
| **Black frame / white frame** | Punctuation pause, breath, or emphasis. |
| **Frozen frame** | Held still image; finality, suspended moment, end of arc. |

For AI storyboard work, most punctuation is between clips — you describe the device in the storyboard's continuity notes and the user implements in editing. Match cuts can be designed at prompt level: shot A ends on visual element X, shot B opens on a similar element X' — describe both prompts to converge on that visual rhyme.

---

## 16. Two- and Three-Player Dialogue Configurations

Arijon devotes chapters 5–7 to dialogue staging. Compressed:

**Two players, face to face (most common):**
- Master 2-shot (right-angle to the line) establishes geography.
- External reverse on each (OTS) for the shoulders-of-listener framing.
- Internal reverse on each (closer, no shoulder, more subjective) for emotional intensity.
- Cut between externals or between externals and internals as the scene escalates.

**Two players, side by side (driving, walking, sitting on a bench):**
- The line of interest runs between them but is foreshortened. Triangle positions are along the perpendicular.
- Two-shot from the front (parallel composition).
- Singles via OTS from one to the other (the back of one's head soft in foreground).
- Profile shots (right-angle to the line — into the side of their faces).

**Three players — the regular case (triangle):**
- The line of interest may shift depending on who is speaking to whom.
- Establishing 3-shot from outside the triangle.
- When A speaks to B, the line is A↔B; cut to coverage on that axis.
- When the line shifts (B turns to address C), bridge with a 3-shot or pivot through C's reaction.
- Be alert to the fact that 3-player scenes have multiple lines of interest and the audience must be helped to track which is active at any moment.

**Four or more — group dialogue:**
- A common visual axis (camera looking down the table) gives a unified frame.
- Right-angle camera positions on subgroups.
- Pivot through reaction shots when the addressed party changes.
- Re-establish with the wide more often than in two-handers.

---

## 17. Zone-to-Zone Movement

Arijon's later chapters (25–26) deal with movement of subjects from one part of a location to another.

**The rule:** When a subject moves from zone A to zone B within a scene, the audience must understand the geography. Either:
- Show the move continuously (master shot).
- Show the move in a cut sequence where the geography is maintained (subject exits frame-right in zone A; enters frame-left in zone B; the cut implies the traversal).
- Use a cutaway during the traversal to compress time.

**Don't cut mid-traversal across a hard direction change** — the audience loses where they are.

**Group expansion / contraction:** When characters arrive into a scene (the group expands) or leave (contracts), give the audience a moment to register the change before the next cut. This is often a 2-second held wide.

---

## 18. The Cut Itself

When the cut should happen:

- **On action** — best, default, invisible. (See section 9.)
- **On eyeline shift** — character looks; cut to what they're looking at.
- **On dialogue beat** — cut on the listener's first reaction to a key word.
- **On sound match** — sound element bridges the cut.
- **On rhythm** — when the shot has done its work and any longer would be padding.
- **On surprise** — cut on the unexpected moment, not the expected one. The viewer's brain prepares for the predictable cut and is jolted by the actual one.

**When NOT to cut:**
- Mid-line of dialogue without strong reason. The line should land before the angle changes (unless the cut is *on* the speaker's mouth shape, used stylistically).
- During a slow camera move that hasn't completed its rhetorical function.
- When the audience hasn't absorbed what they were just shown.

**A held shot teaches the audience how to feel.** Cutting too soon makes a scene feel rushed; cutting too late makes it feel lethargic. The right cut point is when the shot's emotional payload has just landed.

---

## Summary card — the rules to check on every storyboard

Before delivering a storyboard, walk through this checklist:

1. **Line of interest** — set per scene, camera lives on one side, crossings are motivated.
2. **Triangle positions** — camera positions are recognisable canonical ones, not arbitrary.
3. **Screen direction** — consistent across cuts unless deliberately reset.
4. **Eyeline match** — gazes meet across cuts.
5. **Establishing** — every new location has a wide within the first 2–3 shots.
6. **30° rule** — adjacent shots on same subject differ by 30°+.
7. **Number contrast** — scene mixes 1-, 2-, 3-shots; mixes scales.
8. **Coverage rhythm** — shot durations vary deliberately.
9. **Cut motivation** — every cut is *on* something (action / eyeline / sound / surprise).
10. **Pauses present** — silent reactions hold weight in dialogue scenes.
11. **Action scenes** — fragmentation, scale variation, climax acceleration.
12. **Punctuation** — transitions between scenes use appropriate devices.
13. **Camera moves are grammar** — every move has a function.

If any of these checks fail, fix the storyboard before delivery. Don't deliver and explain.
