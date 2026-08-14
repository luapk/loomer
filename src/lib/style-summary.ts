/**
 * Writes a one-or-two sentence description of a saved style from its images.
 *
 * Two jobs. For the director it's a legibility check — if the summary reads
 * wrong, the machine has misread the look and the images need changing. For
 * generation it's the load-bearing carrier of the style: a shot render can
 * only afford one or two style images before they crowd out the identity
 * references, so the words have to do the rest.
 */

import { getAnthropicClient } from '@/src/lib/anthropic';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You describe visual styles for a storyboard tool.

Given reference images that share a look, write ONE OR TWO SENTENCES naming the
concrete, reproducible visual qualities an image model needs to match it:
rendering medium and technique, palette, lighting quality and direction,
contrast, texture and grain, level of detail, and edge quality.

Rules:
- Describe the STYLE, never the subjects. Do not mention specific characters,
  objects, places or story content — those change shot to shot.
- Be concrete and visual. "Muted desaturated earth tones, hard low-key side
  light, visible paper tooth" — not "moody and atmospheric".
- Name the medium plainly (gouache concept painting, 35mm photograph, matte
  painting, ink and wash) when it is identifiable.
- No preamble, no quotes, no lists. Just the sentences.`;

/** Fetch an image and return it as an inline base64 block, or null on failure. */
async function fetchAsInline(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = contentType.split(';')[0]?.trim() ?? 'image/jpeg';
    // Anthropic accepts these four image types only.
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) return null;
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: Buffer.from(await res.arrayBuffer()).toString('base64'),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Returns the summary, or null if it couldn't be produced. Never throws — a
 * missing summary degrades the style prompt, it doesn't break saving a style.
 */
export async function summariseStyle(
  name: string,
  imageUrls: string[],
): Promise<string | null> {
  if (imageUrls.length === 0) return null;

  let client;
  try {
    client = getAnthropicClient();
  } catch {
    return null; // No API key configured — skip silently.
  }

  // Four images is plenty to read a look, and keeps the call quick.
  const blocks = (await Promise.all(imageUrls.slice(0, 4).map(fetchAsInline)))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  if (blocks.length === 0) return null;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          ...blocks,
          {
            type: 'text',
            text: `These images define a style the director has named "${name}". Describe the style.`,
          },
        ],
      }],
    });
    const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
    return text.length > 0 ? text.slice(0, 800) : null;
  } catch {
    return null;
  }
}
