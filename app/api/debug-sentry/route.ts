import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireSession } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Admin-only smoke test: confirms events actually reach Sentry.
 *
 * Plain GET sends a captured message (tests the manual path and the DSN).
 * `?throw=1` raises an uncaught error instead, which tests the automatic
 * `onRequestError` path — the one that catches real production failures.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  if (request.nextUrl.searchParams.get('throw') === '1') {
    // Deliberate: verifies unhandled route-handler errors are captured.
    throw new Error('Sentry smoke test — deliberate error from /api/debug-sentry');
  }

  const configured = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: 'No SENTRY_DSN set — the SDK is inert. Add it in Vercel and redeploy.',
    });
  }

  const eventId = Sentry.captureMessage('Sentry smoke test from /api/debug-sentry', 'info');
  await Sentry.flush(2000);

  return NextResponse.json({
    ok: true,
    configured: true,
    eventId,
    message: 'Test event sent — check the Sentry issues feed.',
  });
}
