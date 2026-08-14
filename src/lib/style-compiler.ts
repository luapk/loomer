/**
 * Compiles a saved style's reference images into a structured StyleSpec.
 *
 * This runs once, when the style is authored — not per render. Everything
 * downstream reads the stored spec, so a board generated today and the same
 * board regenerated next month receive the identical style instruction.
 *
 * Replaces the free-prose summariser. Same call shape as the parser: a forced
 * tool call against a Zod-derived schema, so the output is validated rather
 * than hoped for.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getAnthropicClient } from '@/src/lib/anthropic';
import {
  StyleSpecFieldsSchema,
  StyleSpecSchema,
  STYLE_SPEC_VERSION,
  type StyleSpec,
} from '@/src/schema/style-spec';

const MODEL = 'claude-sonnet-4-6';
const TOOL_NAME = 'record_style_spec';

/** Anthropic accepts these four image types only. */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const SYSTEM = `You specify visual styles for a storyboard tool.

You are shown reference images that share a look. Break that look into its
reproducible parts and record them with the ${TOOL_NAME} tool.

Rules:
- Describe the STYLE, never the subjects. Do not mention specific characters,
  objects, places or story content — those change shot to shot. A field that
  names what is *in* an image is wrong.
- Be concrete and visual. "Muted desaturated earth tones, hard low-key side
  light, visible paper tooth" — not "moody and atmospheric". Give hex values in
  the palette field where a colour can be pinned.
- Name the medium plainly (gouache concept painting, 35mm photograph, matte
  painting, ink and wash) when it is identifiable.
- Set photographic to true only when the look sits in photographic space —
  a photograph or a render aiming at one. Painting, illustration, print and
  drawing are all false.
- avoid: the traps specific to THIS look — what an image model reaching for a
  generic version of this medium would get wrong. Include a note on how anatomy
  and faces should be proportioned in this style, whether that means
  naturalistic or deliberately stylised. Do not write generic quality
  complaints.
- reading: one sentence, written to the director, naming the look as they would
  recognise it. This is how they check the style was read correctly.

Every field must be filled from what you can actually see in the images.`;

/** Fetch an image and return it as an inline base64 block, or null on failure. */
async function fetchAsInline(url: string): Promise<Anthropic.ImageBlockParam | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = contentType.split(';')[0]?.trim() ?? 'image/jpeg';
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mediaType)) return null;
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType as AllowedImageType,
        data: Buffer.from(await res.arrayBuffer()).toString('base64'),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Returns the compiled spec, or null if it couldn't be produced.
 *
 * Never throws. A style that fails to compile falls back to whatever the board
 * had before — a degraded look, not a lost board.
 */
export async function compileStyleSpec(
  name: string,
  imageUrls: string[],
): Promise<StyleSpec | null> {
  if (imageUrls.length === 0) return null;

  let client;
  try {
    client = getAnthropicClient();
  } catch {
    return null; // No API key configured — skip silently.
  }

  // Four images is plenty to read a look, and keeps the call quick.
  const blocks = (await Promise.all(imageUrls.slice(0, 4).map(fetchAsInline)))
    .filter((b): b is Anthropic.ImageBlockParam => b !== null);
  if (blocks.length === 0) return null;

  const inputSchema = zodToJsonSchema(StyleSpecFieldsSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      tools: [{
        name: TOOL_NAME,
        description: 'Record the reproducible visual specification of the style shown.',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON schema shape varies by zod-to-json-schema version
        input_schema: inputSchema as any,
      }],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{
        role: 'user',
        content: [
          ...blocks,
          {
            type: 'text',
            text: `These images define a style the director has named "${name}". Specify it.`,
          },
        ],
      }],
    });

    const toolUse = message.content.find(
      (block) => block.type === 'tool_use' && block.name === TOOL_NAME,
    );
    if (!toolUse || toolUse.type !== 'tool_use') return null;

    const parsed = StyleSpecSchema.safeParse({
      ...(toolUse.input as Record<string, unknown>),
      version: STYLE_SPEC_VERSION,
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
