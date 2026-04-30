import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
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

/** Load the storyboard skill from disk as a system prompt string. */
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

  // Append any reference files found in skills/storyboard/references/
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

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { script } = parsed.data;

  let systemPrompt: string;
  try {
    systemPrompt = await loadSkill();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, code: 'SKILL_NOT_FOUND' }, { status: 503 });
  }

  const client = getAnthropicClient();

  // Create a placeholder record so we have an ID to return immediately.
  // The markdown will be written once generation completes.
  const storyboard = await getDb().storyboard.create({
    data: {
      title: 'Untitled',
      source_input: script,
      source_markdown: '',
      status: 'DRAFT',
    },
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: script }],
    });

    const markdownBlock = response.content.find((b) => b.type === 'text');
    if (!markdownBlock || markdownBlock.type !== 'text') {
      await getDb().storyboard.update({
        where: { id: storyboard.id },
        data: { status: 'FAILED' },
      });
      return NextResponse.json(
        { error: 'Claude returned no text content', code: 'EMPTY_RESPONSE' },
        { status: 502 },
      );
    }

    const markdown = markdownBlock.text;

    // Extract title from first H1 line if present
    const titleMatch = /^#\s+(.+)$/m.exec(markdown);
    const title = titleMatch?.[1]?.trim() ?? 'Untitled';

    // Detect if the skill triggered (storyboards have a Continuity Bible section)
    const skillTriggered =
      markdown.includes('## Continuity Bible') || markdown.includes('### Shot 01');
    if (!skillTriggered) {
      await getDb().storyboard.update({
        where: { id: storyboard.id },
        data: { source_markdown: markdown, status: 'FAILED' },
      });
      return NextResponse.json(
        {
          error:
            'The storyboard skill did not trigger. Try rephrasing your prompt and including the word "storyboard".',
          code: 'SKILL_NOT_TRIGGERED',
          markdown,
        },
        { status: 422 },
      );
    }

    await getDb().storyboard.update({
      where: { id: storyboard.id },
      data: { title, source_markdown: markdown, status: 'DRAFT' },
    });

    return NextResponse.json({ id: storyboard.id, title, markdown });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await getDb().storyboard.update({
      where: { id: storyboard.id },
      data: { status: 'FAILED' },
    }).catch(() => undefined);
    return NextResponse.json(
      { error: `Generation failed: ${message}`, code: 'GENERATION_ERROR' },
      { status: 502 },
    );
  }
}
