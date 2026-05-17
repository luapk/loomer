import fs from 'fs';

const BASE_URL = 'https://loomer-eight.vercel.app';

const SHOTS: Array<{ shot: number; url: string }> = [
  { shot: 1, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/1-regen-1779052770811.png' },
  { shot: 2, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/2.png' },
  { shot: 3, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/3-regen-1779051696161.png' },
  { shot: 4, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/4-regen-1779052818106.png' },
  { shot: 5, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/5.png' },
  { shot: 6, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/6-regen-1779051753778.png' },
  { shot: 7, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/7-regen-1779052850367.png' },
  { shot: 8, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/8-regen-1779051777038.png' },
  { shot: 9, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/9.png' },
  { shot: 10, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/10.png' },
  { shot: 11, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/11-regen-1779052891655.png' },
  { shot: 12, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/12-regen-1779052925584.png' },
  { shot: 13, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/13-regen-1779051818742.png' },
  { shot: 14, url: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/14.png' },
];

async function processShot(shot: number, imageUrl: string): Promise<string | null> {
  const outPath = `/tmp/leo-shot-${String(shot).padStart(2, '0')}.mp4`;
  if (fs.existsSync(outPath)) {
    console.log(`Shot ${shot}: already exists, skipping → ${outPath}`);
    return outPath;
  }

  console.log(`Shot ${shot}: calling debug-veo-single endpoint...`);
  const start = Date.now();

  const res = await fetch(`${BASE_URL}/api/debug-veo-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shotNumber: shot, imageUrl }),
    signal: AbortSignal.timeout(270_000),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log(`Shot ${shot}: ERROR ${res.status} — ${err}`);
    return null;
  }

  const data = (await res.json()) as { shotNumber: number; url: string; sizeBytes: number };
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`Shot ${shot}: done in ${elapsed}s — blob URL: ${data.url}`);

  // Download from Vercel Blob to local /tmp
  const vidRes = await fetch(data.url);
  if (!vidRes.ok) { console.log(`Shot ${shot}: download failed`); return null; }
  fs.writeFileSync(outPath, Buffer.from(await vidRes.arrayBuffer()));
  console.log(`Shot ${shot}: saved to ${outPath} (${(data.sizeBytes / 1024 / 1024).toFixed(1)} MB)\n`);
  return outPath;
}

async function main() {
  console.log(`Testing Veo image-to-video on ${SHOTS.length} Leo shots via ${BASE_URL}\n`);

  // Process in batches of 3 to avoid hammering Veo rate limits
  const results: string[] = [];
  for (let i = 0; i < SHOTS.length; i += 3) {
    const batch = SHOTS.slice(i, i + 3);
    const paths = await Promise.all(batch.map(({ shot, url }) => processShot(shot, url)));
    for (const p of paths) { if (p) results.push(p); }
  }

  console.log(`\nDone. ${results.length}/${SHOTS.length} clips saved:`);
  for (const p of results) console.log(`  ${p}`);
}

main().catch(console.error);
