/**
 * Labels for conditioning images.
 *
 * Every reference image sent with a shot is introduced as "[Reference — X:]".
 * X must identify that image uniquely, because it is the only thing telling
 * the model which picture is which entity.
 *
 * The label is drawn from the reference prompt rather than the entity's name,
 * so franchise or brand names never reach the image model. That has a failure
 * mode: two entities whose prompts open the same way collide, and a collision
 * is silent and catastrophic — the model maps two images onto one identity and
 * characters appear in each other's roles. Dual-guise characters (the same
 * performer as Mobster and as Dentist) collide by construction, because they
 * are written to share their physical description verbatim.
 *
 * So labels are made unique here, deterministically.
 */

/** Strips the ID prefix and turns the rest into words: CHAR-VITO-MOBSTER → "vito mobster". */
function idWords(entityId: string): string {
  return entityId
    .replace(/^(CHAR|LOC|PROP)-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The distinguishing tail of an id relative to others sharing a label —
 * CHAR-VITO-MOBSTER vs CHAR-VITO-DENTIST yields "mobster" / "dentist".
 * Falls back to the whole id when there's no common stem to strip.
 */
function discriminator(entityId: string, siblings: string[]): string {
  const own = idWords(entityId).split(' ');
  const others = siblings.filter((s) => s !== entityId).map((s) => idWords(s).split(' '));
  if (others.length === 0) return own.join(' ');

  // Drop leading words every sibling also has — that's the shared identity.
  let start = 0;
  while (
    start < own.length - 1 &&
    others.every((other) => other[start] === own[start])
  ) {
    start++;
  }
  return own.slice(start).join(' ') || own.join(' ');
}

/** First sentence of a prompt, or a truncation when there isn't a clean one. */
function excerpt(prompt: string): string {
  const first = prompt.split(/[.!?]/)[0]?.trim() ?? '';
  return first.length > 10 ? first : prompt.slice(0, 100).trim();
}

export type LabelledEntity = { id: string; prompt: string };

/**
 * The exact text used inside the `[Reference — X:]` marker.
 *
 * Anything after an em-dash is an appearance descriptor, and the reference
 * image is the appearance authority — leaving it in lets the label contradict
 * the picture. Everything that names a reference (the marker itself, the screen
 * binding) must go through here, or the binding names a label that was never
 * emitted.
 */
export function conditioningLabel(name: string): string {
  return name.split(/\s[—–]\s/)[0]?.trim() ?? name;
}

/**
 * Builds a label per entity id, guaranteed unique within the set.
 *
 * Where two entities would share a label, each is qualified with what
 * distinguishes its id — "…heavy brow (mobster)" and "…heavy brow (dentist)" —
 * which is exactly the information the model needs to keep the roles apart.
 */
export function uniqueVisualLabels(entities: LabelledEntity[]): Record<string, string> {
  const base = new Map<string, string>();
  for (const entity of entities) {
    base.set(entity.id, excerpt(entity.prompt));
  }

  // Group ids by the label they'd otherwise share.
  const byLabel = new Map<string, string[]>();
  for (const [id, label] of base) {
    const key = label.toLowerCase();
    byLabel.set(key, [...(byLabel.get(key) ?? []), id]);
  }

  const labels: Record<string, string> = {};
  for (const [, ids] of byLabel) {
    if (ids.length === 1) {
      const id = ids[0]!;
      labels[id] = base.get(id)!;
      continue;
    }
    // Collision: qualify each with its distinguishing id fragment.
    for (const id of ids) {
      labels[id] = `${base.get(id)!} (${discriminator(id, ids)})`;
    }
  }

  return labels;
}
