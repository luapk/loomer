/** Unit checks for streaming-markdown progress analysis. */
import {
  analyseWriting,
  estimateRemainingSeconds,
  formatRemaining,
} from '../src/lib/generation-progress.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

// Nothing yet.
const empty = analyseWriting('');
check('empty stream reports starting', empty.phase === 'starting', empty.phase);
check('empty stream claims no fraction', empty.fraction === null);

// Bible phase, entities appearing.
const bible = analyseWriting(`# Leo and the Dolphin

## Continuity Bible

### Characters

#### CHAR-LEO
A boy of eight.

#### CHAR-MAYA
His mother.

### Locations

#### LOC-PIER-AFTERNOON
A weathered pier.
`);
check('bible phase detected', bible.phase === 'bible', bible.phase);
check('counts characters', bible.characters === 2, String(bible.characters));
check('counts locations', bible.locations === 1, String(bible.locations));
check('no fraction before the total is known', bible.fraction === null);
check('label names the entities', bible.label.includes('2 characters'), bible.label);

// Mid-table: the total must NOT be published yet, or the bar jumps backwards.
const midTable = analyseWriting(`## Shot list summary

| # | Scale | Loc |
|---|---|---|
| 01 | EWS | LOC-PIER |
| 02 | MS | LOC-PIER |
`);
check('mid-table total is withheld', midTable.totalShots === null, String(midTable.totalShots));
check('mid-table phase is shot-list', midTable.phase === 'shot-list', midTable.phase);

// Table closed by the next section — now the total is trustworthy.
const summaryDone = `## Shot list summary

| # | Scale | Loc |
|---|---|---|
| 01 | EWS | LOC-PIER |
| 02 | MS | LOC-PIER |
| 03 | CU | LOC-PIER |
| 04 | WS | LOC-BOAT |

## Per-shot blocks
`;
const totalKnown = analyseWriting(summaryDone);
check('total read from the closed table', totalKnown.totalShots === 4, String(totalKnown.totalShots));

// Shots streaming in.
const twoShots = analyseWriting(`${summaryDone}
### Shot 01 — LOC-PIER — Establishing
**Function**: Set the scene.

### Shot 02 — LOC-PIER — Leo waits
**Function**: Introduce Leo.
`);
check('counts written shots', twoShots.shotsWritten === 2, String(twoShots.shotsWritten));
check('phase is shots', twoShots.phase === 'shots', twoShots.phase);
check('fraction is real', twoShots.fraction === 0.5, String(twoShots.fraction));
check('label counts against the total', twoShots.label === 'Writing shot 2 of 4', twoShots.label);

// Audit at the end.
const audited = analyseWriting(`${summaryDone}
### Shot 01 — a
### Shot 02 — b
### Shot 03 — c
### Shot 04 — d

## Followability audit
All clear.
`);
check('audit phase detected', audited.phase === 'audit', audited.phase);
check('fraction reaches 1', audited.fraction === 1, String(audited.fraction));

// Fraction is clamped even if more shot headings appear than the table declared.
const overshoot = analyseWriting(`${summaryDone}
### Shot 01 — a
### Shot 02 — b
### Shot 03 — c
### Shot 04 — d
### Shot 05 — e
`);
check('fraction never exceeds 1', overshoot.fraction === 1, String(overshoot.fraction));

// ETA: refuses to guess without evidence.
check('no ETA without a fraction', estimateRemainingSeconds(null, 60_000) === null);
check('no ETA too early', estimateRemainingSeconds(0.5, 1000) === null);
check('no ETA at a negligible fraction', estimateRemainingSeconds(0.01, 60_000) === null);
check(
  'ETA from observed rate',
  estimateRemainingSeconds(0.25, 30_000) === 90,
  String(estimateRemainingSeconds(0.25, 30_000)),
);

check('formats seconds', formatRemaining(40) === 'about 40 sec left', String(formatRemaining(40)));
check('formats minutes', formatRemaining(180) === 'about 3 min left', String(formatRemaining(180)));
check('formats imminent', formatRemaining(5) === 'any moment now', String(formatRemaining(5)));
check('formats nothing from null', formatRemaining(null) === null);

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} progress tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
