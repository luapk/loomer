import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  // No edge config: this app deliberately runs nothing on the Edge runtime —
  // see CLAUDE.md on why Edge middleware was removed.
}

/**
 * Captures errors thrown inside server components, route handlers and the
 * data-fetching layer, which don't surface through the client SDK.
 */
export const onRequestError = Sentry.captureRequestError;
