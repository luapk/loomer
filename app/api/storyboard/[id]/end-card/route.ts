import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * The board's closing frame.
 *
 * Two shapes of request, both multipart:
 *  - `image` + `kind=source`     — the uploaded card, or the logo PNG.
 *  - `image` + `kind=composited` — the browser's flattened render.
 *
 * Settings (mode, endline, placement) ride along as form fields on either.
 * Storing both the layers and the flat render keeps the card editable while
 * letting PDF/ZIP/animatic read one URL and know nothing about layers.
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

  const form = await request.formData();
  const kind = String(form.get('kind') ?? 'source');
  const file = form.get('image');

  const data: Record<string, unknown> = {};

  const mode = form.get('mode');
  if (typeof mode === 'string') {
    if (mode !== 'upload' && mode !== 'overlay') {
      return NextResponse.json({ error: 'mode must be "upload" or "overlay"' }, { status: 422 });
    }
    data['mode'] = mode;
  }

  const endline = form.get('endline');
  if (typeof endline === 'string') {
    data['endline'] = endline.trim().slice(0, 200) || null;
  }

  const background = form.get('background');
  if (typeof background === 'string' && background.length > 0) {
    // "last_frame" or a hex colour — anything else is a client bug.
    if (background !== 'last_frame' && !/^#[0-9a-f]{3,8}$/i.test(background)) {
      return NextResponse.json({ error: 'background must be "last_frame" or a hex colour' }, { status: 422 });
    }
    data['background'] = background;
  }

  for (const [field, column] of [['logoScale', 'logo_scale'], ['logoX', 'logo_x'], ['logoY', 'logo_y']] as const) {
    const raw = form.get(field);
    if (typeof raw === 'string' && raw.length > 0) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        return NextResponse.json({ error: `${field} must be between 0 and 2` }, { status: 422 });
      }
      data[column] = value;
    }
  }

  if (file instanceof File) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 422 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be under 20MB' }, { status: 422 });
    }
    // PNG preserves the logo's transparency; the flattened render is PNG too.
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const blob = await put(`${id}/end-card/${kind}-${Date.now()}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
    });
    data[kind === 'composited' ? 'composited_url' : 'image_url'] = blob.url;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 422 });
  }

  const db = getDb();
  const saved = await db.endCard.upsert({
    where: { storyboard_id: id },
    create: { storyboard_id: id, ...data },
    update: data,
  });

  return NextResponse.json({ endCard: saved });
}

/** Remove the end card entirely. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;

  await getDb().endCard.deleteMany({ where: { storyboard_id: id } });
  return NextResponse.json({ ok: true });
}
