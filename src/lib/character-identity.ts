/**
 * Which Bible characters are actually people we render.
 *
 * A narrator or voice-over is a *voice*, not a body in frame. When the Bible
 * gives one a character block, it flows through to a reference still and then
 * into shot conditioning — the model dutifully puts an invented narrator into
 * frames they were never meant to appear in. This filter keeps voices out of
 * the visual pipeline while leaving their dialogue intact.
 *
 * Deterministic on purpose: the parser is also instructed not to create these,
 * but a prompt rule is a tendency and this is a guarantee.
 */

/** Matches the ways a script marks a voice-only credit. */
const VOICE_ONLY_PATTERNS = [
  /\bV\.?\s?O\.?\b/i,          // V.O. / VO / V O
  /\bVOICE[\s-]?OVER\b/i,
  /\bNARRATOR\b/i,
  /\bNARRATION\b/i,
  /\bOFF[\s-]?SCREEN\s+VOICE\b/i,
  /\bVOICE\s+OF\b/i,
];

/**
 * True when an entity is a disembodied voice rather than a character on
 * screen. Checked against both id and name — the Bible names one, the id the
 * other, and either can carry the marker.
 */
export function isVoiceOnlyCharacter(id: string, name: string): boolean {
  const haystack = `${id} ${name}`;
  return VOICE_ONLY_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Splits a character list into those that get rendered and those that don't.
 * Callers use `rendered` for reference stills and shot conditioning, and
 * `voiceOnly` to explain the omission to the user.
 */
export function partitionByVoiceOnly<T extends { id: string; name: string }>(
  characters: T[],
): { rendered: T[]; voiceOnly: T[] } {
  const rendered: T[] = [];
  const voiceOnly: T[] = [];
  for (const character of characters) {
    (isVoiceOnlyCharacter(character.id, character.name) ? voiceOnly : rendered).push(character);
  }
  return { rendered, voiceOnly };
}
