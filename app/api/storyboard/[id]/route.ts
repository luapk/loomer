import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { getReferenceStills, getShotFrames } from '@/src/lib/frame-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  // Project out source_input — the raw uploaded script is never read by the
  // client and can be large; everything else is needed for session restore.
  // The legacy Json columns are also omitted: the normalized rows are the
  // source of truth and are assembled into the same response keys below.
  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    omit: { source_input: true, reference_stills: true, shot_key_frames: true },
  });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  const [refStills, shotFrames, voiceOvers] = await Promise.all([
    getReferenceStills(db, id),
    getShotFrames(db, id),
    db.shotVoiceOver.findMany({
      where: { storyboard_id: id },
      orderBy: { shot_number: 'asc' },
      select: { shot_number: true, voice: true, text: true, url: true, duration_ms: true },
    }),
  ]);

  return NextResponse.json({
    ...storyboard,
    reference_stills: Object.keys(refStills).length > 0 ? refStills : null,
    shot_key_frames: Object.keys(shotFrames).length > 0 ? shotFrames : null,
    voice_overs: voiceOvers,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  let body: { title?: string };
  try {
    body = (await request.json()) as { title?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const storyboard = await getDb().storyboard.findUnique({ where: { id }, select: { id: true } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  await getDb().storyboard.update({ where: { id }, data: { title } });
  return NextResponse.json({ ok: true, title });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const storyboard = await getDb().storyboard.findUnique({ where: { id }, select: { id: true } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  await getDb().storyboard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
