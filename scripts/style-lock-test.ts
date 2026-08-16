/** Unit checks for style-lock-driven prompt construction. */
import {
  resolveRegister,
  effectiveLook,
  hasUsableStyleLock,
  styleTextForShot,
  buildPhotorealDeclaration,
} from '../src/lib/style-lock-prompt.js';
import { PHOTOREAL_HOUSE_STYLE, PHOTOREAL_MEDIUM_GUARD } from '../src/lib/photoreal-style.js';
import type { ParsedStoryboard } from '../src/schema/storyboard.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

type StyleLock = ParsedStoryboard['style_lock'];

const seven: StyleLock = {
  look: 'Se7en aesthetic — oppressive interrogation noir, near-monochrome',
  dp_reference: 'Darius Khondji — hard sources, deep shadow, bleach-bypass',
  lens_default: '32mm at f/2',
  colour_grade: 'Crushed blacks, desaturated to near-monochrome, sodium highlights',
  film_stock_feel: 'Kodak 5219 push-processed',
  lighting_register: 'Single hard overhead practical, everything else falls off to black',
  texture: 'Heavy grain, wet concrete, no gloss',
  negative_style: 'No warm fill, no clean digital sheen',
  aspect_ratio: '2.39:1',
  raw_block: 'LOOK: Se7en…',
};

// ── The lock reaches the prompt ─────────────────────────────────────────────
const text = styleTextForShot(seven, 3);
check('lock look is emitted', text.includes('Se7en aesthetic'), text.slice(0, 90));
check('DP reference is emitted', text.includes('Darius Khondji'));
check('colour grade is emitted', text.includes('Crushed blacks'));
check('film stock is emitted', text.includes('5219'));
check('negative style is emitted', text.includes('No warm fill'));
check('medium guard is always appended', text.endsWith(PHOTOREAL_MEDIUM_GUARD));

// The whole point: the house style must NOT contradict the board's own lock.
check(
  'house style is not emitted when a lock exists',
  !text.includes('No crushed blacks'),
  text,
);

// ── Fallback ────────────────────────────────────────────────────────────────
const noLock = styleTextForShot(null, 1);
check('falls back to the house style', noLock.includes(PHOTOREAL_HOUSE_STYLE.slice(0, 40)));

const thin: StyleLock = { ...seven, look: 'Nice', colour_grade: '', lighting_register: '' };
check('a thin lock is rejected', !hasUsableStyleLock(thin));
check('a real lock is accepted', hasUsableStyleLock(seven));
check(
  'a thin lock falls back to the house style',
  styleTextForShot(thin, 1).includes('Arri Alexa 35'),
);

// ── Registers ───────────────────────────────────────────────────────────────
const twoRegisters: StyleLock = {
  ...seven,
  registers: [
    {
      name: 'Register A — interrogation noir',
      from_shot: 1,
      to_shot: 9,
      look: null,
      colour_grade: null,
      lighting_register: null,
      film_stock_feel: null,
      texture: null,
    },
    {
      name: 'Register B — clinical warmth',
      from_shot: 10,
      to_shot: 14,
      look: 'Bright modern dental surgery, open and reassuring',
      colour_grade: 'Warm neutral whites, gentle lift, full saturation',
      lighting_register: 'Broad soft daylight through full-height glass',
      film_stock_feel: null,
      texture: null,
    },
  ],
};

check('register A resolves', resolveRegister(twoRegisters, 4)?.name.includes('Register A') === true);
check('register B resolves', resolveRegister(twoRegisters, 12)?.name.includes('Register B') === true);
check('out-of-range resolves to nothing', resolveRegister(twoRegisters, 99) === null);
check('no registers resolves to nothing', resolveRegister(seven, 3) === null);

const lookA = effectiveLook(twoRegisters, 4);
check('register A inherits the baseline grade', lookA.colour_grade.includes('Crushed blacks'));

const lookB = effectiveLook(twoRegisters, 12);
check('register B overrides the grade', lookB.colour_grade.includes('Warm neutral whites'), lookB.colour_grade);
check('register B overrides the look', lookB.look.includes('dental surgery'));
check('register B inherits the lens', lookB.lens_default === '32mm at f/2');
check('register B inherits the film stock', lookB.film_stock_feel === 'Kodak 5219 push-processed');

const textB = styleTextForShot(twoRegisters, 12);
check('register is named in the prompt', textB.includes('Register B'), textB.slice(0, 120));
check('register B text carries the warm grade', textB.includes('Warm neutral whites'));
check('register B text drops the noir grade', !textB.includes('Crushed blacks'));

// Narrowest range wins where ranges overlap.
const overlapping: StyleLock = {
  ...seven,
  registers: [
    { name: 'Baseline', from_shot: 1, to_shot: 20, look: 'Baseline look', colour_grade: null, lighting_register: null, film_stock_feel: null, texture: null },
    { name: 'Dream', from_shot: 8, to_shot: 9, look: 'Dream look', colour_grade: null, lighting_register: null, film_stock_feel: null, texture: null },
  ],
};
check('narrowest overlapping register wins', resolveRegister(overlapping, 8)?.name === 'Dream');
check('wider register applies outside the narrow one', resolveRegister(overlapping, 15)?.name === 'Baseline');

// ── Declaration ─────────────────────────────────────────────────────────────
const decl = buildPhotorealDeclaration(seven, 3, 'CU');
check('declaration is marked mandatory', decl.startsWith('OUTPUT STYLE (mandatory):'));
check('declaration carries the lock', decl.includes('Se7en aesthetic'));
check('declaration carries the DoF line for the scale', decl.includes('Depth of field: shallow'));
check(
  'declaration binds reference images to the style',
  decl.includes('including characters and locations taken from reference images'),
);

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} style lock tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
