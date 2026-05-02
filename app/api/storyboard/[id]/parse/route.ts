import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const markdown = storyboard.source_markdown;
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const result = await parseStoryboard(markdown, {
          verbose: true,
          onProgress: (chars) => send({ type: 'progress', chars }),
        });

        if (!result.success || !result.storyboard) {
          send({
            type: 'error',
            message: 'Parse failed',
            details: result.errors,
            warnings: result.warnings,
          });
        } else {
          await getDb().storyboard.update({
            where: { id },
            data: {
              parsed_json: result.storyboard,
              title: result.storyboard.title,
              status: 'PARSED',
            },
          });
          send({
            type: 'done',
            id,
            storyboard: result.storyboard,
            warnings: result.warnings,
            usage: result.usage,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message: `Parse failed: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
