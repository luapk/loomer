// Server-side Sentry. Loaded from instrumentation.ts on the Node.js runtime.
// No DSN set → the SDK no-ops, so local dev and un-configured deploys are safe.
import * as Sentry from '@sentry/nextjs';
import { scrubEvent, scrubBreadcrumb } from '@/src/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Never attach IPs, headers or bodies automatically — scrubEvent assumes it
  // is the only thing deciding what leaves the server.
  sendDefaultPii: false,
  // Errors are the point; traces are sampled thinly so a board run (dozens of
  // image calls) doesn't flood the quota.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
