/**
 * Binds identity references to people on screen.
 *
 * Identity fails almost exclusively in multi-character frames. A single-
 * character close-up has one reference and one face, so there is nothing to get
 * wrong; a two-hander asks the model to map two references onto two positions
 * with nothing in the prompt saying which is which. It averages them, or swaps
 * them, and characters arrive in each other's roles.
 *
 * Two things are emitted here. The binding guard is unconditional for any frame
 * with two or more character references — it forbids blending and averaging.
 * The position lines are emitted only where the parser captured real staging
 * from the shot block; nothing is invented.
 */

import type { ParsedStoryboard } from '../schema/storyboard';

type ScreenPosition = { entity_id: string; position: string };

/**
 * @param characterIds  Character entities whose reference image is actually
 *                      attached to this prompt, in the order attached.
 * @param labelFor      The conditioning label each entity was given — must be
 *                      the same string used in the `[Reference — X:]` marker,
 *                      or the binding points at nothing.
 */
export function buildScreenBindingLine(
  characterIds: string[],
  labelFor: (entityId: string) => string,
  screenPositions?: ScreenPosition[] | null,
): string | null {
  if (characterIds.length < 2) return null;

  const labels = characterIds.map((id) => labelFor(id));

  const guard =
    `CHARACTER BINDING (authoritative): this frame contains exactly ${characterIds.length} ` +
    'distinct people. Each labelled identity reference above corresponds to exactly ONE ' +
    'of them, and each person in the frame draws their face, hair, build and wardrobe from ' +
    'exactly ONE reference. Do NOT blend, average, merge or swap two references into one ' +
    'person. Do NOT give one reference\'s face to another reference\'s body or wardrobe. ' +
    `The references in play are: ${labels.join('; ')}.`;

  const known = (screenPositions ?? []).filter(
    (p) => characterIds.includes(p.entity_id) && p.position.trim().length > 0,
  );
  if (known.length === 0) return guard;

  const lines = known.map(
    (p) => `- ${labelFor(p.entity_id)} — ${p.position.trim().replace(/\.$/, '')}.`,
  );

  return (
    `${guard}\n` +
    'SCREEN POSITIONS (authoritative — each reference occupies exactly this place in the frame):\n' +
    lines.join('\n')
  );
}

/** Character IDs in a shot's continuity, in declaration order. */
export function shotScreenPositions(
  shot: ParsedStoryboard['shots'][number],
): ScreenPosition[] {
  return shot.continuity.screen_positions ?? [];
}
