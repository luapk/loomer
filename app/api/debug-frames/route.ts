import { NextResponse } from 'next/server';
import { requireSession } from '@/src/lib/auth';
import { getDb } from '@/src/lib/db';
import { getShotFrames } from '@/src/lib/frame-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const db = getDb();
  const boards = await db.storyboard.findMany({
    select: { id: true, title: true, status: true },
    orderBy: { created_at: 'desc' },
  });
  const results = await Promise.all(boards.map(async (b) => {
    const frames = await getShotFrames(db, b.id);
    const shots = Object.entries(frames)
      .filter(([, f]) => f.status === 'done' && f.url)
      .sort(([a], [c]) => Number(a) - Number(c))
      .map(([k, f]) => ({ shot: Number(k), url: f.url }));
    return { id: b.id, title: b.title, status: b.status, shots };
  }));
  return NextResponse.json(results);
}
