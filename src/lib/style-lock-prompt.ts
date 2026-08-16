/**
 * Turns a storyboard's own style lock into the style declaration sent to the
 * image model.
 *
 * Before this existed, `buildStyleDeclaration` took the style lock as an
 * underscore-prefixed unused parameter and emitted a hardcoded house style
 * instead. On a board whose lock asked for a Se7en look — crushed blacks,
 * near-monochrome — every shot prompt was prefixed with "No crushed blacks.
 * No teal-and-orange push." The skill's DP reference, film stock, grade and
 * lighting never reached the model at all, and the house style actively
 * contradicted the per-shot prompts.
 *
 * The lock wins now. The house style is the fallback for boards that don't
 * carry a usable one.
 */

import type { ParsedStoryboard } from '../schema/storyboard';
import {
  PHOTOREAL_HOUSE_STYLE,
  PHOTOREAL_MEDIUM_GUARD,
  PHOTOREAL_STYLE,
  buildDofLine,
} from './photoreal-style';

type StyleLock = ParsedStoryboard['style_lock'];
type StyleRegister = NonNullable<NonNullable<StyleLock['registers']>>[number];

/** The fields a register may override. */
export type EffectiveLook = {
  look: string;
  dp_reference: string | null;
  lens_default: string;
  colour_grade: string;
  film_stock_feel: string | null;
  lighting_register: string;
  texture: string | null;
  negative_style: string;
  /** Name of the register in force, when one is. */
  register: string | null;
};

/**
 * The register covering a given shot, if any.
 *
 * Ranges are treated as inclusive. Overlaps are resolved by taking the
 * narrowest match — a five-shot dream sequence declared inside a fourteen-shot
 * baseline register is the one that should win.
 */
export function resolveRegister(
  styleLock: StyleLock | null | undefined,
  shotNumber: number,
): StyleRegister | null {
  const registers = styleLock?.registers;
  if (!registers || registers.length === 0) return null;

  const matches = registers.filter(
    (r) => shotNumber >= r.from_shot && shotNumber <= r.to_shot,
  );
  if (matches.length === 0) return null;

  return matches.reduce((narrowest, candidate) =>
    candidate.to_shot - candidate.from_shot < narrowest.to_shot - narrowest.from_shot
      ? candidate
      : narrowest,
  );
}

/** Merges the baseline lock with whichever register covers this shot. */
export function effectiveLook(
  styleLock: StyleLock,
  shotNumber?: number,
): EffectiveLook {
  const register = shotNumber === undefined ? null : resolveRegister(styleLock, shotNumber);
  return {
    look: register?.look ?? styleLock.look,
    dp_reference: styleLock.dp_reference,
    lens_default: styleLock.lens_default,
    colour_grade: register?.colour_grade ?? styleLock.colour_grade,
    film_stock_feel: register?.film_stock_feel ?? styleLock.film_stock_feel,
    lighting_register: register?.lighting_register ?? styleLock.lighting_register,
    texture: register?.texture ?? styleLock.texture,
    negative_style: styleLock.negative_style,
    register: register?.name ?? null,
  };
}

/**
 * Whether a lock carries enough to describe a look on its own.
 *
 * A lock that parsed badly — empty strings, a two-word `look` — would produce a
 * declaration weaker than the house style, so those fall back instead.
 */
export function hasUsableStyleLock(styleLock: StyleLock | null | undefined): boolean {
  if (!styleLock) return false;
  const look = styleLock.look?.trim() ?? '';
  const grade = styleLock.colour_grade?.trim() ?? '';
  const lighting = styleLock.lighting_register?.trim() ?? '';
  if (look.length < 8) return false;
  // At least one of grade / lighting must say something, or the lock is a
  // title with no content behind it.
  return grade.length >= 4 || lighting.length >= 4;
}

/**
 * Prose style text for a shot: the board's own lock where there is one,
 * Loomer's house style where there isn't. Always ends with the medium guard.
 */
export function styleTextForShot(
  styleLock: StyleLock | null | undefined,
  shotNumber?: number,
): string {
  if (!styleLock || !hasUsableStyleLock(styleLock)) {
    return PHOTOREAL_STYLE;
  }

  const look = effectiveLook(styleLock, shotNumber);
  const parts: string[] = [];

  if (look.register) {
    parts.push(
      `This shot is in ${look.register} — the register below governs it, not the board's baseline look.`,
    );
  }
  parts.push(sentence(look.look));
  if (look.dp_reference) parts.push(`Cinematography reference: ${stripTrailingStop(look.dp_reference)}.`);
  if (look.lens_default) parts.push(`Lens: ${stripTrailingStop(look.lens_default)}.`);
  if (look.lighting_register) parts.push(`Lighting: ${stripTrailingStop(look.lighting_register)}.`);
  if (look.colour_grade) parts.push(`Colour grade: ${stripTrailingStop(look.colour_grade)}.`);
  if (look.film_stock_feel) parts.push(`Film stock: ${stripTrailingStop(look.film_stock_feel)}.`);
  if (look.texture) parts.push(`Texture: ${stripTrailingStop(look.texture)}.`);
  if (look.negative_style) parts.push(`Avoid: ${stripTrailingStop(look.negative_style)}.`);

  parts.push(PHOTOREAL_MEDIUM_GUARD);
  return parts.join(' ');
}

/**
 * The mandatory OUTPUT STYLE block placed ahead of every reference image.
 * `scale` adds the depth-of-field directive derived from the shot's grammar.
 */
export function buildPhotorealDeclaration(
  styleLock: StyleLock | null | undefined,
  shotNumber?: number,
  scale?: string,
): string {
  const dofLine = scale ? ` ${buildDofLine(scale)}` : '';
  return (
    `OUTPUT STYLE (mandatory): ${styleTextForShot(styleLock, shotNumber)}${dofLine} ` +
    'Every element in the output MUST conform to this style — including characters and locations taken from reference images.'
  );
}

/** Exported for the fallback path's tests and for callers that want the raw text. */
export { PHOTOREAL_HOUSE_STYLE };

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function stripTrailingStop(text: string): string {
  return text.trim().replace(/\.$/, '');
}
