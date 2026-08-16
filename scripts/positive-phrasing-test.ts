/** Unit checks for negation rewriting and screen binding. */
import { rewriteNegations, countRewrites } from '../src/lib/positive-phrasing.js';
import { buildScreenBindingLine } from '../src/lib/screen-binding.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

// ── Expression ──────────────────────────────────────────────────────────────
// The exact line from the board that rendered a broad open laugh.
const smile = rewriteNegations('He is not smiling yet.');
check('the "not smiling yet" case is rewritten', !/not\s+smil/i.test(smile), smile);
check('and states what IS true', smile.includes('neutral, closed-mouth expression'), smile);
check('subject survives the rewrite', smile.startsWith('He is '), smile);

check('"is not smiling" without "yet"', !/not/i.test(rewriteNegations('She is not smiling.')));
check('"does not smile"', !/not/i.test(rewriteNegations('He does not smile.')));
check('"are not laughing"', rewriteNegations('They are not laughing.').includes('composed'));
check('"without a smile"', rewriteNegations('Stands without a smile.').includes('level, closed mouth'));
check('"no smile"', rewriteNegations('No smile on his face.').includes('level, closed mouth'));
check('"is not crying"', rewriteNegations('She is not crying.').includes('dry-eyed'));

// ── Gaze ────────────────────────────────────────────────────────────────────
check(
  'gaze away from the lens',
  rewriteNegations('He is not looking at the camera.').includes('looking away from the lens'),
);
check(
  '"does not look at"',
  rewriteNegations('She does not look at him.').includes('holds their gaze away from'),
);

// ── Posture ─────────────────────────────────────────────────────────────────
check('"is not moving"', rewriteNegations('He is not moving.').includes('completely still'));
check('"is not yet standing"', rewriteNegations('He is not yet standing.').includes('still seated'));
check('"has not stood up"', rewriteNegations('He has not stood up.').includes('remains seated'));

// ── Eyes ────────────────────────────────────────────────────────────────────
check('"eyes are not open"', rewriteNegations('Eyes are not open.').toLowerCase().includes('eyes closed'));
check('"eyes are not closed"', rewriteNegations('Eyes are not closed.').toLowerCase().includes('eyes open'));

// ── Restraint: unmatched text is untouched ──────────────────────────────────
const untouched = 'A wide shot of a rain-slicked alley, sodium light raking across wet brick.';
check('non-negated prose is unchanged', rewriteNegations(untouched) === untouched);
const oddNegation = 'The room is not what it seems.';
check('unmatched negations are left alone', rewriteNegations(oddNegation) === oddNegation);
check('counts what would fire', countRewrites('He is not smiling yet. She is not moving.') === 2);
check('counts zero on clean prose', countRewrites(untouched) === 0);

// Case is preserved enough to stay readable.
check(
  'works mid-sentence',
  rewriteNegations('Seated in the chair, he is not smiling, hands flat.').includes('hands flat'),
);

// ── Screen binding ──────────────────────────────────────────────────────────
const label = (id: string) => ({ 'CHAR-DON': 'Heavy-set man in a dark suit', 'CHAR-DENTIST': 'Man in a white coat' }[id] ?? id);

check('single character gets no binding', buildScreenBindingLine(['CHAR-DON'], label) === null);
check('empty cast gets no binding', buildScreenBindingLine([], label) === null);

const guard = buildScreenBindingLine(['CHAR-DON', 'CHAR-DENTIST'], label);
check('two characters get a binding', guard !== null);
check('binding states the count', guard!.includes('exactly 2'), guard ?? '');
check('binding forbids blending', guard!.includes('blend'), guard ?? '');
check('binding names both labels', guard!.includes('dark suit') && guard!.includes('white coat'));
check('binding omits positions when there are none', !guard!.includes('SCREEN POSITIONS'));

const positioned = buildScreenBindingLine(['CHAR-DON', 'CHAR-DENTIST'], label, [
  { entity_id: 'CHAR-DON', position: 'frame-left, seated, facing right.' },
  { entity_id: 'CHAR-DENTIST', position: 'frame-right, standing over him' },
]);
check('positions are emitted', positioned!.includes('SCREEN POSITIONS'), positioned ?? '');
check('position text is attached to the label', positioned!.includes('dark suit — frame-left, seated, facing right.'));
check('duplicate full stops are avoided', !positioned!.includes('right..'));

const strayPosition = buildScreenBindingLine(['CHAR-DON', 'CHAR-DENTIST'], label, [
  { entity_id: 'CHAR-NOBODY', position: 'frame-centre' },
]);
check('positions for absent characters are dropped', !strayPosition!.includes('SCREEN POSITIONS'));

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} phrasing and binding tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
