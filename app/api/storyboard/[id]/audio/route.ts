import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac',
]);

/** Upload a music track for the animatic / mood film. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    select: { id: true, audio_url: true },
  });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio file too large (max 25 MB)' }, { status: 413 });
  }
  const mimeType = file.type.split(';')[0]?.trim() ?? '';
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `Unsupported audio type: ${mimeType || 'unknown'}` }, { status: 415 });
  }

  const ext = mimeType.includes('wav') ? 'wav'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('aac') || mimeType.includes('mp4') ? 'm4a'
    : mimeType.includes('flac') ? 'flac'
    : mimeType.includes('webm') ? 'webm'
    : 'mp3';

  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(`${id}/audio/track-${Date.now()}.${ext}`, buffer, {
    access: 'public',
    contentType: mimeType,
  });

  // Replace: delete the previous track blob (best-effort).
  if (storyboard.audio_url) {
    try { await del(storyboard.audio_url); } catch { /* best-effort */ }
  }

  await db.storyboard.update({
    where: { id },
    data: { audio_url: blob.url, audio_trim_start: 0 },
  });

  return NextResponse.json({ url: blob.url });
}

/** Persist the trim-in point (seconds into the track where playback starts). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  let body: { trimStart?: unknown };
  try {
    body = (await request.json()) as { trimStart?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const trimStart = typeof body.trimStart === 'number' && isFinite(body.trimStart)
    ? Math.max(0, body.trimStart)
    : null;
  if (trimStart === null) {
    return NextResponse.json({ error: 'trimStart must be a non-negative number' }, { status: 400 });
  }

  try {
    await getDb().storyboard.update({ where: { id }, data: { audio_trim_start: trimStart } });
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

/** Remove the music track. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    select: { audio_url: true },
  });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  if (storyboard.audio_url) {
    try { await del(storyboard.audio_url); } catch { /* best-effort */ }
  }
  await db.storyboard.update({
    where: { id },
    data: { audio_url: null, audio_trim_start: 0 },
  });
  return NextResponse.json({ ok: true });
}
