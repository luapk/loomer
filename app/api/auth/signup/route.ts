import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { adminEmails, hashPassword, sessionCookieOptions, signSession, SESSION_COOKIE } from '@/src/lib/auth';
import { ensureStarterCredits } from '@/src/lib/credits';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  inviteCode: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid email or password';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Optional invite gate: when SIGNUP_CODE is set, new accounts need it.
  // Admin emails are exempt so the owner can always bootstrap.
  const signupCode = process.env.SIGNUP_CODE;
  if (signupCode && !adminEmails().includes(email) && parsed.data.inviteCode !== signupCode) {
    return NextResponse.json({ error: 'An invite code is required to create an account', code: 'INVITE_REQUIRED' }, { status: 403 });
  }

  const db = getDb();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists — sign in instead' }, { status: 409 });
  }

  const role = adminEmails().includes(email) ? 'ADMIN' as const : 'MEMBER' as const;
  const user = await db.user.create({
    data: { email, password_hash: await hashPassword(parsed.data.password), role },
    select: { id: true, email: true, role: true },
  });

  // Starter credits so the tool can be tried before paying. Without this the
  // first run is a paywall before anyone has seen it work.
  await ensureStarterCredits(db, user.id);

  const token = signSession({ uid: user.id, email: user.email, role: user.role });
  const response = NextResponse.json({ ok: true, email: user.email, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
