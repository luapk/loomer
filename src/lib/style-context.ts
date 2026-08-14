/**
 * The single source of style text for every generation route.
 *
 * Four routes render frames — generate-refs, generate-shots, regen-ref,
 * regen-shot — and each used to assemble its own style instruction. They had
 * drifted: reference stills were baked under one recipe and shot frames under
 * another, a regenerated shot under a third, so a re-rendered frame could not
 * match the neighbours it sat between. STYLE_REF had additionally lost the
 * depth-of-field line the house styles carry, and one copy of the watercolour
 * text had lost its anatomy guard.
 *
 * Divergent conditioning produces divergent output, which is what "continuity
 * is poor" looks like from the outside. So the style text lives here now, and
 * the routes ask for it rather than writing their own.
 */

import type { PrismaClient } from '@prisma/client';
import { loadStyleImages, loadStyleSummary } from '@/src/lib/styles';
import { PHOTOREAL_STYLE, buildDofLine } from '@/src/lib/photoreal-style';

export const WATERCOLOUR_STYLE =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration. No photorealism, no CGI, no digital art. Naturalistic human anatomy and facial proportions throughout — eyes sized as in real life, iris occupying roughly one-third of visible eye height with natural sclera visible on both sides. No enlarged irises, no anime-style or cartoon-style eye exaggeration, no chibi proportions, no Disney-inflated eyes.';

/**
 * Introduces style images to the model. Used only where style images are
 * actually attached — reference stills. Shot prompts carry none: alongside
 * identity references the model sourced content from them and character
 * likeness collapsed.
 */
export const STYLE_REFERENCE_LABEL =
  '[STYLE REFERENCE: The image(s) below define one visual style — match its colour palette, lighting quality, rendering technique, and texture exactly. Do NOT copy any subject, character, object, location or composition from them.]';

/**
 * Everything a route needs to state the look, resolved once per run.
 *
 * `images` is populated only when asked for, and only reference stills ask.
 */
export type StyleContext = {
  renderStyle: string;
  /** STYLE_REF only: the written summary that carries the look into a prompt. */
  summary: string | null;
  /** STYLE_REF only: the style's images, as inline conditioning data. */
  images: { data: string; mimeType: string }[];
};

export async function loadStyleContext(
  db: PrismaClient,
  storyboard: {
    render_style: string;
    style_id: string | null;
    style_ref_url: string | null;
  },
  options: { withImages: boolean },
): Promise<StyleContext> {
  if (storyboard.render_style !== 'STYLE_REF') {
    return { renderStyle: storyboard.render_style, summary: null, images: [] };
  }
  const [summary, images] = await Promise.all([
    loadStyleSummary(db, storyboard),
    options.withImages
      ? loadStyleImages(db, storyboard)
      : Promise.resolve([] as { data: string; mimeType: string }[]),
  ]);
  return { renderStyle: storyboard.render_style, summary, images };
}

/** The focus-falloff line for a shot's scale, or empty when there's no grammar. */
function dof(scale: string | undefined): string {
  return scale ? ` ${buildDofLine(scale)}` : '';
}

/**
 * The mandatory style block, placed before any conditioning image so the model
 * anchors to the output medium before it sees a photographic reference.
 *
 * Every mode carries the depth-of-field line for the shot's scale. Focus
 * falloff is one of the strongest across-cut consistency cues there is, and it
 * is no more photographic than it is painterly — a wide illustration resolves
 * its distance loosely too.
 */
export function styleDeclaration(ctx: StyleContext, scale?: string): string {
  if (ctx.renderStyle === 'WATERCOLOUR_SKETCH') {
    return `OUTPUT STYLE (mandatory): ${WATERCOLOUR_STYLE}${dof(scale)} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
  }
  if (ctx.renderStyle === 'STYLE_REF') {
    if (ctx.summary) {
      return `OUTPUT STYLE (mandatory): ${ctx.summary}${dof(scale)} Render every element of this frame in that style — including any character, location or object taken from a reference image. The references define WHO and WHAT appears; this directive defines HOW it is drawn.`;
    }
    // No summary (the style predates summaries, or Claude was unreachable).
    // The identity references still carry the look — they were themselves
    // generated in this style.
    return `OUTPUT STYLE (mandatory): Match the visual style established by the reference images provided — their rendering medium, colour palette, lighting quality and texture.${dof(scale)} Render every element of this frame in that same style.`;
  }
  return `OUTPUT STYLE (mandatory): ${PHOTOREAL_STYLE}${dof(scale)} Every element in the output MUST conform to this style — including characters and locations taken from reference images.`;
}

/**
 * The style line inside a shot prompt's body, or null when there isn't one.
 *
 * STYLE_REF has none: its look is stated once, in the declaration above.
 * Restating a written style beside the key-frame description gives the model
 * two chances to read it differently.
 */
export function shotStyleLine(ctx: StyleContext, scale?: string): string | null {
  if (ctx.renderStyle === 'WATERCOLOUR_SKETCH') return `Style: ${WATERCOLOUR_STYLE}`;
  if (ctx.renderStyle === 'STYLE_REF') return null;
  return `Style: ${PHOTOREAL_STYLE}${dof(scale)}`;
}

/**
 * The style line for a reference still.
 *
 * Reference stills are the one place style images are still attached: there
 * are no identity references to compete with, and the stills are what carry
 * the look forward into every shot that conditions on them.
 */
export function refStyleLine(ctx: StyleContext): string {
  if (ctx.renderStyle === 'WATERCOLOUR_SKETCH') return `Style: ${WATERCOLOUR_STYLE}`;
  if (ctx.renderStyle === 'STYLE_REF') {
    return ctx.summary
      ? `Style: ${ctx.summary} Match this style exactly, as shown in the provided style reference image(s).`
      : 'Style: Match the visual style of the provided style reference image(s).';
  }
  return `Style: ${PHOTOREAL_STYLE}`;
}
