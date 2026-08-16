import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { debit, refund, PARSE_CREDIT_COST, InsufficientCreditsError, insufficientPayload } from '@/src/lib/credits';
import { parseStoryboard } from '@/src/pipeline/02-parse';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const storyboard = await getDb().storyboard.findUnique({
    where: { id },
    select: { id: true, source_markdown: true },
  });
  if (!storyboard) {
    return NextResponse.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  if (!storyboard.source_markdown) {
    return NextResponse.json(
      { error: 'Storyboard has no markdown to parse yet', code: 'NO_MARKDOWN' },
      { status: 422 },
    );
  }

  let chargedCredits = 0;
  try {
    chargedCredits = await debit(getDb(), auth, PARSE_CREDIT_COST, {
      storyboardId: id,
      note: 'Script parse',
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(insufficientPayload(err), { status: 402 });
    }
    throw err;
  }

  const markdown = storyboard.source_markdown;
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      // Swallow enqueue errors — client may have disconnected but parsing should
      // complete and save to DB regardless, so reopening shows the result.
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
      };

      // SSE comment sent every 10s — keeps the connection alive during gaps
      // between inputJson events so Vercel doesn't drop the idle stream.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        const result = await parseStoryboard(markdown, {
          verbose: true,
          onProgress: (chars) => send({ type: 'progress', chars }),
          // Real denominators, so the client can show "4 of 7 done" rather
          // than a bar animated against nothing.
          onPlan: (plan) => send({ type: 'plan', shots: plan.shots, jobs: plan.jobs }),
          onJobDone: (done, total) => send({ type: 'job_done', done, total }),
        });

        if (!result.success || !result.storyboard) {
          if (chargedCredits > 0) {
            await refund(getDb(), auth, chargedCredits, { storyboardId: id, note: 'Parse failed' })
              .catch(() => { /* best effort */ });
          }
          send({
            type: 'error',
            message: 'Parse failed',
            details: result.errors,
            warnings: result.warnings,
          });
        } else {
          // Detect brand/client name via a fast Haiku call — stored alongside the
          // parsed storyboard so the UI can display it above the title.
          // Hard 3s bound: this is cosmetic and must never sit on the critical
          // path between parse completion and the done event.
          let brand: string | undefined;
          try {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            if (anthropicKey) {
              const anthropic = new Anthropic({ apiKey: anthropicKey });
              const detect = anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 20,
                messages: [{
                  role: 'user',
                  content: `Does this storyboard title contain a recognisable brand or client name? Title: "${result.storyboard.title}". Reply with just the brand name (e.g. "Nike" or "Temptations") or the single word "null".`,
                }],
              });
              const msg = await Promise.race([
                detect,
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
              ]);
              const text = msg?.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
              if (text && text.toLowerCase() !== 'null' && text.length <= 40) brand = text;
            }
          } catch { /* brand detection is best-effort */ }

          const storyboardFinal = brand ? { ...result.storyboard, brand } : result.storyboard;

          await getDb().storyboard.update({
            where: { id },
            data: {
              parsed_json: storyboardFinal,
              title: result.storyboard.title,
              status: 'PARSED',
              shot_count: result.storyboard.shots.length,
            },
          });
          send({
            type: 'done',
            id,
            storyboard: storyboardFinal,
            warnings: result.warnings,
            usage: result.usage,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (chargedCredits > 0) {
          await refund(getDb(), auth, chargedCredits, { storyboardId: id, note: 'Parse failed' })
            .catch(() => { /* best effort */ });
        }
        send({ type: 'error', message: `Parse failed: ${message}` });
      } finally {
        clearInterval(heartbeat);
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
