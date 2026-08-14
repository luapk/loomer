/** Unit checks for conditioning-image label uniqueness. */
import { uniqueVisualLabels } from '../src/lib/entity-labels.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

// The case that broke real boards: one performer, two guises, physical
// description shared verbatim as the parser is instructed to do.
const SHARED = 'A man in his fifties, heavy brow, broken nose, greying temples';
const guises = uniqueVisualLabels([
  { id: 'CHAR-VITO-MOBSTER', prompt: `${SHARED}. Wearing a sharkskin suit.` },
  { id: 'CHAR-VITO-DENTIST', prompt: `${SHARED}. Wearing a white dental coat.` },
]);

check(
  'dual guises do not share a label',
  guises['CHAR-VITO-MOBSTER'] !== guises['CHAR-VITO-DENTIST'],
  `both were "${guises['CHAR-VITO-MOBSTER']}"`,
);
check(
  'the mobster label names its guise',
  (guises['CHAR-VITO-MOBSTER'] ?? '').includes('mobster'),
  guises['CHAR-VITO-MOBSTER'],
);
check(
  'the dentist label names its guise',
  (guises['CHAR-VITO-DENTIST'] ?? '').includes('dentist'),
  guises['CHAR-VITO-DENTIST'],
);
check(
  'the shared description is kept, not discarded',
  (guises['CHAR-VITO-MOBSTER'] ?? '').startsWith(SHARED),
  guises['CHAR-VITO-MOBSTER'],
);

// Distinct entities keep clean, unqualified labels.
const distinct = uniqueVisualLabels([
  { id: 'CHAR-LEO', prompt: 'A boy of eight with a crimson kite. Windswept.' },
  { id: 'CHAR-MAYA', prompt: 'A woman in her thirties, dark bob. Calm.' },
  { id: 'LOC-PIER', prompt: 'A weathered timber pier at low tide. Empty.' },
]);
check('distinct entities are not qualified', !distinct['CHAR-LEO']?.includes('('), distinct['CHAR-LEO']);
check('every entity gets a label', Object.keys(distinct).length === 3);

// Three-way collision.
const triple = uniqueVisualLabels([
  { id: 'CHAR-GUARD-ONE', prompt: 'An armoured guard. Helmeted.' },
  { id: 'CHAR-GUARD-TWO', prompt: 'An armoured guard. Bareheaded.' },
  { id: 'CHAR-GUARD-THREE', prompt: 'An armoured guard. Wounded.' },
]);
const tripleLabels = Object.values(triple);
check('a three-way collision resolves to three labels', new Set(tripleLabels).size === 3,
  JSON.stringify(tripleLabels));

// A short prompt still yields a usable label.
const short = uniqueVisualLabels([{ id: 'PROP-KITE', prompt: 'A kite.' }]);
check('a short prompt still labels', (short['PROP-KITE'] ?? '').length > 0, short['PROP-KITE']);

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} entity-label tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
