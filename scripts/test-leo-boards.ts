/**
 * End-to-end board test for Leo and the Dolphin — illustrated style.
 *
 * Phase 1: Generate watercolour reference stills for all 6 Bible entities (parallel).
 * Phase 2: Generate all 14 shot key frames with those refs as conditioning images.
 *
 * Output: /tmp/leo-board-NN.jpg for each shot.
 *
 * Usage:
 *   npx tsx scripts/test-leo-boards.ts
 *   npx tsx scripts/test-leo-boards.ts gemini-3.1-flash-image-preview   # cheaper/faster model
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config({ path: new URL('../.env', import.meta.url).pathname });

const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) { console.error('GOOGLE_AI_API_KEY not set'); process.exit(1); }

const model = process.argv[2] ?? 'nano-banana-pro-preview';
const ai = new GoogleGenAI({ apiKey });

const WATERCOLOUR =
  'Pencil sketch with simple watercolour wash. Clean hand-drawn pencil line work, ' +
  'loose gestural marks, flat areas of muted translucent watercolour colour, white ' +
  'paper showing through, minimal detail. Traditional storyboard illustration. ' +
  'No photorealism, no CGI, no digital art.';

// ─── Phase 1: Reference stills ─────────────────────────────────────────────

const REFS = {
  'CHAR-LEO': {
    path: '/tmp/leo-illus-CHAR-LEO.jpg',
    prompt: `8-year-old boy, pale British complexion, light scattered freckles across nose bridge and upper cheeks, large grey-blue eyes, slight gap between front teeth. Sandy-blond hair, ear-length, naturally tousled. Small for his age, slight build. Charcoal grey wool duffle coat with three horn toggles, hood down. Navy cable-knit fisherman's jumper at collar. Indigo denim jeans rolled at ankles. Scuffed brown leather boots. Cream-and-navy striped wool scarf wrapped twice around neck. Standing relaxed, neutral expression, front-three-quarter angle, full body visible, plain background.\n\nStyle: ${WATERCOLOUR}`,
  },
  'CHAR-DOLPHIN': {
    path: '/tmp/leo-illus-CHAR-DOLPHIN.jpg',
    prompt: `Adult bottlenose dolphin, approximately 2.8 metres. Sleek slate-grey dorsal surface fading to pale silvery-grey flanks and cream-grey belly. Bright intelligent dark eyes. Small pale crescent-shaped scar on leading edge of dorsal fin. Breaching cleanly from calm water, full body visible, plain neutral background.\n\nStyle: ${WATERCOLOUR}`,
  },
  'LOC-PIER-COASTAL-AFTERNOON': {
    path: '/tmp/leo-illus-LOC-PIER.jpg',
    prompt: `Wide establishing shot of a weathered British coastal pier, late autumn afternoon. Salt-bleached grey-brown timber decking, rust-pitted iron railings with chipped white paint, barnacle-encrusted pilings descending into grey-green sea. Overcast sky with low warm sunlight breaking through cloud on the horizon. Slate greys, salt-bleached browns, deep sea-greens. No characters.\n\nStyle: ${WATERCOLOUR}`,
  },
  'LOC-OCEAN-SURFACE-PIERSIDE': {
    path: '/tmp/leo-illus-LOC-OCEAN.jpg',
    prompt: `Sea-level view of heaving grey-green ocean beside weathered pier pilings. Choppy water with whitecap tops, foam patches. Pilings rising from frame. Raking directional sunlight reflecting off water. No characters.\n\nStyle: ${WATERCOLOUR}`,
  },
  'PROP-KITE': {
    path: '/tmp/leo-illus-PROP-KITE.jpg',
    prompt: `Traditional diamond-shaped kite, crimson red nylon, 90cm wingspan, thin wooden cross-spars visible. Long crimson ribbon tail 3 metres ending in small bow knot. Kite taut and airborne. Object on plain background, full visibility.\n\nStyle: ${WATERCOLOUR}`,
  },
  'PROP-SPOOL': {
    path: '/tmp/leo-illus-PROP-SPOOL.jpg',
    prompt: `Wooden kite spool, varnished pine, well-handled, kid-sized. White kite line wrapped around it. Object on plain background, full visibility.\n\nStyle: ${WATERCOLOUR}`,
  },
} as const;

type RefId = keyof typeof REFS;

async function generateWithRetry(
  prompt: string,
  conditioningPaths: string[] = [],
): Promise<{ data: string; mimeType: string } | null> {
  const delays = [5000, 15000, 30000];

  // Build contents: conditioning images first, then text prompt
  const parts: Record<string, unknown>[] = conditioningPaths
    .filter((p) => existsSync(p))
    .map((p) => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: readFileSync(p).toString('base64'),
      },
    }));
  parts.push({ text: prompt });

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (ai.models.generateContent as any)({
        model,
        contents: [{ parts }],
        config: { responseModalities: [Modality.IMAGE] },
      });
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'image/png' };
        }
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes('"code":429') || msg.includes('"code":400');
      if (isRetryable && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]!));
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function saveImage(result: { data: string; mimeType: string }, path: string): Promise<void> {
  writeFileSync(path, Buffer.from(result.data, 'base64'));
}

// ─── Shot definitions ───────────────────────────────────────────────────────

const SHOTS: {
  n: number;
  title: string;
  refs: RefId[];
  prompt: string;
}[] = [
  {
    n: 1, title: 'Establishing the world',
    refs: ['CHAR-LEO', 'LOC-PIER-COASTAL-AFTERNOON', 'PROP-KITE'],
    prompt: `Extreme wide shot, slightly elevated angle, static. A weathered wooden pier extends across the frame over a vast bruised grey sea. At the far end, tiny in scale, a small boy in a charcoal grey duffle coat stands alone. High in the upper-right of the bruised sky, a single crimson diamond kite is taut on its line — the only saturated colour. Two distant gulls wheel. Late afternoon shaft of sun raking across the sea surface.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 2, title: 'The bond',
    refs: ['CHAR-LEO', 'PROP-SPOOL', 'PROP-KITE'],
    prompt: `Extreme close-up on hands. A child's small pale hands — knuckles pink from cold, small plaster on the back of the right hand — grip a varnished wooden kite spool. White kite line runs upward out of frame under tension. The grip is two-handed, reverent, precise. Pier railing iron visible edge of frame.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 3, title: 'The object aloft',
    refs: ['PROP-KITE'],
    prompt: `Low angle looking up at a crimson diamond kite, taut and alive against a bruised grey-pewter sky. The kite fills much of the upper frame. Long crimson ribbon tail streams to screen-left. Thin kite line descends toward lower frame. The kite is the only saturated colour — a single red diamond against grey.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 4, title: 'Leo in his place',
    refs: ['CHAR-LEO', 'LOC-PIER-COASTAL-AFTERNOON', 'PROP-SPOOL'],
    prompt: `Medium full shot of an 8-year-old boy standing at a weathered pier railing in a charcoal grey wool duffle coat, cream-and-navy scarf. He holds a wooden kite spool in both hands at chest height, line running upward out of frame. He tilts his head slightly upward, watching. The pier extends behind him. Overcast coastal light, cold.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 5, title: 'The connection',
    refs: ['CHAR-LEO'],
    prompt: `Close-up on an 8-year-old boy's face, slightly low angle looking up. Large grey-blue eyes focused upward, lips slightly parted, lower lip bitten in concentration. Sandy-blond hair windswept. Faint freckles across nose. Cream-and-navy scarf at collar. Cold sky behind. This is a moment of pure absorption.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 6, title: 'The gust hits',
    refs: ['CHAR-LEO', 'PROP-SPOOL'],
    prompt: `Medium close-up on an 8-year-old boy at a pier railing, shot from slightly below. A violent gust — his scarf whips horizontal, coat flaps. His hands grip a wooden kite spool but the line is pulling hard, spool beginning to be torn away. His expression: alarm, grip-tightening desperation. Dynamic diagonal composition.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 7, title: 'The loss',
    refs: ['CHAR-LEO', 'PROP-SPOOL'],
    prompt: `Medium shot of an 8-year-old boy at a pier railing, the moment of loss. His hands have just released — or the spool has just been ripped from them. His arms extend outward slightly, fingers open in shock. The wooden kite spool flies out of frame. His face: shock, breath held, the instant before understanding arrives.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 8, title: 'The plummet and splash',
    refs: ['PROP-KITE', 'LOC-OCEAN-SURFACE-PIERSIDE'],
    prompt: `Wide shot looking down from pier to sea surface. A crimson kite plummets from the upper frame down toward grey-green choppy water. Pier pilings visible at frame edges. The kite hits the water in a white splash, then floats — a sodden crimson shape on grey-green sea, ribbon tail drifting.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 9, title: 'The pause',
    refs: ['CHAR-LEO', 'LOC-PIER-COASTAL-AFTERNOON'],
    prompt: `Medium shot of an 8-year-old boy at a pier railing, leaning forward on the iron rail, looking down into the water below. His hands grip the rail, knuckles white. His face is a mask of paralysed grief — the moment just after loss, before action. The vast grey sea stretches behind him. The crimson kite is somewhere below, off-screen.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 10, title: 'THE REVEAL',
    refs: ['CHAR-DOLPHIN', 'PROP-KITE', 'LOC-OCEAN-SURFACE-PIERSIDE'],
    prompt: `Wide shot at sea level. Grey-green choppy water surface, pier pilings rising in background. A sodden crimson kite floats in the mid-ground, soft focus. In the near-ground, cutting cleanly through the water surface, a single slate-grey dorsal fin — with a small crescent scar on its leading edge. Just the fin. The dolphin's body is submerged. The juxtaposition: the lost kite and something watching it.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 11, title: 'The miracle',
    refs: ['CHAR-DOLPHIN', 'PROP-KITE', 'PROP-SPOOL', 'LOC-OCEAN-SURFACE-PIERSIDE'],
    prompt: `Wide shot at sea level. A full adult bottlenose dolphin surfaces beside a floating crimson kite. The dolphin holds the wooden kite spool gently in its teeth. The kite line trails from the spool back to the kite floating nearby. The dolphin's bright dark eye is visible. The crescent scar on the dorsal fin. This is the miracle made matter-of-fact.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 12, title: 'Eye contact — THE CLIMAX',
    refs: ['CHAR-LEO', 'CHAR-DOLPHIN', 'PROP-SPOOL', 'LOC-PIER-COASTAL-AFTERNOON'],
    prompt: `Two-shot over the pier edge. Above: an 8-year-old boy kneels at the pier's edge, leaning over, both hands outstretched toward the water. His face: wonder, disbelief, held breath. Below: in the water beside the pilings, a bottlenose dolphin holds a wooden kite spool gently in its teeth, head raised above the water, one bright dark eye looking up at the boy. Between them, the exchange about to happen. Split frame — boy above, dolphin below, the pier edge the boundary between worlds.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 13, title: 'The departure',
    refs: ['CHAR-DOLPHIN', 'LOC-OCEAN-SURFACE-PIERSIDE'],
    prompt: `Wide shot at sea level. A bottlenose dolphin departs — its body arcing downward into a dive, tail flukes lifting cleanly from the water surface. The sea closes over it. The crescent scar on the dorsal fin visible one last time. The water settles. The dolphin is gone. The ocean is indifferent again.\n\nStyle: ${WATERCOLOUR}`,
  },
  {
    n: 14, title: 'The story he cannot tell',
    refs: ['CHAR-LEO', 'LOC-PIER-COASTAL-AFTERNOON', 'PROP-KITE', 'PROP-SPOOL'],
    prompt: `Medium shot of an 8-year-old boy standing at the end of the pier, facing camera. He holds a sodden crimson kite — darker red now, water-heavy — and the wooden kite spool together at chest height, like something precious. His expression is unreadable: wonder and secret knowledge and something private. The vast coastal world stretches behind him. The light is going. He is alone. He will not tell anyone what happened.\n\nStyle: ${WATERCOLOUR}`,
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────

console.log(`═══ Leo and the Dolphin — Illustrated Storyboard ═══`);
console.log(`Model: ${model}\n`);

// Phase 1: refs (skip if already generated)
console.log('Phase 1: Reference stills (watercolour)…');
const refEntries = Object.entries(REFS) as [RefId, typeof REFS[RefId]][];
const t1 = Date.now();

await Promise.all(
  refEntries.map(async ([id, ref]) => {
    if (existsSync(ref.path)) {
      console.log(`  ${id} ✓  (cached)`);
      return;
    }
    const start = Date.now();
    try {
      const img = await generateWithRetry(ref.prompt);
      if (!img) { console.log(`  ${id} ✗  no image`); return; }
      await saveImage(img, ref.path);
      console.log(`  ${id} ✓  (${Date.now() - start}ms)`);
    } catch (err) {
      console.log(`  ${id} ✗  ${err instanceof Error ? err.message.slice(0, 80) : err}`);
    }
  }),
);
console.log(`Phase 1 done in ${((Date.now() - t1) / 1000).toFixed(1)}s\n`);

// Phase 2: shot key frames (all parallel, with conditioning)
console.log('Phase 2: Shot key frames (with reference conditioning)…');
const t2 = Date.now();

const boardResults = await Promise.allSettled(
  SHOTS.map(async (shot) => {
    const start = Date.now();
    const condPaths = shot.refs.map((id) => REFS[id].path);
    const outPath = `/tmp/leo-board-${String(shot.n).padStart(2, '0')}.jpg`;

    try {
      const img = await generateWithRetry(shot.prompt, condPaths);
      if (!img) {
        console.log(`  Shot ${String(shot.n).padStart(2, '0')} ✗  no image — "${shot.title}"`);
        return null;
      }
      await saveImage(img, outPath);
      console.log(`  Shot ${String(shot.n).padStart(2, '0')} ✓  ${shot.title}  (${Date.now() - start}ms)`);
      return outPath;
    } catch (err) {
      console.log(`  Shot ${String(shot.n).padStart(2, '0')} ✗  ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      return null;
    }
  }),
);

const ok = boardResults.filter((r) => r.status === 'fulfilled' && r.value).length;
console.log(`\nPhase 2 done in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
console.log(`${ok}/${SHOTS.length} shots generated`);
console.log(`\nTotal: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
console.log(`\nOutput files: /tmp/leo-board-01.jpg … /tmp/leo-board-14.jpg`);
