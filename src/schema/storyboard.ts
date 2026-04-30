/**
 * Loomer — Parsed Storyboard Schema
 *
 * This is the contract between the parser (Claude) and everything downstream
 * (database, reference still generation, shot generation, UI).
 *
 * Two schemas live here:
 *
 * 1. ParsedStoryboard — what the parser produces. Pure content, no state.
 *    The parser's tool definition is derived from this schema.
 *
 * 2. Storyboard — the full app state. ParsedStoryboard plus state fields
 *    (reference_still status, key_frame URLs, approval timestamps, etc).
 *    This is what lives in the database after parsing + state initialisation.
 *
 * Keep these separate. The parser's job is content extraction; state is
 * the app's responsibility.
 */

import { z } from 'zod';

// ============================================================================
// Shared sub-schemas
// ============================================================================

/**
 * The style lock — the look-and-feel spec that gets injected into every
 * shot prompt for global consistency.
 */
export const StyleLockSchema = z.object({
  look: z.string().describe('e.g. "Cinematic photoreal, British coastal naturalism"'),
  dp_reference: z
    .string()
    .nullable()
    .describe(
      'Photographer or DP reference plus their technical signature. May be null if the storyboard does not name one.',
    ),
  lens_default: z.string().describe('e.g. "35mm full-frame, f/2.8"'),
  colour_grade: z.string().describe('e.g. "Naturalistic warm whites, restrained saturation"'),
  film_stock_feel: z
    .string()
    .nullable()
    .describe('e.g. "Kodak Vision3 500T". May be null.'),
  lighting_register: z.string().describe('e.g. "Naturalistic, motivated by visible practicals"'),
  texture: z
    .string()
    .nullable()
    .describe('e.g. "Fine 35mm grain, matte surfaces, no plastic gloss". May be null.'),
  negative_style: z.string().describe('What to exclude — e.g. "No HDR, no slick CGI gloss"'),
  aspect_ratio: z
    .enum(['16:9', '9:16', '1:1', '2.39:1', '2.35:1', '4:3', '1.85:1'])
    .describe('Frame aspect ratio for all shots.'),
  raw_block: z
    .string()
    .describe(
      'The full style lock block as it appears in the markdown, paste-ready for prompt injection. Include line breaks.',
    ),
});

// ============================================================================
// Bible entities — characters, locations, props
// ============================================================================

/**
 * Character Bible entry. The parser must extract every character that
 * appears in any shot, even minor recurring ones.
 *
 * full_description and reference_still_prompt are both required:
 *
 *  - full_description is paste-ready for shot prompts: it carries every
 *    detail (wardrobe, micro-behaviour, voice) and gets injected verbatim
 *    into Veo and Kling prompts.
 *
 *  - reference_still_prompt is the parser's reformulation for generating
 *    a neutral-lit reference still. Strip the dramatic / scene-specific
 *    context and append "neutral lighting, plain background, front-3/4
 *    angle, full body visible". This is what we send to Nano Banana for
 *    the canonical character lock.
 */
export const CharacterSchema = z.object({
  id: z
    .string()
    .regex(/^CHAR-[A-Z0-9-]+$/)
    .describe('e.g. "CHAR-LEO". Extract verbatim from the markdown.'),
  name: z.string().describe('Display name. e.g. "Leo"'),
  full_description: z
    .string()
    .describe(
      'The full Bible entry, paste-ready for prompt injection. Include every field present in the markdown — age, features, hair, build, face, wardrobe, distinguishing details, voice, micro-behaviour. Format as a flowing description suitable for direct prompt injection. Approximately 80-200 words.',
    ),
  reference_still_prompt: z
    .string()
    .describe(
      'A neutral-lit reformulation of the character description, for generating the canonical reference still. Take the visual details (face, hair, build, wardrobe, distinguishing features) and present them in flat lighting against a plain background, front-three-quarter angle, full body visible. Strip any scene-specific context (no "salt-stiffened hair", no "windswept", no environmental context). The goal is a clean character portrait that can be used as a conditioning image for downstream shots. Approximately 60-120 words.',
    ),
  fields: z
    .object({
      age: z.string().nullable(),
      ethnicity_features: z.string().nullable(),
      hair: z.string().nullable(),
      build: z.string().nullable(),
      face: z.string().nullable(),
      wardrobe: z.string().nullable(),
      distinguishing_details: z.string().nullable(),
      voice: z.string().nullable(),
      micro_behaviour: z.string().nullable(),
    })
    .describe(
      'Structured fields for UI display and selective regeneration. Each field is null if not present in the source.',
    ),
});

/**
 * Location Bible entry.
 *
 * Note on locations vs. time-of-day: the storyboard skill treats LOC-KITCHEN-AFTERNOON
 * and LOC-KITCHEN-NIGHT as separate entries. The parser preserves this distinction.
 * Each becomes its own reference still target.
 */
export const LocationSchema = z.object({
  id: z
    .string()
    .regex(/^LOC-[A-Z0-9-]+$/)
    .describe('e.g. "LOC-PIER-COASTAL-AFTERNOON". Extract verbatim.'),
  name: z.string().describe('Human-readable location name. e.g. "Pier, late afternoon"'),
  full_description: z
    .string()
    .describe(
      'The full Bible entry, paste-ready for shot prompts. Include geography, time of day, light direction, palette, textures, identifiable details, atmosphere. Approximately 100-200 words.',
    ),
  reference_still_prompt: z
    .string()
    .describe(
      'A reformulation for generating the canonical location reference still. Establish the geography and key visual identifiers in a wide-establishing composition. Include the lighting register from the Bible (this matters for locations — afternoon vs. night is the location). No characters or moving subjects in the reference. Approximately 60-120 words.',
    ),
  fields: z
    .object({
      type: z.enum(['Interior', 'Exterior']).nullable(),
      place: z.string().nullable(),
      geography: z.string().nullable(),
      time_of_day: z.string().nullable(),
      light_direction: z.string().nullable(),
      palette: z.string().nullable(),
      textures: z.string().nullable(),
      props_signage_details: z.string().nullable(),
      atmosphere: z.string().nullable(),
    })
    .describe('Structured fields for UI display. Each field is null if not present.'),
});

/**
 * Prop Bible entry. Only story-critical props get full Bible entries —
 * generic background props are described inline in shot prompts.
 *
 * generates_reference_still: whether this prop warrants its own reference
 * still. True for items that appear in multiple shots and need consistency
 * (the kite, the photograph, the watch). False for items that only need
 * to look right in a single shot.
 */
export const PropSchema = z.object({
  id: z
    .string()
    .regex(/^PROP-[A-Z0-9-]+$/)
    .describe('e.g. "PROP-KITE". Extract verbatim.'),
  name: z.string().describe('e.g. "Crimson kite"'),
  full_description: z
    .string()
    .describe('The full Bible entry, paste-ready. Approximately 40-150 words.'),
  reference_still_prompt: z
    .string()
    .describe(
      'A reformulation for the canonical prop reference still. Object centred on neutral plain background, even lighting, full visibility. Approximately 30-80 words.',
    ),
  state_transitions: z
    .string()
    .nullable()
    .describe(
      'How the prop changes across shots. e.g. "Shots 01-07: airborne and taut. Shot 08: plummets and splashes. Shots 10-14: sodden, dragged through water."',
    ),
  generates_reference_still: z
    .boolean()
    .describe(
      'true if the prop warrants its own reference still (recurring across multiple shots, or story-critical). false if it only matters in one shot.',
    ),
});

// ============================================================================
// Shots
// ============================================================================

export const ShotGrammarSchema = z.object({
  scale: z
    .string()
    .describe('e.g. "EWS", "MS", "CU", "ECU", "OTS", "POV". Extract from the markdown.'),
  angle: z.string().describe('e.g. "Eye-level", "Slightly low", "Bird\'s-eye"'),
  triangle_position: z
    .string()
    .describe(
      'Arijon triangle position. e.g. "External reverse", "Common visual axis (head-on)", "Right-angle / two-shot"',
    ),
  camera_move: z.string().describe('e.g. "Static", "Slow dolly-in", "Lateral tracking"'),
  lens: z.string().describe('e.g. "35mm at f/4", "50mm at f/2"'),
  line_of_interest: z.string().describe('Where the axis runs and which side the camera is on.'),
  screen_direction: z.string().describe('e.g. "→", "←", "Toward camera", "Neutral"'),
  thirty_degree_check: z
    .string()
    .describe(
      'How this shot relates to adjacent shots for the 30° rule. e.g. "30°+ from shot 04 around CHAR-LEO".',
    ),
  cut_in: z.string().describe('e.g. "On action", "On eyeline", "Hard cut from N-1"'),
  cut_out: z.string().describe('e.g. "On motion", "Hard cut to N+1"'),
});

export const ShotContinuitySchema = z.object({
  characters: z
    .array(z.string().regex(/^CHAR-[A-Z0-9-]+$/))
    .describe('IDs of characters appearing in this shot.'),
  location_id: z
    .string()
    .regex(/^LOC-[A-Z0-9-]+$/)
    .describe('ID of the location.'),
  props_persisting: z
    .array(z.string().regex(/^PROP-[A-Z0-9-]+$/))
    .describe('Props carried over from previous shots.'),
  props_introduced: z
    .array(z.string().regex(/^PROP-[A-Z0-9-]+$/))
    .describe('Props newly introduced in this shot.'),
  light_direction: z.string().describe('Where light comes from in this shot.'),
  time_of_day: z.string().describe('Specific time. e.g. "Late afternoon, ~4:30pm"'),
});

export const ShotSoundDesignSchema = z.object({
  sfx: z.string().nullable().describe('Sound effects for this shot.'),
  ambient: z.string().nullable().describe('Background soundscape.'),
  music: z.string().nullable().describe('Music notes (usually null — score is post).'),
});

export const ShotDurationSchema = z.object({
  veo: z
    .number()
    .int()
    .refine((n) => [4, 6, 8].includes(n), {
      message: 'Veo 3.1 supports 4, 6, or 8 second clips.',
    })
    .describe('Veo clip duration: 4, 6, or 8 seconds.'),
  kling: z
    .number()
    .int()
    .refine((n) => [5, 10].includes(n), {
      message: 'Kling supports 5 or 10 second clips.',
    })
    .describe('Kling clip duration: 5 or 10 seconds.'),
});

export const ShotSchema = z.object({
  shot_number: z.number().int().positive().describe('Sequence number, starting at 1.'),
  descriptor: z.string().describe('Short label. e.g. "Establishing the world"'),
  function: z
    .string()
    .describe('One-line statement of what this shot does for the story.'),

  grammar: ShotGrammarSchema,
  continuity: ShotContinuitySchema,

  action_beat: z
    .string()
    .describe(
      'Concrete physical description of what happens. The "Action / beat" field from the markdown.',
    ),

  dialogue_vo: z
    .string()
    .nullable()
    .describe('Dialogue or VO lines. null if the shot has none.'),

  sound_design: ShotSoundDesignSchema,

  duration: ShotDurationSchema,

  chain_instruction: z
    .string()
    .nullable()
    .describe(
      'Chain instruction if any — e.g. "CHAIN: end-frame-of-04 → start-frame-of-05". null if standalone.',
    ),

  veo_prompt: z
    .string()
    .describe(
      'The full Veo 3.1 prompt, verbatim, ready to paste into the Veo API. Include audio inline (dialogue in quotes, SFX:, Ambient:). Bible descriptions must be present verbatim.',
    ),

  kling_prompt: z
    .string()
    .describe(
      'The full Kling 2.5/2.6 prompt, verbatim, with the SUBJECT / ACTION / ENVIRONMENT / CAMERA / LIGHTING / STYLE structure preserved.',
    ),

  /**
   * Key frame prompt for Nano Banana / Gemini Image generation.
   *
   * The parser DERIVES this from the veo_prompt by stripping the audio
   * directives (SFX:, Ambient:, dialogue quotes) and any motion-specific
   * verbs ("dollies in over the duration"), keeping the static visual
   * description (composition, subject, environment, lighting, style).
   *
   * This is what gets sent to Gemini at shot generation time, alongside
   * the relevant character/location/prop reference stills as conditioning.
   */
  key_frame_prompt: z
    .string()
    .describe(
      'A still-image prompt derived from the veo_prompt: composition, subject, environment, lighting, style — but no audio, no motion verbs, no temporal language. Roughly 80-150 words. This will be sent to Gemini Nano Banana to generate the shot key frame.',
    ),
});

// ============================================================================
// Audit fields
// ============================================================================

export const AuditSchema = z.object({
  withholdings: z
    .array(z.string())
    .describe(
      'Deliberate audience withholdings, with payoff shot. e.g. ["The dolphin\'s existence is withheld until shot 10\'s dorsal fin reveal."]',
    ),
  visual_rhymes: z
    .array(z.string())
    .describe('Visual rhymes between shots. e.g. ["Shot 02 hands-on-spool ↔ Shot 14 hands-with-wet-kite"]'),
  flags_for_review: z
    .array(z.string())
    .describe('Shots flagged for careful review during generation.'),
});

// ============================================================================
// Top-level parsed storyboard
// ============================================================================

export const ParsedStoryboardSchema = z.object({
  title: z.string().describe('The storyboard title from the H1 of the markdown.'),
  format: z
    .enum(['ad', 'music_video', 'short_film', 'pitch_film', 'promo', 'other'])
    .describe('Inferred from the header. "other" if unclear.'),
  duration_seconds: z
    .number()
    .int()
    .positive()
    .describe('Total target runtime in seconds.'),
  total_shots: z.number().int().positive().describe('Total number of shots.'),

  narrative_arc: z
    .string()
    .describe(
      'The "Narrative arc" paragraph from the markdown — paste-ready for UI display.',
    ),

  style_lock: StyleLockSchema,

  characters: z.array(CharacterSchema).describe('All Bible character entries.'),
  locations: z.array(LocationSchema).describe('All Bible location entries.'),
  props: z.array(PropSchema).describe('All Bible prop entries.'),

  shots: z.array(ShotSchema).describe('All shots in sequence.'),

  audit: AuditSchema,
});

export type ParsedStoryboard = z.infer<typeof ParsedStoryboardSchema>;

// ============================================================================
// Database state schema (post-parse)
// ============================================================================

/**
 * State machine for reference stills and key frames.
 *
 * A Bible entity progresses: pending → generating → review → approved
 *                                                          → rejected → (regenerate)
 *
 * A shot key frame progresses: pending → generating → review → approved
 *                                                             → failed → (regenerate)
 */
export const ReferenceStillStateSchema = z.object({
  status: z.enum(['pending', 'generating', 'review', 'approved', 'rejected']),
  selected_url: z.string().nullable().describe('The approved candidate URL.'),
  candidate_urls: z
    .array(z.string())
    .describe('All generated candidates. Default: 4 per generation pass.'),
  generated_at: z.string().nullable(),
  approved_at: z.string().nullable(),
  regeneration_count: z.number().int().nonnegative().default(0),
  user_uploaded: z
    .boolean()
    .default(false)
    .describe(
      'true if user uploaded a reference image instead of using a generated one.',
    ),
});

export const KeyFrameStateSchema = z.object({
  status: z.enum(['pending', 'generating', 'review', 'approved', 'failed']),
  url: z.string().nullable(),
  generated_at: z.string().nullable(),
  failure_reason: z.string().nullable(),
  regeneration_count: z.number().int().nonnegative().default(0),
});

/**
 * The full storyboard as it lives in the database after parsing and state init.
 */
export const StoryboardSchema = ParsedStoryboardSchema.extend({
  id: z.string().uuid(),
  source_input: z.string().describe('The original script/premise/beat-list the user pasted.'),
  source_markdown: z.string().describe('The full skill-generated markdown.'),
  status: z.enum([
    'draft',
    'parsed',
    'refs_pending',
    'refs_approved',
    'shots_generating',
    'complete',
    'failed',
  ]),
  characters: z.array(
    CharacterSchema.extend({ reference_still: ReferenceStillStateSchema }),
  ),
  locations: z.array(
    LocationSchema.extend({ reference_still: ReferenceStillStateSchema }),
  ),
  props: z.array(
    PropSchema.extend({
      reference_still: ReferenceStillStateSchema.nullable(),
    }),
  ),
  shots: z.array(ShotSchema.extend({ key_frame: KeyFrameStateSchema })),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;
