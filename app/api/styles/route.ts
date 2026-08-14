import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/src/lib/db';
import { requireSession } from '@/src/lib/auth';
import { listStyles, MAX_STYLE_IMAGES, MAX_STYLES_PER_USER } from '@/src/lib/styles';
import { summariseStyle } from '@/src/lib/style-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** The signed-in user's saved styles. */
export async function GET() {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    styles: await listStyles(getDb(), auth.uid),
    maxStyles: MAX_STYLES_PER_USER,
    maxImages: MAX_STYLE_IMAGES,
  });
}

/**
 * Create a named style from up to 4 uploaded images.
 * Multipart: `name` plus one or more `images` files.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  const existingCount = await db.style.count({ where: { user_id: auth.uid } });
  if (existingCount >= MAX_STYLES_PER_USER) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_STYLES_PER_USER} styles — delete one to add another.` },
      { status: 422 },
    );
  }

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Give the style a name' }, { status: 422 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: 'Style name must be under 60 characters' }, { status: 422 });
  }

  const files = form.getAll('images').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Upload at least one reference image' }, { status: 422 });
  }
  if (files.length > MAX_STYLE_IMAGES) {
    return NextResponse.json(
      { error: `A style holds up to ${MAX_STYLE_IMAGES} images` },
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

  // Create the row first so blobs are namespaced by a real style id.
  const style = await db.style.create({
    data: { user_id: auth.uid, name, image_urls: [] },
    select: { id: true },
  });

  const urls = await Promise.all(files.map(async (file, i) => {
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const blob = await put(`styles/${auth.uid}/${style.id}/${i}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
      allowOverwrite: true,
    });
    return blob.url;
  }));

  const saved = await db.style.update({
    where: { id: style.id },
    data: { image_urls: urls },
    select: { id: true, name: true, image_urls: true },
  });

  // Read the look back to the director so they can see how it was interpreted.
  const summary = await summariseStyle(saved.name, saved.image_urls);
  if (summary) await db.style.update({ where: { id: style.id }, data: { summary } });

  return NextResponse.json({
    style: { id: saved.id, name: saved.name, imageUrls: saved.image_urls, summary },
  });
}
