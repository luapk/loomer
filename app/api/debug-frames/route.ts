import { NextResponse } from 'next/server';
import { getDb } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const boards = await getDb().storyboard.findMany({
    select: { id: true, title: true, status: true, shot_key_frames: true },
    orderBy: { created_at: 'desc' },
  });
  return NextResponse.json(boards.map(b => {
    const frames = b.shot_key_frames as Record<string, { status: string; url: string | null }> | null;
    const shots = frames
      ? Object.entries(frames)
          .filter(([, f]) => f.status === 'done' && f.url)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([k, f]) => ({ shot: Number(k), url: f.url }))
      : [];
    return { id: b.id, title: b.title, status: b.status, shots };
  }));
}
