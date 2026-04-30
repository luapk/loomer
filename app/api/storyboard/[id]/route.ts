import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getDb } from '@/src/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  return NextResponse.json(storyboard);
}
