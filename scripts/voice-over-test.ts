/** Unit checks for dialogue → speakable line extraction. */
import { parseDialogueLine, voiceOverLines } from '../src/lib/voice-over.js';

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    return;
  }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m`);
  console.error(`      got:      ${JSON.stringify(actual)}`);
  console.error(`      expected: ${JSON.stringify(expected)}`);
}

check(
  'strips speaker cue and (V.O.)',
  parseDialogueLine('MAYA (V.O.): We never went back.'),
  { text: 'We never went back.', speaker: 'MAYA' },
);

check(
  'strips a bare speaker cue',
  parseDialogueLine('NARRATOR: The tide came in.'),
  { text: 'The tide came in.', speaker: 'NARRATOR' },
);

check(
  'keeps a line with no cue intact',
  parseDialogueLine('We never went back.'),
  { text: 'We never went back.', speaker: null },
);

check(
  'does not mistake a capitalised opener for a cue',
  parseDialogueLine('Dad said it would hold.'),
  { text: 'Dad said it would hold.', speaker: null },
);

check(
  'removes bracketed stage directions',
  parseDialogueLine("LEO (CONT'D): I know. [beat] I know."),
  { text: 'I know. I know.', speaker: 'LEO' },
);

check(
  'unwraps surrounding quotes',
  parseDialogueLine('"Hold it steady."'),
  { text: 'Hold it steady.', speaker: null },
);

check(
  'handles a hyphenated / apostrophed speaker',
  parseDialogueLine("MR. O'HARE: Not today."),
  { text: 'Not today.', speaker: "MR. O'HARE" },
);

// Line selection across a board.
const shots = [
  { shot_number: 3, dialogue_vo: 'MAYA (V.O.): Later.' },
  { shot_number: 1, dialogue_vo: null },
  { shot_number: 2, dialogue_vo: '   ' },
  { shot_number: 4, dialogue_vo: '—' },          // a beat, not a line
  { shot_number: 5, dialogue_vo: 'Go.' },
];

check(
  'selects only speakable lines, in shot order',
  voiceOverLines(shots),
  [
    { shotNumber: 3, text: 'Later.', speaker: 'MAYA' },
    { shotNumber: 5, text: 'Go.', speaker: null },
  ],
);

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} voice-over tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
