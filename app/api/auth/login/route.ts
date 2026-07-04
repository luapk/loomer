import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/src/lib/db';
import { adminEmails, verifyPassword, sessionCookieOptions, signSession, SESSION_COOKIE } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
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
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 422 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const db = getDb();

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, password_hash: true },
  });
  // Same error for unknown email and wrong password — no account enumeration.
  if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
  }

  // Promote to admin if the email has been added to the admin list since signup.
  let role = user.role;
  if (role !== 'ADMIN' && adminEmails().includes(email)) {
    await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    role = 'ADMIN';
  }

  const token = signSession({ uid: user.id, email: user.email, role });
  const response = NextResponse.json({ ok: true, email: user.email, role });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
