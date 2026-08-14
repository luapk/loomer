import { NextResponse } from 'next/server';
import { requireSession } from '@/src/lib/auth';
import { getDb } from '@/src/lib/db';
import { getBalance, isExempt } from '@/src/lib/credits';

export const dynamic = 'force-dynamic';

/** Current balance plus recent ledger history for the signed-in user. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  const [balance, entries] = await Promise.all([
    getBalance(db, auth.uid),
    db.creditLedger.findMany({
      where: { user_id: auth.uid },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true, delta: true, reason: true, note: true,
        storyboard_id: true, created_at: true,
      },
    }),
  ]);

  return NextResponse.json({ balance, exempt: isExempt(auth), entries });
}
