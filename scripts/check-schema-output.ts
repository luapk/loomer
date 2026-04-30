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

const s = schema as any;
console.log('Top-level type:', s.type);
console.log('Required fields:', s.required);
console.log('Has properties:', Object.keys(s.properties || {}).length);
console.log('Schema size:', JSON.stringify(schema).length, 'chars');

const ok = s.type === 'object' && s.properties && Array.isArray(s.required);
console.log(ok ? '\nOK: Anthropic-compatible top-level shape' : '\nFAIL: Schema shape problem');

console.log('\nSample nested schema (shot duration):');
console.log(JSON.stringify(s.properties.shots.items.properties.duration, null, 2));
