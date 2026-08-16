/**
 * Story state at a point in the sequence.
 *
 * Every shot is generated from its own prompt in isolation, so nothing carries
 * the fact that a rope is still tied or a chair has not yet transformed. The
 * model then picks the most photogenic reading of each prompt independently,
 * which is why a transformation that the script stages as a single match cut
 * arrives in instalments — the chair changing in shot 02, the ropes vanishing
 * in shot 05, and the actual cut landing on a frame with nothing left to
 * transform.
 *
 * The Bible already holds the answer: a prop's `state_transitions` field says
 * exactly which shots it is in which condition. This module reads it and turns
 * it into an explicit statement of what must be visibly true in this frame.
 */

import type { ParsedStoryboard } from '../schema/storyboard';

type Prop = ParsedStoryboard['props'][number];
type Shot = ParsedStoryboard['shots'][number];

export type StateSegment = {
  /** Inclusive shot range this state covers. */
  from: number;
  to: number;
  /** The condition, as written in the Bible. */
  text: string;
};

/**
 * Splits a `state_transitions` string into shot-ranged segments.
 *
 * Handles the shapes the skill actually writes:
 *   "Shots 01-07: airborne and taut. Shot 08: plummets. Shots 10-14: sodden."
 *   "Shots 1–7: ... Shot 8: ..."
 */
export function parseStateTransitions(text: string | null | undefined): StateSegment[] {
  if (!text) return [];

  const header = /\bShots?\s+(\d{1,3})\s*(?:[-–—]\s*(\d{1,3}))?\s*:/gi;
  const heads: { from: number; to: number; start: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = header.exec(text)) !== null) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    heads.push({ from, to, start: match.index, end: match.index + match[0].length });
  }

  return heads
    .map((head, i) => {
      const stop = heads[i + 1]?.start ?? text.length;
      const body = text.slice(head.end, stop).trim().replace(/[.;,]\s*$/, '');
      return { from: head.from, to: head.to, text: body };
    })
    .filter((s) => s.text.length > 0);
}

/** The condition a prop is in at a given shot, or null if unstated. */
export function stateForShot(
  transitions: string | null | undefined,
  shotNumber: number,
): string | null {
  const segments = parseStateTransitions(transitions);
  // Narrowest matching range wins, so a single-shot beat overrides the arc
  // it sits inside.
  const matches = segments.filter((s) => shotNumber >= s.from && shotNumber <= s.to);
  if (matches.length === 0) return null;
  const best = matches.reduce((narrowest, candidate) =>
    candidate.to - candidate.from < narrowest.to - narrowest.from ? candidate : narrowest,
  );
  return best.text;
}

/**
 * Props whose state is pinned at this shot — those the shot's continuity lists,
 * plus any prop whose `state_transitions` explicitly covers this shot number
 * even if the continuity line forgot it.
 *
 * The second half matters: the rope that vanished was named in the Bible's
 * state transitions but missing from the shot's `props_persisting`, so nothing
 * held it in frame.
 */
export function propsInPlay(
  props: Prop[],
  shot: Shot,
): { prop: Prop; state: string | null; introduced: boolean }[] {
  const listed = new Set<string>([
    ...shot.continuity.props_persisting,
    ...shot.continuity.props_introduced,
  ]);
  const introduced = new Set(shot.continuity.props_introduced);

  return props
    .map((prop) => ({
      prop,
      state: stateForShot(prop.state_transitions, shot.shot_number),
      introduced: introduced.has(prop.id),
    }))
    .filter(({ prop, state }) => listed.has(prop.id) || state !== null);
}

/**
 * The block appended to every shot prompt, stating what must be true in the
 * frame at this exact point in the story.
 *
 * Returns an empty string when there is nothing concrete to assert — an empty
 * heading would only dilute the prompt.
 */
export function buildStoryStateLine(
  parsed: Pick<ParsedStoryboard, 'props'>,
  shot: Shot,
): string {
  const inPlay = propsInPlay(parsed.props, shot);
  if (inPlay.length === 0) return '';

  const lines = inPlay.map(({ prop, state, introduced }) => {
    const condition = state ?? 'present in the frame as described in this shot';
    const note = introduced ? ' (appears for the first time in this shot)' : '';
    return `- ${prop.name}: ${condition}${note}.`;
  });

  return (
    'STORY STATE AT THIS POINT IN THE SEQUENCE (authoritative — every item below ' +
    'must be visibly true in this frame, in exactly the condition stated):\n' +
    `${lines.join('\n')}\n` +
    'Do not render an earlier or later state of any of these. Nothing that happens ' +
    'in a later shot has happened yet, and nothing established in an earlier shot ' +
    'has silently disappeared — if an item is listed as still present, it is still ' +
    'visible in the frame.'
  );
}
