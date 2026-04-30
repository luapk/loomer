import { ParsedStoryboardSchema } from '../src/schema/storyboard';
import { zodToJsonSchema } from 'zod-to-json-schema';
const schema = zodToJsonSchema(ParsedStoryboardSchema, { target: 'openApi3', $refStrategy: 'none' });
const json = JSON.stringify(schema, null, 2);
console.log('nullable:', json.includes('nullable'));
console.log('anyOf:', json.includes('anyOf'));
if (json.includes('nullable')) {
  const idx = json.indexOf('nullable');
  console.log('nullable context:', json.slice(Math.max(0,idx-100), idx+150));
}
if (json.includes('anyOf')) {
  const idx = json.indexOf('anyOf');
  console.log('anyOf context:', json.slice(Math.max(0,idx-100), idx+200));
}
// Print full schema
console.log('\n--- FULL SCHEMA ---\n', json);
