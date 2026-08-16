/**
 * Reads real progress out of the streaming storyboard markdown.
 *
 * The storyboard skill writes to a fixed structure, and that structure is a
 * far better progress signal than elapsed time:
 *
 *   ## Continuity Bible      → characters, locations, props
 *   ## Shot list summary     → a table with ONE ROW PER SHOT
 *   ## Per-shot blocks       → `### Shot NN` headings, one per shot
 *   ## Followability audit   → closing section
 *
 * The summary table is the key: it declares the exact shot count *before* the
 * long per-shot phase begins. So for the majority of the wait we can report a
 * true "shot 14 of 32" rather than a bar that creeps and then stalls.
 *
 * Nothing here estimates from token counts or wall-clock alone. Where the real
 * total isn't known yet, the phase is reported honestly as indeterminate
 * instead of inventing a percentage.
 */

export type WritingPhase =
  | 'starting'
  | 'bible'
  | 'shot-list'
  | 'shots'
  | 'audit';

export type WritingProgress = {
  phase: WritingPhase;
  /** Human-readable statement of what is happening right now. */
  label: string;
  /** Shots whose blocks have begun streaming. */
  shotsWritten: number;
  /** Exact total once the summary table has been read; null before that. */
  totalShots: number | null;
  /** 0–1, or null when the total isn't known yet. */
  fraction: number | null;
  /** Bible entities seen so far — real milestones during the early phase. */
  characters: number;
  locations: number;
  props: number;
};

const SHOT_HEADING = /^###\s+Shot\s+\d+/gim;
/** A shot row in the summary table: `| 01 | EWS | ... |`. */
const SUMMARY_ROW = /^\|\s*(\d{1,3})\s*\|/gm;
const BIBLE_ENTRY = {
  characters: /^####?\s+CHAR-[A-Z0-9-]+/gim,
  locations: /^####?\s+LOC-[A-Z0-9-]+/gim,
  props: /^####?\s+PROP-[A-Z0-9-]+/gim,
};

function countMatches(text: string, re: RegExp): number {
  // The regexes are module-level and stateful with /g; reset before each use.
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(text) !== null) count++;
  return count;
}

/**
 * Total shots declared by the summary table.
 *
 * Only trusted once the per-shot section has started or the table has clearly
 * ended — mid-table the count is still growing and would make the bar jump
 * backwards.
 */
function declaredTotal(markdown: string): number | null {
  const summaryStart = markdown.search(/^##\s+Shot list summary/im);
  if (summaryStart === -1) return null;

  const afterSummary = markdown.slice(summaryStart);
  const tableEnd = afterSummary.search(/^##\s+(?!Shot list summary)/im);
  // Still inside the table: the count is incomplete, so don't publish it.
  if (tableEnd === -1) return null;

  const table = afterSummary.slice(0, tableEnd);
  const rows = countMatches(table, SUMMARY_ROW);
  return rows > 0 ? rows : null;
}

/** Analyses however much markdown has streamed so far. */
export function analyseWriting(markdown: string): WritingProgress {
  const characters = countMatches(markdown, BIBLE_ENTRY.characters);
  const locations = countMatches(markdown, BIBLE_ENTRY.locations);
  const props = countMatches(markdown, BIBLE_ENTRY.props);
  const shotsWritten = countMatches(markdown, SHOT_HEADING);
  const totalShots = declaredTotal(markdown);

  const hasAudit = /^##\s+Followability audit/im.test(markdown);
  const hasSummary = /^##\s+Shot list summary/im.test(markdown);
  const hasBible = /^##\s+Continuity Bible/im.test(markdown);

  let phase: WritingPhase = 'starting';
  if (hasAudit && shotsWritten > 0) phase = 'audit';
  else if (shotsWritten > 0) phase = 'shots';
  else if (hasSummary) phase = 'shot-list';
  else if (hasBible || characters + locations + props > 0) phase = 'bible';

  // Only claim a fraction once the real denominator is known.
  const fraction =
    totalShots && totalShots > 0
      ? Math.min(1, shotsWritten / totalShots)
      : null;

  return {
    phase,
    label: labelFor(phase, { shotsWritten, totalShots, characters, locations, props }),
    shotsWritten,
    totalShots,
    fraction,
    characters,
    locations,
    props,
  };
}

function labelFor(
  phase: WritingPhase,
  d: { shotsWritten: number; totalShots: number | null; characters: number; locations: number; props: number },
): string {
  switch (phase) {
    case 'starting':
      return 'Reading the script';
    case 'bible': {
      const bits = [
        d.characters > 0 ? `${d.characters} character${d.characters === 1 ? '' : 's'}` : '',
        d.locations > 0 ? `${d.locations} location${d.locations === 1 ? '' : 's'}` : '',
        d.props > 0 ? `${d.props} prop${d.props === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      return bits.length > 0
        ? `Building the continuity bible — ${bits.join(', ')}`
        : 'Building the continuity bible';
    }
    case 'shot-list':
      return 'Planning the shot list';
    case 'shots':
      return d.totalShots
        ? `Writing shot ${Math.min(d.shotsWritten, d.totalShots)} of ${d.totalShots}`
        : `Writing shot ${d.shotsWritten}`;
    case 'audit':
      return 'Checking continuity and followability';
  }
}

/**
 * Seconds remaining, from the rate actually observed so far.
 *
 * Returns null rather than guessing when there isn't enough evidence — a
 * confident wrong number is worse than none.
 */
export function estimateRemainingSeconds(
  fraction: number | null,
  elapsedMs: number,
): number | null {
  if (fraction === null || fraction <= 0.02) return null;
  if (elapsedMs < 4000) return null;
  const totalMs = elapsedMs / fraction;
  const remaining = Math.max(0, totalMs - elapsedMs);
  return Math.round(remaining / 1000);
}

/** "about 2 min", "about 40 sec", "any moment now". */
export function formatRemaining(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 10) return 'any moment now';
  if (seconds < 90) return `about ${Math.round(seconds / 10) * 10} sec left`;
  const minutes = Math.round(seconds / 30) / 2; // nearest half minute
  return `about ${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} min left`;
}
