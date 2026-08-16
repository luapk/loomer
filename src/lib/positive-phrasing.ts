/**
 * Rewrites negated performance direction into positive direction.
 *
 * Image models read "He is not smiling yet" as topic emphasis — the words that
 * carry weight are *smiling*, and that is what arrives in the frame. The board
 * that said "He is not smiling yet" rendered a broad open laugh.
 *
 * The fix is to say what IS true. This is a deliberately narrow, curated
 * lexicon rather than a general negation parser: anything not matched is left
 * exactly as written, because a wrong rewrite is worse than an unrewritten
 * negation. Every rule below has a test in scripts/positive-phrasing-test.ts.
 */

type Rule = { pattern: RegExp; replacement: string };

// Order matters — longer, more specific patterns first so they aren't
// pre-empted by a shorter one that overlaps them.
const RULES: Rule[] = [
  // ── Expression ───────────────────────────────────────────────────────────
  {
    pattern: /\b(is|are|'s)\s+not\s+(?:yet\s+)?smiling(?:\s+yet)?\b/gi,
    replacement: '$1 holding a neutral, closed-mouth expression',
  },
  {
    pattern: /\b(does|do)\s+not\s+smile\b/gi,
    replacement: '$1 keeps a neutral, closed-mouth expression',
  },
  {
    pattern: /\b(is|are|'s)\s+not\s+(?:yet\s+)?laughing\b/gi,
    replacement: '$1 composed and still, mouth closed',
  },
  {
    pattern: /\bwithout\s+(?:a\s+|any\s+)?smil(?:e|ing)\b/gi,
    replacement: 'with a level, closed mouth',
  },
  {
    pattern: /\bno\s+smile\b/gi,
    replacement: 'a level, closed mouth',
  },
  {
    pattern: /\b(is|are|'s)\s+not\s+(?:yet\s+)?crying\b/gi,
    replacement: '$1 dry-eyed and controlled',
  },

  // ── Gaze ─────────────────────────────────────────────────────────────────
  {
    pattern: /\b(is|are|'s)\s+not\s+looking\s+at\s+(?:the\s+)?camera\b/gi,
    replacement: '$1 looking away from the lens',
  },
  {
    pattern: /\b(does|do)\s+not\s+look\s+at\b/gi,
    replacement: '$1 holds their gaze away from',
  },
  {
    pattern: /\b(?:eyes\s+)?not\s+meeting\s+(?:the\s+)?(?:camera|lens)\b/gi,
    replacement: 'eyes directed away from the lens',
  },

  // ── Posture and motion ───────────────────────────────────────────────────
  {
    pattern: /\b(is|are|'s)\s+not\s+moving\b/gi,
    replacement: '$1 completely still',
  },
  {
    pattern: /\b(is|are|'s)\s+not\s+(?:yet\s+)?standing\b/gi,
    replacement: '$1 still seated',
  },
  {
    pattern: /\b(?:has|have)\s+not\s+(?:yet\s+)?stood\s+up\b/gi,
    replacement: 'remains seated',
  },
  {
    pattern: /\b(is|are|'s)\s+not\s+touching\b/gi,
    replacement: '$1 held clear of, with a visible gap from',
  },

  // ── Eyes ─────────────────────────────────────────────────────────────────
  {
    pattern: /\beyes\s+(?:are\s+)?not\s+open\b/gi,
    replacement: 'eyes closed',
  },
  {
    pattern: /\beyes\s+(?:are\s+)?not\s+closed\b/gi,
    replacement: 'eyes open',
  },
];

/**
 * Applies the lexicon. Unmatched text is returned unchanged.
 */
export function rewriteNegations(text: string): string {
  let out = text;
  for (const { pattern, replacement } of RULES) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** How many rules fired — used by tests and diagnostics, not by the prompt path. */
export function countRewrites(text: string): number {
  let count = 0;
  for (const { pattern } of RULES) {
    pattern.lastIndex = 0;
    count += (text.match(pattern) ?? []).length;
  }
  return count;
}
