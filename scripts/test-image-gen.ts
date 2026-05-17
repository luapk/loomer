/**
 * Quick smoke-test for Gemini image generation.
 * Usage:
 *   GOOGLE_AI_API_KEY=... npx tsx scripts/test-image-gen.ts
 *   GOOGLE_AI_API_KEY=... npx tsx scripts/test-image-gen.ts gemini-2.0-flash-exp
 *
 * Writes output to /tmp/test-image-gen-0.png (and -1.png, -2.png, -3.png).
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load .env so GOOGLE_AI_API_KEY doesn't need to be passed on the command line.
config({ path: new URL('../.env', import.meta.url).pathname });

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_AI_API_KEY not set');
  process.exit(1);
}

const model = process.argv[2] ?? 'nano-banana-pro-preview';
const PROMPT =
  'A young woman with short dark hair, plain white t-shirt, neutral expression, ' +
  'standing in a relaxed posture. Flat studio lighting, plain white background, ' +
  'front-three-quarter angle, full body visible. Clean character reference still.';

const ai = new GoogleGenAI({ apiKey });

async function generateWithRetry(i: number): Promise<string | null> {
  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: PROMPT,
        config: { responseModalities: [Modality.IMAGE] },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const buf = Buffer.from(part.inlineData.data, 'base64');
          const ext = part.inlineData.mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const path = `/tmp/test-image-gen-${i}.${ext}`;
          writeFileSync(path, buf);
          const retryNote = attempt > 0 ? ` (attempt ${attempt + 1})` : '';
          console.log(`  [${i}] ✓  ${buf.length} bytes → ${path}  (${Date.now() - t0}ms)${retryNote}`);
          return path;
        }
      }
      const textParts = parts.filter((p) => p.text).map((p) => p.text).join(' ');
      console.log(`  [${i}] ✗  No image in response. Text: ${textParts.slice(0, 200) || '(empty)'}`);
      return null;
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('"code":429');
      if (is429 && attempt < delays.length) {
        console.log(`  [${i}] 429 rate limit — retrying in ${delays[attempt]! / 1000}s…`);
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      throw err;
    }
  }
  return null;
}

console.log(`Model : ${model}`);
console.log(`Prompt: ${PROMPT.slice(0, 80)}…`);
console.log('Generating 4 candidates in parallel…\n');

const results = await Promise.allSettled(
  Array.from({ length: 4 }, (_, i) => generateWithRetry(i)),
);

const ok = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
const fail = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null)).length;

console.log(`\n${ok}/4 images generated, ${fail} failed`);
if (fail > 0) {
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.log(`  [${i}] error: ${r.reason}`);
    }
  });
}
