import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json() as { password?: string };
  const { password } = body;

  const expected = process.env.LOOMER_PASSWORD;
  if (!expected) {
    // No password configured — treat any submission as valid
    const response = NextResponse.json({ ok: true });
    response.cookies.set('loomer-auth', '', { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 30 });
    return response;
  }

  if (password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('loomer-auth', expected, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
  });
  return response;
}
