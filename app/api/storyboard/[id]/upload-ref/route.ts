import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { getReferenceStills, upsertReferenceStill } from '@/src/lib/frame-store';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  const form = await request.formData();
  const entityId = form.get('entityId');
  const file = form.get('file');

  if (typeof entityId !== 'string' || !entityId) {
    return NextResponse.json({ error: 'entityId required' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 });
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
  const blob = await put(
    `${id}/refs/${entityId}/upload-${Date.now()}.${ext}`,
    file,
    { access: 'public', contentType: file.type },
  );

  // Add the uploaded URL as the leading candidate and select it — one row.
  const refStills = await getReferenceStills(db, id);
  const entityState = refStills[entityId] ?? { status: 'done' as const, candidates: [], selected: null };
  const updatedCandidates = [blob.url, ...entityState.candidates.filter((u) => u !== blob.url)];
  await upsertReferenceStill(db, id, entityId, {
    ...entityState,
    status: 'done',
    candidates: updatedCandidates,
    selected: blob.url,
  });

  return NextResponse.json({ url: blob.url, candidates: updatedCandidates });
}
