import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { put, head } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOT_URLS: Record<number, string> = {
  1: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/1-regen-1779052770811.png',
  2: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/2.png',
  3: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/3-regen-1779051696161.png',
  4: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/4-regen-1779052818106.png',
  5: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/5.png',
  6: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/6-regen-1779051753778.png',
  7: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/7-regen-1779052850367.png',
  8: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/8-regen-1779051777038.png',
  9: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/9.png',
  10: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/10.png',
  11: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/11-regen-1779052891655.png',
  12: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/12-regen-1779052925584.png',
  13: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/13-regen-1779051818742.png',
  14: 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com/94bc3d16-ff1a-4dfd-b56a-66a335c057ba/shots/14.png',
};

function videoBlobPath(shotNumber: number) {
  return `veo-test/shot-${String(shotNumber).padStart(2, '0')}.mp4`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const phase = searchParams.get('phase') ?? 'start';
  const shotNumber = Number(searchParams.get('shot'));

  if (!shotNumber || !SHOT_URLS[shotNumber]) {
    return NextResponse.json({ error: 'Use ?shot=1..14&phase=start|check[&op=<name>]' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not set' }, { status: 503 });

  const ai = new GoogleGenAI({ apiKey });
  const blobPath = videoBlobPath(shotNumber);

  // ── phase=check ──────────────────────────────────────────────────────────
  if (phase === 'check') {
    // If already uploaded, return immediately.
    try {
      const existing = await head(blobPath);
      return NextResponse.json({ status: 'done', shotNumber, videoPath: `/api/debug-veo-video?shot=${shotNumber}`, blobUrl: existing.url });
    } catch { /* not there yet */ }

    const opName = searchParams.get('op');
    if (!opName) return NextResponse.json({ error: 'Missing ?op= param for phase=check' }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK operation type is opaque
    const op = await ai.operations.getVideosOperation({ operation: { name: opName } as any });

    if (!op.done) {
      return NextResponse.json({ status: 'pending', shotNumber });
    }

    const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) return NextResponse.json({ error: 'No video URI in Veo response' }, { status: 502 });

    const vidRes = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
    if (!vidRes.ok) return NextResponse.json({ error: `Video download failed: ${vidRes.status}` }, { status: 502 });
    const vidBuf = Buffer.from(await vidRes.arrayBuffer());

    await put(blobPath, vidBuf, { access: 'public', allowOverwrite: true, contentType: 'video/mp4' });

    return NextResponse.json({
      status: 'done',
      shotNumber,
      videoPath: `/api/debug-veo-video?shot=${shotNumber}`,
      sizeBytes: vidBuf.length,
    });
  }

  // ── phase=start ───────────────────────────────────────────────────────────
  try {
    const existing = await head(blobPath);
    return NextResponse.json({
      status: 'already_done',
      shotNumber,
      videoPath: `/api/debug-veo-video?shot=${shotNumber}`,
      blobUrl: existing.url,
    });
  } catch { /* not there yet */ }

  const imageUrl = SHOT_URLS[shotNumber]!;
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return NextResponse.json({ error: `Image fetch failed: ${imgRes.status}` }, { status: 502 });
  const imgBuf = await imgRes.arrayBuffer();
  const imgB64 = Buffer.from(imgBuf).toString('base64');
  const mimeType = (imgRes.headers.get('content-type') ?? 'image/png').split(';')[0]!.trim();

  const op = await ai.models.generateVideos({
    model: 'veo-2.0-generate-001',
    prompt: `Cinematic storyboard shot brought to life. British coastal naturalism. Kodak Vision3 500T. Muted naturalistic tones. Subtle camera movement.`,
    image: { imageBytes: imgB64, mimeType },
    config: { durationSeconds: 5, aspectRatio: '16:9', numberOfVideos: 1 },
  });

  return NextResponse.json({ status: 'started', shotNumber, operationName: op.name });
}
