import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getDb } from '@/src/lib/db';
import { parseStoryboard } from '@/src/pipeline/02-parse';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  if (!storyboard.source_markdown) {
    return NextResponse.json(
      { error: 'Storyboard has no markdown to parse yet', code: 'NO_MARKDOWN' },
      { status: 422 },
    );
  }

  const result = await parseStoryboard(storyboard.source_markdown, { verbose: true });

  if (!result.success || !result.storyboard) {
    return NextResponse.json(
      { error: 'Parse failed', details: result.errors, warnings: result.warnings },
      { status: 422 },
    );
  }

  await getDb().storyboard.update({
    where: { id },
    data: {
      parsed_json: result.storyboard,
      title: result.storyboard.title,
      status: 'PARSED',
    },
  });

  return NextResponse.json({
    id,
    storyboard: result.storyboard,
    warnings: result.warnings,
    usage: result.usage,
  });
}
