/**
 * Email + password accounts with HMAC-signed session cookies.
 *
 * Deliberately dependency-free (node:crypto only) per the project rule
 * against auth providers — see docs/decisions/REVISIT-auth.md for why the
 * single-password gate was superseded.
 *
 * Session token format: base64url(payload-json) + '.' + base64url(hmac).
 * Secret: SESSION_SECRET env (falls back to LOOMER_PASSWORD so existing
 * deployments keep working until SESSION_SECRET is set).
 */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = 'loomer-session';
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Emails granted ADMIN on signup/login. Comma-separated env override.
const DEFAULT_ADMIN_EMAILS = ['paulknott@gmail.com'];

export function adminEmails(): string[] {
  const env = process.env.ADMIN_EMAILS;
  const fromEnv = env ? env.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
  return [...new Set([...DEFAULT_ADMIN_EMAILS, ...fromEnv])];
}

export interface Session {
  uid: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  exp: number; // unix seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.LOOMER_PASSWORD;
  if (!s) throw new Error('SESSION_SECRET (or LOOMER_PASSWORD) must be set');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function hmac(data: string): string {
  return b64url(createHmac('sha256', secret()).update(data).digest());
}

// ─── Password hashing (scrypt) ───────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ─── Session tokens ──────────────────────────────────────────────────────────

export function signSession(payload: Omit<Session, 'exp'>): string {
  const full: Session = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S };
  const body = b64url(Buffer.from(JSON.stringify(full), 'utf8'));
  return `${body}.${hmac(body)}`;
}

export function verifySessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    if (typeof session.exp !== 'number' || session.exp < Date.now() / 1000) return null;
    if (!session.uid || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

// ─── Server-side accessors ───────────────────────────────────────────────────

/** Read + verify the session in a server component / route handler. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * API-route guard. Returns the session, or a ready-to-return 401 response.
 * Usage:  const auth = await requireSession();
 *         if (auth instanceof NextResponse) return auth;
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  return session;
}

/**
 * Ownership guard for a storyboard. Admins pass for any board. Orphan boards
 * (user_id null — created before accounts existed) are claimed by the first
 * signed-in user to touch them. Returns null when authorized, or a
 * ready-to-return 403/404 response.
 */
export async function assertStoryboardAccess(
  db: PrismaClient,
  storyboardId: string,
  session: Session,
): Promise<NextResponse | null> {
  const row = await db.storyboard.findUnique({
    where: { id: storyboardId },
    select: { user_id: true },
  });
  if (!row) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }
  if (row.user_id === session.uid || session.role === 'ADMIN') return null;
  if (row.user_id === null) {
    await db.storyboard.update({ where: { id: storyboardId }, data: { user_id: session.uid } });
    return null;
  }
  return NextResponse.json({ error: 'You do not have access to this storyboard' }, { status: 403 });
}
