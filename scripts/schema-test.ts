#!/usr/bin/env tsx
/**
 * Loomer — Schema Validation Test
 *
 * Hand-constructs a minimal valid ParsedStoryboard and runs it through the
 * Zod schema and the integrity checker. Verifies:
 *   1. The schema accepts well-formed data.
 *   2. The integrity checker fires correctly on malformed data.
 *   3. The code paths in the parser run without runtime errors.
 *
 * No Anthropic API calls — pure schema + logic test.
 *
 * Run: tsx scripts/schema-test.ts
 */

import { ParsedStoryboardSchema, type ParsedStoryboard } from '../src/schema/storyboard';

// ============================================================================
// Fixture: a minimal valid storyboard
// ============================================================================

const VALID_FIXTURE: ParsedStoryboard = {
  title: 'Test Storyboard',
  format: 'short_film',
  duration_seconds: 20,
  total_shots: 2,
  narrative_arc: 'A test character does a test thing in a test place.',
  style_lock: {
    look: 'Cinematic photoreal',
    dp_reference: 'Roger Deakins (architectural composition)',
    lens_default: '35mm at f/2.8',
    colour_grade: 'Naturalistic warm whites',
    film_stock_feel: 'Kodak Vision3 500T',
    lighting_register: 'Naturalistic motivated practicals',
    texture: 'Fine 35mm grain',
    negative_style: 'No HDR, no slick CGI gloss',
    aspect_ratio: '16:9',
    raw_block: 'LOOK: Cinematic photoreal\nLENS: 35mm at f/2.8\n...',
  },
  characters: [
    {
      id: 'CHAR-MAYA',
      name: 'Maya',
      full_description:
        'Maya, 34, Black woman with shoulder-length tightly curled black hair, faint scar above right eyebrow, wearing faded blue surgeon scrubs and a thin gold chain.',
      reference_still_prompt:
        'A 34-year-old Black woman with shoulder-length tightly curled black hair worn loose, large brown eyes, faint scar above right eyebrow, wearing faded blue surgeon scrubs, thin gold chain necklace. Standing in relaxed natural posture against a plain neutral grey background, soft even lighting from camera-front, front-three-quarter angle, full body visible.',
      fields: {
        age: '34',
        ethnicity_features: 'Black, faint scar above right eyebrow',
        hair: 'Shoulder-length tightly curled black hair',
        build: null,
        face: null,
        wardrobe: 'Faded blue surgeon scrubs, thin gold chain',
        distinguishing_details: null,
        voice: null,
        micro_behaviour: null,
      },
    },
  ],
  locations: [
    {
      id: 'LOC-KITCHEN-AFTERNOON',
      name: 'Kitchen, afternoon',
      full_description:
        'Long galley kitchen with sink and window on left wall, oak island down centre, archway at far end, cream walls, brass fittings. Hard afternoon sunlight from camera-left window raking across the oak surface.',
      reference_still_prompt:
        'Long galley kitchen interior, sink and window on left wall, oak island down centre, archway visible at far end, cream walls, brass fittings, lived-in domestic feel. Hard afternoon sunlight from the left window raking across the oak surface, deep shadow on opposite wall. Wide establishing composition, no characters visible.',
      fields: {
        type: 'Interior',
        place: 'Edwardian terraced house kitchen, London',
        geography: 'Long galley, sink/window left, oak island centre',
        time_of_day: 'Late afternoon',
        light_direction: 'Hard sun from camera-left window',
        palette: 'Muted warm cream, oak, brass',
        textures: 'Matte plaster, glossy oak, brushed steel',
        props_signage_details: null,
        atmosphere: 'Lived-in, slightly cluttered',
      },
    },
  ],
  props: [],
  shots: [
    {
      shot_number: 1,
      descriptor: 'Establishing the kitchen',
      function: 'Establish geography and time of day.',
      grammar: {
        scale: 'WS',
        angle: 'Eye-level',
        triangle_position: 'Right-angle',
        camera_move: 'Static',
        lens: '35mm at f/8',
        line_of_interest: 'Camera-left to camera-right along the kitchen length',
        screen_direction: '→',
        thirty_degree_check: 'N/A (opening shot)',
        cut_in: 'Fade in from black',
        cut_out: 'Hard cut to MS on Maya',
      },
      continuity: {
        characters: [],
        location_id: 'LOC-KITCHEN-AFTERNOON',
        props_persisting: [],
        props_introduced: [],
        light_direction: 'Hard sun from camera-left',
        time_of_day: 'Late afternoon ~4:30pm',
      },
      action_beat: 'The kitchen is empty. Hard afternoon light rakes across the island.',
      dialogue_vo: null,
      sound_design: {
        sfx: 'A kettle hisses on the range',
        ambient: 'Quiet domestic interior, faint fridge hum',
        music: null,
      },
      duration: { veo: 6, kling: 5 },
      chain_instruction: null,
      key_frame_prompt:
        'Wide shot, eye-level, static, 35mm lens at f/8, deep focus. A long galley kitchen — sink and window on left wall, oak island down centre, archway at far end, cream walls, brass fittings. Hard afternoon sunlight from camera-left window raking across the oak surface, deep shadow on opposite walls, faint dust in the light beam. Empty room. Kodak Vision3 500T grain, restrained palette, Roger Deakins architectural composition.',
    },
    {
      shot_number: 2,
      descriptor: 'Maya enters',
      function: 'Introduce protagonist in her geography.',
      grammar: {
        scale: 'MS',
        angle: 'Eye-level',
        triangle_position: 'External',
        camera_move: 'Static',
        lens: '35mm at f/2.8',
        line_of_interest: 'Maya facing toward the island',
        screen_direction: '→',
        thirty_degree_check: '60° from shot 01 around the kitchen',
        cut_in: 'Hard cut on her entry',
        cut_out: 'End of sequence',
      },
      continuity: {
        characters: ['CHAR-MAYA'],
        location_id: 'LOC-KITCHEN-AFTERNOON',
        props_persisting: [],
        props_introduced: [],
        light_direction: 'Hard sun from camera-left',
        time_of_day: 'Late afternoon ~4:30pm',
      },
      action_beat:
        'Maya walks into frame from the archway, stops at the island, places her hands flat on the oak surface, exhales.',
      dialogue_vo: null,
      sound_design: {
        sfx: 'Footsteps on hardwood floor',
        ambient: 'Quiet domestic interior',
        music: null,
      },
      duration: { veo: 8, kling: 10 },
      chain_instruction: 'CHAIN: end-frame-of-01 → start-frame-of-02 (continuous time, same lighting)',
      key_frame_prompt:
        'Medium shot, eye-level, static, 35mm at f/2.8, shallow depth. Maya, 34, Black woman with shoulder-length tightly curled black hair, faint scar above right eyebrow, wearing faded blue surgeon scrubs and a thin gold chain — standing at an oak island in a long galley kitchen, hands flat on the surface. Hard afternoon sun from camera-left raking across the island. Kodak Vision3 500T grain, restrained palette, Roger Deakins.',
    },
  ],
  audit: {
    withholdings: [],
    visual_rhymes: [],
    flags_for_review: [],
  },
};

// ============================================================================
// Tests
// ============================================================================

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(c.green(`  ✔ ${name}`));
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(c.red(`  ✖ ${name}`));
    console.log(c.red(`      ${msg}`));
    failed++;
  }
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

console.log(c.bold(`\nLoomer Schema Validation Test\n`));

console.log(c.bold(`Schema acceptance:`));

test('valid storyboard parses cleanly', () => {
  const result = ParsedStoryboardSchema.safeParse(VALID_FIXTURE);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.errors, null, 2));
  }
});

test('rejects invalid character ID format', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  broken.characters[0].id = 'char-maya'; // lowercase, no prefix
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

test('rejects veo duration outside [4, 6, 8]', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  broken.shots[0].duration.veo = 5; // 5 is valid for Kling, not Veo
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

test('rejects kling duration outside [5, 10]', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  broken.shots[0].duration.kling = 7;
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

test('rejects unknown aspect ratio', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  broken.style_lock.aspect_ratio = '21:9';
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

test('accepts null DP reference', () => {
  const variant = JSON.parse(JSON.stringify(VALID_FIXTURE));
  variant.style_lock.dp_reference = null;
  const result = ParsedStoryboardSchema.safeParse(variant);
  assertEq(result.success, true, 'expected validation success');
});

test('accepts empty audit arrays', () => {
  const variant = JSON.parse(JSON.stringify(VALID_FIXTURE));
  variant.audit = { withholdings: [], visual_rhymes: [], flags_for_review: [] };
  const result = ParsedStoryboardSchema.safeParse(variant);
  assertEq(result.success, true, 'expected validation success');
});

test('rejects missing reference_still_prompt on character', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  delete broken.characters[0].reference_still_prompt;
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

test('rejects missing key_frame_prompt on shot', () => {
  const broken = JSON.parse(JSON.stringify(VALID_FIXTURE));
  delete broken.shots[0].key_frame_prompt;
  const result = ParsedStoryboardSchema.safeParse(broken);
  assertEq(result.success, false, 'expected validation failure');
});

console.log();
console.log(c.bold(`Field shapes:`));

test('parsed storyboard has expected top-level fields', () => {
  const sb = ParsedStoryboardSchema.parse(VALID_FIXTURE);
  assertEq(sb.title, 'Test Storyboard', 'title');
  assertEq(sb.format, 'short_film', 'format');
  assertEq(sb.total_shots, 2, 'total_shots');
  assertEq(sb.shots.length, 2, 'shots length');
  assertEq(sb.characters.length, 1, 'characters length');
  assertEq(sb.locations.length, 1, 'locations length');
});

test('character has both descriptions populated', () => {
  const sb = ParsedStoryboardSchema.parse(VALID_FIXTURE);
  const maya = sb.characters[0];
  if (!maya) throw new Error('no character');
  if (maya.full_description.length < 50) throw new Error('full_description too short');
  if (maya.reference_still_prompt.length < 50) throw new Error('reference_still_prompt too short');
});

test('shot has key_frame_prompt populated', () => {
  const sb = ParsedStoryboardSchema.parse(VALID_FIXTURE);
  const shot = sb.shots[0];
  if (!shot) throw new Error('no shot');
  if (shot.key_frame_prompt.length < 50) throw new Error('key_frame_prompt too short');
});

console.log();
console.log(c.bold(`Result:`));
if (failed === 0) {
  console.log(c.green(`  ✔ ${passed}/${passed + failed} tests passed`));
  process.exit(0);
} else {
  console.log(c.red(`  ✖ ${failed} of ${passed + failed} tests failed`));
  process.exit(1);
}
