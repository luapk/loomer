/** Unit checks for story-state continuity extraction. */
import {
  parseStateTransitions,
  stateForShot,
  propsInPlay,
  buildStoryStateLine,
} from '../src/lib/shot-state.js';
import type { ParsedStoryboard } from '../src/schema/storyboard.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

// ── Transition parsing ──────────────────────────────────────────────────────
const kite = 'Shots 01-07: airborne and taut. Shot 08: plummets and splashes. Shots 10-14: sodden, dragged through water.';
const segments = parseStateTransitions(kite);
check('three segments parsed', segments.length === 3, String(segments.length));
check('first range parsed', segments[0]?.from === 1 && segments[0]?.to === 7);
check('single-shot range parsed', segments[1]?.from === 8 && segments[1]?.to === 8);
check('trailing full stop stripped', segments[0]?.text === 'airborne and taut', segments[0]?.text);
check('last segment text kept whole', segments[2]?.text === 'sodden, dragged through water', segments[2]?.text);

check('en-dash ranges parse', parseStateTransitions('Shots 1–3: tied.')[0]?.to === 3);
check('empty input yields nothing', parseStateTransitions(null).length === 0);
check('prose with no ranges yields nothing', parseStateTransitions('It gets wet.').length === 0);

// ── State lookup ────────────────────────────────────────────────────────────
check('state in range', stateForShot(kite, 3) === 'airborne and taut');
check('state at boundary', stateForShot(kite, 7) === 'airborne and taut');
check('state at single-shot beat', stateForShot(kite, 8) === 'plummets and splashes');
check('gap in coverage returns null', stateForShot(kite, 9) === null);
check('narrowest range wins', stateForShot('Shots 1-10: tied. Shot 5: cut free.', 5) === 'cut free');

// ── Props in play ───────────────────────────────────────────────────────────
const board = {
  props: [
    {
      id: 'PROP-ROPE',
      name: 'Rope',
      full_description: 'Coarse hemp rope.',
      reference_still_prompt: null,
      state_transitions: 'Shots 01-08: binding both wrists to the chair arms. Shots 09-14: gone, wrists free.',
      generates_reference_still: true,
    },
    {
      id: 'PROP-CHAIR',
      name: 'Wooden chair',
      full_description: 'A battered kitchen chair.',
      reference_still_prompt: null,
      state_transitions: null,
      generates_reference_still: true,
    },
    {
      id: 'PROP-PLIERS',
      name: 'Pliers',
      full_description: 'Rusted pliers.',
      reference_still_prompt: null,
      state_transitions: null,
      generates_reference_still: true,
    },
  ],
} as unknown as ParsedStoryboard;

function shotAt(n: number, persisting: string[], introduced: string[] = []) {
  return {
    shot_number: n,
    continuity: {
      characters: [],
      location_id: 'LOC-ROOM',
      props_persisting: persisting,
      props_introduced: introduced,
      light_direction: 'overhead',
      time_of_day: 'night',
    },
  } as unknown as ParsedStoryboard['shots'][number];
}

// The rope is missing from this shot's continuity — exactly the failure that
// let it vanish mid-sequence. Its state transitions still cover shot 06, so it
// must be held in frame anyway.
const play6 = propsInPlay(board.props, shotAt(6, ['PROP-CHAIR']));
check('listed prop is in play', play6.some((p) => p.prop.id === 'PROP-CHAIR'));
check(
  'unlisted prop with a covering transition is still in play',
  play6.some((p) => p.prop.id === 'PROP-ROPE'),
  play6.map((p) => p.prop.id).join(','),
);
check('unrelated prop stays out', !play6.some((p) => p.prop.id === 'PROP-PLIERS'));

const play12 = propsInPlay(board.props, shotAt(12, []));
check('a prop whose state says "gone" is still declared', play12.some((p) => p.prop.id === 'PROP-ROPE'));
check(
  'and it is declared as gone',
  play12.find((p) => p.prop.id === 'PROP-ROPE')?.state?.includes('gone') === true,
);

const introducedFlag = propsInPlay(board.props, shotAt(2, [], ['PROP-PLIERS']));
check('introduced prop is flagged', introducedFlag.find((p) => p.prop.id === 'PROP-PLIERS')?.introduced === true);

// ── The prompt block ────────────────────────────────────────────────────────
const line = buildStoryStateLine(board, shotAt(6, ['PROP-CHAIR']));
check('block is marked authoritative', line.includes('STORY STATE AT THIS POINT'), line.slice(0, 60));
check('block names the rope state', line.includes('binding both wrists'));
check('block names the chair', line.includes('Wooden chair'));
check('block forbids pre-firing later states', line.includes('Nothing that happens'));

const introLine = buildStoryStateLine(board, shotAt(2, [], ['PROP-PLIERS']));
check('introduction is called out', introLine.includes('appears for the first time'));

check('nothing in play yields an empty block', buildStoryStateLine({ props: [] } as unknown as ParsedStoryboard, shotAt(1, [])) === '');

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} shot state tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
