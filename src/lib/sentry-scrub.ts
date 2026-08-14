/**
 * Sentry payload scrubbing.
 *
 * Storyboards carry client work: unreleased scripts, brand names, treatments.
 * None of it belongs in a third-party error tracker, and an error report is
 * exactly where it would leak — request bodies and breadcrumbs otherwise ride
 * along with the stack trace.
 *
 * The rule here is deny-by-default: drop request bodies wholesale rather than
 * try to enumerate the fields worth keeping. A stack trace and a route are
 * enough to debug from; the script is not.
 */

import type { ErrorEvent, EventHint, Breadcrumb } from '@sentry/nextjs';

/** Keys whose values are script/prompt content or credentials. */
const SENSITIVE_KEYS = [
  'script', 'source_input', 'source_markdown', 'markdown', 'parsed_json',
  'prompt', 'key_frame_prompt', 'reference_still_prompt', 'notes',
  'password', 'token', 'authorization', 'cookie', 'api_key', 'apikey',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((k) => lower.includes(k));
}

/** Any string long enough to be script content rather than an identifier. */
const LONG_STRING = 500;

/**
 * Recursively redact sensitive keys and truncate long strings. Depth-capped —
 * a parsed storyboard nests deeply and we don't need to walk all of it.
 */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limited]';
  if (typeof value === 'string') {
    return value.length > LONG_STRING ? `[${value.length} chars redacted]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => scrubValue(v, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '[redacted]' : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Strip request bodies, cookies and auth headers before an event is sent. */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (event.request) {
    // The body is the highest-risk field — it carries the pasted script on
    // /api/storyboard. Never send it.
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (isSensitiveKey(header)) delete event.request.headers[header];
      }
    }
    // Query strings can carry entity ids — harmless — but not secrets.
    if (typeof event.request.query_string === 'string' && event.request.query_string.length > LONG_STRING) {
      event.request.query_string = '[redacted]';
    }
  }

  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;

  // Keep the user id for grouping; drop everything else identifying.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}

/**
 * Breadcrumbs record fetch calls and console output, both of which can carry
 * prompt text. Keep the shape, drop the payload.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  }
  if (breadcrumb.category === 'console') {
    if (typeof breadcrumb.message === 'string' && breadcrumb.message.length > LONG_STRING) {
      breadcrumb.message = `[${breadcrumb.message.length} chars redacted]`;
    }
  }
  return breadcrumb;
}
