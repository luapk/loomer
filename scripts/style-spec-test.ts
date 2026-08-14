/** Unit checks for the compiled style spec. */
import {
  StyleSpecSchema,
  parseStyleSpec,
  styleSpecToPrompt,
  STYLE_SPEC_VERSION,
  type StyleSpec,
} from '../src/schema/style-spec.js';

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { pass++; return; }
  fail++;
  console.error(`  \x1b[31m✘ ${label}\x1b[0m${detail ? `\n      ${detail}` : ''}`);
}

const SPEC: StyleSpec = {
  version: STYLE_SPEC_VERSION,
  reading: 'Muted gouache concept painting with hard low side light.',
  medium: 'Gouache concept painting on cold-press paper',
  photographic: false,
  palette: 'Desaturated earth tones — ochre #C08A3E, slate #46525C, bone #E8E1D4',
  lighting: 'Hard low side light, single source, long shadows',
  grade: 'Low contrast, lifted blacks, no pure white',
  texture: 'Visible paper tooth, dry-brush edges',
  line_and_edge: 'Soft edges throughout, no drawn outline',
  detail_level: 'Detail resolved on the subject, dissolving by mid-ground',
  avoid: ['No photographic grain', 'Faces stylised but anatomically proportioned'],
};

// The whole point of a spec: the same style produces the same instruction on
// every one of a board's forty-five renders.
check(
  'the prompt is deterministic',
  styleSpecToPrompt(SPEC) === styleSpecToPrompt({ ...SPEC }),
);

// Every authored field has to reach the model — a field that compiles but is
// never rendered is a silent hole in the style.
const prompt = styleSpecToPrompt(SPEC);
for (const [field, value] of Object.entries(SPEC)) {
  if (field === 'version' || field === 'reading' || field === 'photographic') continue;
  const expected = Array.isArray(value) ? value.join('; ') : String(value);
  check(`the prompt carries ${field}`, prompt.includes(expected), prompt);
}

check(
  'the prompt separates HOW from WHAT',
  prompt.includes('HOW it is drawn') && prompt.includes('WHO and WHAT'),
);

// Round-tripping through a Json column.
check('a valid spec parses back', parseStyleSpec(JSON.parse(JSON.stringify(SPEC))) !== null);
check('null is not a spec', parseStyleSpec(null) === null);
check('an arbitrary object is not a spec', parseStyleSpec({ medium: 'gouache' }) === null);
check(
  'a spec from an older version is rejected',
  parseStyleSpec({ ...SPEC, version: 0 }) === null,
  'an unrecognised shape must not be read as current',
);

// The compiler stamps `version` itself, so the schema must reject a spec that
// arrives without one rather than defaulting it.
check(
  'a spec without a version is rejected',
  !StyleSpecSchema.safeParse({ ...SPEC, version: undefined }).success,
);
check(
  'a spec with no avoid entries is rejected',
  !StyleSpecSchema.safeParse({ ...SPEC, avoid: [] }).success,
  'every look needs at least one stated trap',
);

console.log(
  fail === 0
    ? `\x1b[32m  ✔ ${pass}/${pass + fail} style-spec tests passed\x1b[0m`
    : `\x1b[31m  ✘ ${fail} of ${pass + fail} failed\x1b[0m`,
);
process.exit(fail === 0 ? 0 : 1);
