// Browser-side Sentry. Next.js 15.3+ loads this automatically.
import * as Sentry from '@sentry/nextjs';
import { scrubEvent, scrubBreadcrumb } from '@/src/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  // Client tracing is tree-shaken out in next.config.ts — errors only.
  tracesSampleRate: 0,
  // Session replay is deliberately off: it would record the script the user
  // pasted and the frames on screen — client work we shouldn't ship offsite.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
