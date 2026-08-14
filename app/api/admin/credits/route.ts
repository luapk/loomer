import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/src/lib/auth';
import { getDb } from '@/src/lib/db';
import { getBalance, grant } from '@/src/lib/credits';

export const dynamic = 'force-dynamic';

/** Every user with their balance — the admin view of who is spending what. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const db = getDb();
  const users = await db.user.findMany({
    orderBy: { created_at: 'desc' },
    select: { id: true, email: true, role: true, created_at: true },
  });

  // Sum per user in one grouped query rather than N balance lookups.
  const sums = await db.creditLedger.groupBy({
    by: ['user_id'],
    _sum: { delta: true },
  });
  const balances = new Map(sums.map((s) => [s.user_id, s._sum.delta ?? 0]));
  const spends = await db.creditLedger.groupBy({
    by: ['user_id'],
    where: { reason: 'debit' },
    _sum: { delta: true },
  });
  const spent = new Map(spends.map((s) => [s.user_id, Math.abs(s._sum.delta ?? 0)]));

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      balance: balances.get(u.id) ?? 0,
      spent: spent.get(u.id) ?? 0,
    })),
  });
}

const GrantSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(1).max(100000),
  note: z.string().max(200).optional(),
});

/** Manually add credits to an account. Stands in for checkout until payments land. */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = GrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 422 });
  }

  const db = getDb();
  const user = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await grant(db, user.id, parsed.data.amount, 'grant', {
    note: parsed.data.note ?? `Granted by ${auth.email}`,
  });

  return NextResponse.json({ ok: true, balance: await getBalance(db, user.id) });
}
