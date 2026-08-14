import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { debit, refund, VO_CREDIT_COST, InsufficientCreditsError, insufficientPayload } from '@/src/lib/credits';
import { synthesize, isVoiceSlot, DEFAULT_VOICE_SLOT, VoiceOverError } from '@/src/lib/elevenlabs';
import { voiceOverLines } from '@/src/lib/voice-over';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

/**
 * Renders voice-over audio for the board's spoken lines.
 *
 * Body: `{ voice, shotNumber? }`. With `shotNumber` only that line is cut;
 * without it every line missing audio (or recorded in a different voice) is
 * rendered. Lines whose text and voice already match are skipped, so re-running
 * after adding one shot costs one line, not the whole board.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  let body: { voice?: unknown; shotNumber?: unknown; force?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const voice = typeof body.voice === 'string' && isVoiceSlot(body.voice)
    ? body.voice
    : DEFAULT_VOICE_SLOT;
  const onlyShot = typeof body.shotNumber === 'number' ? body.shotNumber : null;
  const force = body.force === true;

  const db = getDb();
  const storyboard = await db.storyboard.findUnique({
    where: { id },
    select: { parsed_json: true },
  });
  if (!storyboard?.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not yet parsed' }, { status: 422 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const allLines = voiceOverLines(parsed.shots);
  const wanted = onlyShot === null
    ? allLines
    : allLines.filter((l) => l.shotNumber === onlyShot);

  if (wanted.length === 0) {
    return NextResponse.json({
      error: onlyShot === null
        ? 'No voice-over or dialogue lines in this storyboard.'
        : `Shot ${onlyShot} has no spoken line.`,
      code: 'NO_LINES',
    }, { status: 422 });
  }

  // Skip lines already cut with the same voice and identical text.
  const existing = await db.shotVoiceOver.findMany({
    where: { storyboard_id: id },
    select: { shot_number: true, voice: true, text: true },
  });
  const existingByShot = new Map(existing.map((e) => [e.shot_number, e]));
  const toRender = force
    ? wanted
    : wanted.filter((l) => {
        const prev = existingByShot.get(l.shotNumber);
        return !prev || prev.voice !== voice || prev.text !== l.text;
      });

  if (toRender.length === 0) {
    return NextResponse.json({ ok: true, rendered: 0, skipped: wanted.length });
  }

  let chargedCredits = 0;
  try {
    chargedCredits = await debit(db, auth, VO_CREDIT_COST * toRender.length, {
      storyboardId: id,
      note: `Voice-over — ${toRender.length} line${toRender.length === 1 ? '' : 's'}`,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(insufficientPayload(err), { status: 402 });
    }
    throw err;
  }

  // Sequential: ElevenLabs rate-limits concurrent synthesis on lower plans,
  // and a board's worth of lines is short work.
  const results: { shotNumber: number; url: string }[] = [];
  const failures: { shotNumber: number; message: string }[] = [];
  for (const line of toRender) {
    try {
      const { audio, contentType } = await synthesize(line.text, voice);
      const blob = await put(
        `${id}/vo/${line.shotNumber}-${voice}-${Date.now()}.mp3`,
        audio,
        { access: 'public', contentType },
      );
      await db.shotVoiceOver.upsert({
        where: { storyboard_id_shot_number: { storyboard_id: id, shot_number: line.shotNumber } },
        create: {
          storyboard_id: id, shot_number: line.shotNumber,
          voice, text: line.text, url: blob.url,
        },
        update: { voice, text: line.text, url: blob.url },
      });
      results.push({ shotNumber: line.shotNumber, url: blob.url });
    } catch (err) {
      const message = err instanceof VoiceOverError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      failures.push({ shotNumber: line.shotNumber, message });
    }
  }

  if (chargedCredits > 0 && failures.length > 0) {
    await refund(db, auth, VO_CREDIT_COST * failures.length, {
      storyboardId: id,
      note: `${failures.length} voice-over line${failures.length === 1 ? '' : 's'} failed`,
    }).catch(() => { /* best effort */ });
  }

  // Remember the board's voice so the picker and later runs stay consistent.
  await db.storyboard.update({ where: { id }, data: { vo_voice: voice } });

  return NextResponse.json({
    ok: failures.length === 0,
    rendered: results.length,
    skipped: wanted.length - toRender.length,
    results,
    failures,
  });
}

/** Delete one shot's audio (`?shotNumber=`), or all of it. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  const shotParam = request.nextUrl.searchParams.get('shotNumber');
  const db = getDb();

  if (shotParam) {
    const shotNumber = Number(shotParam);
    if (!Number.isInteger(shotNumber)) {
      return NextResponse.json({ error: 'shotNumber must be an integer' }, { status: 422 });
    }
    await db.shotVoiceOver.deleteMany({ where: { storyboard_id: id, shot_number: shotNumber } });
  } else {
    await db.shotVoiceOver.deleteMany({ where: { storyboard_id: id } });
  }

  return NextResponse.json({ ok: true });
}
