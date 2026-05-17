import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ReferenceStills } from '@/src/lib/reference-stills';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const storyboard = await getDb().storyboard.findUnique({
    where: { id },
    select: { id: true, reference_stills: true },
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
    `${id}/refs/${entityId}/upload.${ext}`,
    file,
    { access: 'public', contentType: file.type },
  );

  // Merge into reference_stills: add the uploaded URL as a candidate and set it as selected
  const existing = (storyboard.reference_stills ?? {}) as unknown as ReferenceStills;
  const entityState = existing[entityId] ?? { status: 'done', candidates: [], selected: null };
  const updatedCandidates = [blob.url, ...entityState.candidates.filter((u) => u !== blob.url)];
  const updated: ReferenceStills = {
    ...existing,
    [entityId]: { status: 'done', candidates: updatedCandidates, selected: blob.url },
  };

  await getDb().storyboard.update({
    where: { id },
    data: { reference_stills: updated as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ url: blob.url, candidates: updatedCandidates });
}
