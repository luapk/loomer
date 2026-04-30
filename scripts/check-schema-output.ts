/**
 * Quick utility: print the JSON Schema produced by zod-to-json-schema for the
 * top-level ParsedStoryboardSchema. Used to verify Anthropic tool_use compatibility.
 */
import { ParsedStoryboardSchema } from '../src/schema/storyboard.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const rawSchema = zodToJsonSchema(ParsedStoryboardSchema, {
  target: 'jsonSchema7',
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
  exclusiveMinimum?: number | boolean;
  minimum?: number;
  anyOf?: JsonSchemaObject[];
  nullable?: boolean;
}

function sanitize(schema: unknown): JsonSchemaObject {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return {};
  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '$schema') continue;
    if (key === 'exclusiveMinimum' && val === true && typeof obj['minimum'] === 'number') {
      out['exclusiveMinimum'] = obj['minimum'];
      continue;
    }
    if (key === 'minimum' && obj['exclusiveMinimum'] === true) continue;
    if (key === 'exclusiveMaximum' && val === true && typeof obj['maximum'] === 'number') {
      out['exclusiveMaximum'] = obj['maximum'];
      continue;
    }
    if (key === 'maximum' && obj['exclusiveMaximum'] === true) continue;
    if (Array.isArray(val)) {
      out[key] = val.map((item) =>
        typeof item === 'object' && item !== null ? sanitize(item) : item,
      );
    } else if (typeof val === 'object' && val !== null) {
      out[key] = sanitize(val);
    } else {
      out[key] = val;
    }
  }
  return out as JsonSchemaObject;
}

const s = sanitize(rawSchema);
const json = JSON.stringify(s, null, 2);

console.log('Top-level type:', s.type);
console.log('Required fields:', s.required);
console.log('Has properties:', Object.keys(s.properties ?? {}).length);
console.log('Schema size:', json.length, 'chars');
console.log('Has nullable (bad):', json.includes('"nullable"'));
console.log('Has anyOf (expected for nullable fields):', json.includes('"anyOf"'));

const ok = s.type === 'object' && s.properties && Array.isArray(s.required) && !json.includes('"nullable"');
console.log(ok ? '\nOK: Anthropic-compatible top-level shape' : '\nFAIL: Schema shape problem');

console.log('\nSample nested schema (shot duration):');
const shotsSchema = s.properties?.['shots'];
const durationSchema = shotsSchema?.items?.properties?.['duration'];
console.log(JSON.stringify(durationSchema, null, 2));
