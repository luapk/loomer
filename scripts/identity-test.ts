/** Unit checks for the voice-only character filter. */
import { isVoiceOnlyCharacter, partitionByVoiceOnly } from '../src/lib/character-identity.js';

const voices: [string, string][] = [
  ['CHAR-NARRATOR', 'Narrator'],
  ['CHAR-VO', 'Voice Over'],
  ['CHAR-MAYA-VO', 'Maya (V.O.)'],
  ['CHAR-ANNOUNCER', 'Voice of the Announcer'],
  ['CHAR-X', 'Narration'],
  ['CHAR-Y', 'Off-screen Voice'],
];
const people: [string, string][] = [
  ['CHAR-LEO', 'Leo'],
  ['CHAR-MAYA', 'Maya Chen'],
  ['CHAR-VITO-MOBSTER', 'Vito, the Mobster'],
  ['CHAR-VITO-DENTIST', 'Vito, the Dentist'],
  ['CHAR-VIOLET', 'Violet'],       // contains "vo" but not as a marker
  ['CHAR-DAVOS', 'Davos'],
];

let pass = 0, fail = 0;
for (const [id, name] of voices) {
  if (isVoiceOnlyCharacter(id, name)) { pass++; }
  else { fail++; console.error(`  ✘ expected voice-only: ${id} / ${name}`); }
}
for (const [id, name] of people) {
  if (!isVoiceOnlyCharacter(id, name)) { pass++; }
  else { fail++; console.error(`  ✘ expected renderable: ${id} / ${name}`); }
}

const { rendered, voiceOnly } = partitionByVoiceOnly(
  [...voices, ...people].map(([id, name]) => ({ id, name })),
);
if (rendered.length === people.length && voiceOnly.length === voices.length) pass++;
else { fail++; console.error(`  ✘ partition: ${rendered.length} rendered / ${voiceOnly.length} voice`); }

console.log(fail === 0 ? `\x1b[32m  ✔ ${pass}/${pass + fail} identity tests passed\x1b[0m`
                       : `\x1b[31m  ✘ ${fail} failed\x1b[0m`);
process.exit(fail === 0 ? 0 : 1);
