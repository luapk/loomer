/**
 * Generate reference stills for all Leo Bible entities.
 * Runs all 6 entities in parallel, 1 candidate each (fast pass).
 * Pass --all4 to generate 4 candidates per entity.
 *
 * Usage:
 *   npx tsx scripts/test-leo-refs.ts
 *   npx tsx scripts/test-leo-refs.ts --all4
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: new URL('../.env', import.meta.url).pathname });

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) { console.error('GOOGLE_AI_API_KEY not set'); process.exit(1); }

const model = process.argv[3] ?? process.argv[2] ?? 'nano-banana-pro-preview';
const candidateCount = process.argv.includes('--all4') ? 4 : 1;

const STYLE = 'Cinematic photoreal, British coastal naturalism. Shot by Roger Deakins. Film: Kodak Vision3 500T. Naturalistic warm whites, restrained saturation. Naturalistic, motivated by visible practicals.';

const WATERCOLOUR = 'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, loose gestural marks, flat areas of muted translucent watercolour colour, white paper showing through, minimal detail. Traditional storyboard illustration.';

const entities = [
  {
    id: 'CHAR-LEO',
    name: 'Leo',
    type: 'character',
    aspectRatio: '3:4',
    prompt: `8-year-old boy, pale British complexion, light scattered freckles across nose bridge and upper cheeks, large grey-blue eyes, slight gap between front teeth. Sandy-blond hair, ear-length, naturally tousled. Small for his age, slight build. Round face starting to lose baby fullness, pink-flushed cheeks. Charcoal grey wool duffle coat with three horn toggles fastened, hood down on shoulders. Navy cable-knit fisherman's jumper visible at collar. Indigo selvedge denim jeans slightly rolled at ankles. Scuffed brown leather lace-up boots. Cream-and-navy thin-striped wool scarf wrapped twice around neck. Small adhesive plaster on back of right hand. Standing in a relaxed natural posture, neutral expression. Flat studio lighting, plain neutral background, front-three-quarter angle, full body visible.\n\nStyle: ${STYLE}`,
  },
  {
    id: 'CHAR-DOLPHIN',
    name: 'The Dolphin',
    type: 'character',
    aspectRatio: '16:9',
    prompt: `Adult bottlenose dolphin (Tursiops truncatus), approximately 2.8 metres, healthy adult. Sleek slate-grey dorsal surface, slightly darker along spine, fading to pale silvery-grey flanks and pale cream-grey belly. Bright intelligent dark eyes, slightly amused expression. Small pale crescent-shaped scar on leading edge of dorsal fin. Dolphin breaching cleanly from calm water, full body visible, plain neutral water background, even soft lighting.\n\nStyle: ${STYLE}`,
  },
  {
    id: 'LOC-PIER-COASTAL-AFTERNOON',
    name: 'Coastal Pier — Late Afternoon',
    type: 'location',
    aspectRatio: '16:9',
    prompt: `Wide establishing shot of a weathered British coastal pier, late autumn. Wooden pier extending out into open sea, aged timber decking salt-bleached grey-brown. Iron railings on both sides, rust-pitted with chipped white paint. Pilings descending into surf below, barnacle-encrusted, kelp-trailed at waterline. Late afternoon approximately 4:30pm British autumn, diffused overcast ambient with low directional sunlight breaking through cloud gaps from screen-left horizon, raking warmly across pier decking. Slate greys, salt-bleached browns, deep sea-greens, occasional warm honey notes. No characters or moving subjects.\n\nStyle: ${STYLE}`,
  },
  {
    id: 'LOC-OCEAN-SURFACE-PIERSIDE',
    name: 'Ocean Surface — Pier Side',
    type: 'location',
    aspectRatio: '16:9',
    prompt: `Sea-level view of heaving grey-green ocean immediately around weathered pier pilings. Choppy water with whitecap tops, foam patches drifting. Pilings rising vertically. Raking directional sunlight reflecting off water surface, light bouncing upward. Sea-green darkening to slate-black in shadows under pier, white foam tops, occasional honey-warm glints. Constant fluid motion, ripple, foam, suspended kelp fragments. No characters or subjects.\n\nStyle: ${STYLE}`,
  },
  {
    id: 'PROP-KITE',
    name: 'Crimson Kite',
    type: 'prop',
    aspectRatio: '1:1',
    prompt: `Traditional diamond-shaped nylon kite, crimson red rip-stop nylon, approximately 90cm wingspan. Thin wooden cross-spars visible through fabric. Long crimson ribbon tail roughly 3 metres, ending in small bow knot. Kite in its canonical airborne state, taut and alive. Object centred on neutral plain background, even soft lighting, full visibility, scale referenceable.\n\nStyle: ${STYLE}`,
  },
  {
    id: 'PROP-SPOOL',
    name: 'Kite Spool',
    type: 'prop',
    aspectRatio: '1:1',
    prompt: `Wooden kite spool, varnished pine, well-handled, kid-sized fitting in a child's two hands. Sturdy white kite line wrapped around it. Object centred on neutral plain background, even soft lighting, full visibility.\n\nStyle: ${STYLE}`,
  },
];

const ai = new GoogleGenAI({ apiKey });

async function generateWithRetry(prompt: string): Promise<{ data: string; mimeType: string } | null> {
  const delays = [5000, 15000, 30000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: [Modality.IMAGE] },
      });
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
        }
      }
      return null;
    } catch (err) {
      const is429 = err instanceof Error && (err.message.includes('"code":429') || err.message.includes('"code":400'));
      if (is429 && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      throw err;
    }
  }
  return null;
}

console.log(`Model    : ${model}`);
console.log(`Entities : ${entities.length}`);
console.log(`Candidates: ${candidateCount} per entity`);
console.log(`Total calls: ${entities.length * candidateCount} (all parallel)\n`);

const t0 = Date.now();

const results = await Promise.allSettled(
  entities.flatMap((entity) =>
    Array.from({ length: candidateCount }, async (_, c) => {
      const start = Date.now();
      try {
        const img = await generateWithRetry(entity.prompt);
        if (!img) {
          console.log(`  ${entity.id}[${c}] ✗  no image in response`);
          return null;
        }
        const buf = Buffer.from(img.data, 'base64');
        const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const path = `/tmp/leo-ref-${entity.id}-${c}.${ext}`;
        writeFileSync(path, buf);
        console.log(`  ${entity.id}[${c}] ✓  ${(buf.length / 1024).toFixed(0)}KB → ${path}  (${Date.now() - start}ms)`);
        return { path, entity };
      } catch (err) {
        console.log(`  ${entity.id}[${c}] ✗  ${err instanceof Error ? err.message.slice(0, 120) : err}`);
        return null;
      }
    }),
  ),
);

const ok = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
const total = entities.length * candidateCount;
console.log(`\n${ok}/${total} images generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
