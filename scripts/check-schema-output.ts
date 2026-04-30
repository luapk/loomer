/**
 * Quick utility: print the JSON Schema produced by zod-to-json-schema for the
 * top-level ParsedStoryboardSchema. Used to verify Anthropic tool_use compatibility.
 */
import { ParsedStoryboardSchema } from '../src/schema/storyboard.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const schema = zodToJsonSchema(ParsedStoryboardSchema, {
  target: 'openApi3',
  $refStrategy: 'none',
});

// zodToJsonSchema returns a plain object; we need to inspect its shape to verify
// Anthropic tool-use compatibility. Using a typed cast here because the return
// type is intentionally opaque (`object`).
interface JsonSchemaObject {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
}
const s = schema as JsonSchemaObject;
console.log('Top-level type:', s.type);
console.log('Required fields:', s.required);
console.log('Has properties:', Object.keys(s.properties ?? {}).length);
console.log('Schema size:', JSON.stringify(schema).length, 'chars');

const ok = s.type === 'object' && s.properties && Array.isArray(s.required);
console.log(ok ? '\nOK: Anthropic-compatible top-level shape' : '\nFAIL: Schema shape problem');

console.log('\nSample nested schema (shot duration):');
const shotsSchema = s.properties?.['shots'];
const durationSchema = shotsSchema?.items?.properties?.['duration'];
console.log(JSON.stringify(durationSchema, null, 2));
