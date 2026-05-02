import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { getDb } from '@/src/lib/db';
import { getAnthropicClient } from '@/src/lib/anthropic';
import { z } from 'zod';

const RequestSchema = z.object({
  script: z.string().min(1, 'Script cannot be empty'),
});

const SKILL_DIR = join(process.cwd(), 'skills', 'storyboard');
const MODEL = 'claude-sonnet-4-6';

async function loadSkill(): Promise<string> {
  let skillMd: string;
  try {
    skillMd = await readFile(join(SKILL_DIR, 'SKILL.md'), 'utf-8');
  } catch {
    throw new Error(
      'Storyboard skill not found at skills/storyboard/SKILL.md. ' +
        'Add the skill files to the skills/ directory before generating storyboards.',
    );
  }

  const parts = [skillMd];
  try {
    const refs = await readdir(join(SKILL_DIR, 'references'));
    for (const file of refs.filter((f) => f.endsWith('.md'))) {
      const content = await readFile(join(SKILL_DIR, 'references', file), 'utf-8');
      parts.push(`\n\n---\n\n## Reference: ${file}\n\n${content}`);
    }
  } catch {
    // references/ directory is optional
  }

  return parts.join('');
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('Invalid request', 400, { details: parsed.error.flatten() });
  }

  const { script } = parsed.data;

  let systemPrompt: string;
  try {
    systemPrompt = await loadSkill();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 503, { code: 'SKILL_NOT_FOUND' });
  }

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 503, { code: 'MISSING_API_KEY' });
  }

  const storyboard = await getDb().storyboard.create({
    data: { title: 'Untitled', source_input: script, source_markdown: '', status: 'DRAFT' },
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 10000);

      try {
        // Use the prompt-caching beta so the 105KB skill system prompt is cached
        // server-side. Cache TTL is 5 minutes — subsequent requests skip re-encoding
        // that prompt, cutting ~30% off time-to-first-token.
        const messageStream = client.beta.promptCaching.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: script }],
        });

        let fullText = '';
        messageStream.on('text', (textDelta) => {
          fullText += textDelta;
          send({ type: 'chunk', text: textDelta });
        });

        await messageStream.finalMessage();
        const markdown = fullText;

        const titleMatch = /^#\s+(.+)$/m.exec(markdown);
        const title = titleMatch?.[1]?.trim() ?? 'Untitled';
        const skillTriggered =
          markdown.includes('## Continuity Bible') || markdown.includes('### Shot 01');

        if (!skillTriggered) {
          await getDb().storyboard.update({
            where: { id: storyboard.id },
            data: { source_markdown: markdown, status: 'FAILED' },
          });
          send({
            type: 'error',
            message:
              'The storyboard skill did not trigger. Try rephrasing your prompt and including the word "storyboard".',
            code: 'SKILL_NOT_TRIGGERED',
          });
        } else {
          await getDb().storyboard.update({
            where: { id: storyboard.id },
            data: { title, source_markdown: markdown, status: 'DRAFT' },
          });
          send({ type: 'done', id: storyboard.id, title, markdown });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await getDb()
          .storyboard.update({ where: { id: storyboard.id }, data: { status: 'FAILED' } })
          .catch(() => undefined);
        send({ type: 'error', message: `Generation failed: ${message}`, code: 'GENERATION_ERROR' });
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
