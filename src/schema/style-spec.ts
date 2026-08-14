/**
 * A saved style, compiled into a structured, reproducible specification.
 *
 * Style images teach a look once, at authoring time. From then on the look
 * travels as *text*, because continuity is repeatability: forty-five shot
 * renders receiving a byte-identical style block vary only in what they
 * depict, whereas forty-five renders each re-reading a handful of JPEGs vary
 * in how they are drawn as well.
 *
 * The prose summary this replaces could not do that job. It was a paragraph,
 * rewritten from scratch whenever an image was added or removed, so the same
 * style said different words on different days — and a director who disagreed
 * with the reading had no way to correct it. A spec has named fields: it can
 * be diffed, versioned, and edited.
 */

import { z } from 'zod';

/**
 * Bumped when the field set changes. Stored specs carry the version they were
 * written under so an older one can be recognised rather than mis-read.
 */
export const STYLE_SPEC_VERSION = 1;

const sentence = z.string().trim().min(1).max(400);

/**
 * The authored fields, without the version stamp.
 *
 * This is what the compiler asks Claude to fill. `version` is ours to stamp,
 * not the model's to guess — asking for it would only create a way to fail
 * validation.
 */
export const StyleSpecFieldsSchema = z.object({
  /** One sentence for the director — the legibility check on the whole spec. */
  reading: z.string().trim().min(1).max(400),
  /** The rendering medium, named plainly: "gouache concept painting", "35mm photograph". */
  medium: sentence,
  /**
   * Whether the look sits in photographic space. Drives choices that depend on
   * the medium rather than the palette — notably whether a previously rendered
   * frame can be passed as a spatial reference without being composited.
   */
  photographic: z.boolean(),
  /** Named colours plus hex values where they can be pinned. */
  palette: sentence,
  /** Quality and direction of light. */
  lighting: sentence,
  /** Contrast, exposure, saturation — the grade. */
  grade: sentence,
  /** Grain, paper tooth, brush, surface. */
  texture: sentence,
  /** Line weight and edge treatment: hard, feathered, absent. */
  line_and_edge: sentence,
  /** How much detail is resolved, and where it drops away. */
  detail_level: sentence,
  /**
   * What this look never does. Authored per style rather than hardcoded — a
   * blanket "no stylised anatomy" rule would fight a director whose chosen
   * style is stylised.
   */
  avoid: z.array(sentence).min(1).max(10),
});

export const StyleSpecSchema = StyleSpecFieldsSchema.extend({
  version: z.literal(STYLE_SPEC_VERSION),
});

export type StyleSpec = z.infer<typeof StyleSpecSchema>;

/**
 * Reads a spec off a Prisma `Json?` column. Returns null for anything that
 * isn't a valid spec of the current version — a style saved before specs
 * existed, or one written under an older shape.
 */
export function parseStyleSpec(value: unknown): StyleSpec | null {
  if (value === null || value === undefined) return null;
  const result = StyleSpecSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * The spec as a prompt block.
 *
 * Deterministic by construction: same spec in, identical string out, every
 * call. That is the whole point — see the note at the top of this file.
 */
export function styleSpecToPrompt(spec: StyleSpec): string {
  return [
    'OUTPUT STYLE (mandatory — this defines HOW the frame is rendered, never what it contains):',
    `Medium: ${spec.medium}`,
    `Palette: ${spec.palette}`,
    `Lighting: ${spec.lighting}`,
    `Grade: ${spec.grade}`,
    `Texture: ${spec.texture}`,
    `Line and edge: ${spec.line_and_edge}`,
    `Detail: ${spec.detail_level}`,
    `Never: ${spec.avoid.join('; ')}`,
    'Render every element of this frame in this style — including any character, location or object taken from a reference image. The reference images define WHO and WHAT appears; this block defines HOW it is drawn.',
  ].join('\n');
}
