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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const storyboard = await getDb().storyboard.findUnique({ where: { id }, select: { id: true } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  await getDb().storyboard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
