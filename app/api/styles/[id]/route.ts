import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession } from '@/src/lib/auth';
import { MAX_STYLE_IMAGES } from '@/src/lib/styles';
import { summariseStyle } from '@/src/lib/style-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Owner check — styles are private to the account that made them. */
async function ownedStyle(userId: string, styleId: string) {
  return getDb().style.findFirst({
    where: { id: styleId, user_id: userId },
    select: { id: true, name: true, image_urls: true },
  });
}

/** Rename, or add more images (up to the 4-image cap). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const style = await ownedStyle(auth.uid, id);
  if (!style) return NextResponse.json({ error: 'Style not found' }, { status: 404 });

  const db = getDb();
  const contentType = request.headers.get('content-type') ?? '';

  // JSON body → rename only.
  if (contentType.includes('application/json')) {
    let body: { name?: unknown };
    try {
      body = (await request.json()) as { name?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 60) {
      return NextResponse.json({ error: 'Name must be 1–60 characters' }, { status: 422 });
    }
    const saved = await db.style.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, image_urls: true, summary: true },
    });
    return NextResponse.json({
      style: { id: saved.id, name: saved.name, imageUrls: saved.image_urls, summary: saved.summary },
    });
  }

  // Multipart → append images.
  const form = await request.formData();
  const files = form.getAll('images').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No images supplied' }, { status: 422 });
  }
  const room = MAX_STYLE_IMAGES - style.image_urls.length;
  if (room <= 0) {
    return NextResponse.json(
      { error: `This style already has ${MAX_STYLE_IMAGES} images — remove one first.` },
      { status: 422 },
    );
  }
  if (files.length > room) {
    return NextResponse.json(
      { error: `Room for ${room} more image${room === 1 ? '' : 's'} in this style.` },
      { status: 422 },
    );
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'All files must be images' }, { status: 422 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Each image must be under 20MB' }, { status: 422 });
    }
  }

  // Unique per upload rather than indexed by position: an index-based name
  // collides with an existing blob once an image has been removed, and
  // allowOverwrite would then replace a kept image.
  const stamp = Date.now();
  const urls = await Promise.all(files.map(async (file, i) => {
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const blob = await put(`styles/${auth.uid}/${id}/${stamp}-${i}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
      allowOverwrite: true,
    });
    return blob.url;
  }));

  // `push` appends in the database rather than read-modify-write. Uploads take
  // seconds, so two adds in quick succession both read the pre-upload list and
  // the second write erased the first — which is why adding an image looked
  // like it wiped the style.
  const saved = await db.style.update({
    where: { id },
    data: { image_urls: { push: urls } },
    select: { id: true, name: true, image_urls: true },
  });

  // The look may have shifted — re-read it. Best-effort.
  const summary = await summariseStyle(saved.name, saved.image_urls);
  if (summary) await db.style.update({ where: { id }, data: { summary } });

  return NextResponse.json({
    style: { id: saved.id, name: saved.name, imageUrls: saved.image_urls, summary },
  });
}

/** Delete the whole style, or one image from it via ?imageUrl=. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const style = await ownedStyle(auth.uid, id);
  if (!style) return NextResponse.json({ error: 'Style not found' }, { status: 404 });

  const db = getDb();
  const imageUrl = request.nextUrl.searchParams.get('imageUrl');

  if (imageUrl) {
    const remaining = style.image_urls.filter((u) => u !== imageUrl);
    if (remaining.length === style.image_urls.length) {
      return NextResponse.json({ error: 'That image is not part of this style' }, { status: 404 });
    }
    const saved = await db.style.update({
      where: { id },
      data: { image_urls: remaining },
      select: { id: true, name: true, image_urls: true },
    });
    const summary = await summariseStyle(saved.name, saved.image_urls);
    await db.style.update({ where: { id }, data: { summary } });
    return NextResponse.json({
      style: { id: saved.id, name: saved.name, imageUrls: saved.image_urls, summary },
    });
  }

  // Boards referencing this style fall back to their house style — the
  // relation is SetNull, so nothing is orphaned.
  await db.style.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
