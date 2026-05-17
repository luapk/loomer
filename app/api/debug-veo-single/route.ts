import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Hardcoded Leo storyboard shot URLs (from debug-frames endpoint)
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

export async function GET(request: NextRequest) {
  const shotNumber = Number(request.nextUrl.searchParams.get('shot'));
  if (!shotNumber || !SHOT_URLS[shotNumber]) {
    return NextResponse.json({ error: `Invalid shot number. Use ?shot=1 through 14.` }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not set' }, { status: 503 });

  const imageUrl = SHOT_URLS[shotNumber]!;

  // Fetch image (server-side, so no host restriction from Blob)
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return NextResponse.json({ error: `Image fetch failed: ${imgRes.status}` }, { status: 502 });
  const imgBuf = await imgRes.arrayBuffer();
  const imgB64 = Buffer.from(imgBuf).toString('base64');
  const mimeType = (imgRes.headers.get('content-type') ?? 'image/png').split(';')[0]!.trim();

  const ai = new GoogleGenAI({ apiKey });

  let op = await ai.models.generateVideos({
    model: 'veo-2.0-generate-001',
    prompt: `Cinematic storyboard shot brought to life. British coastal naturalism. Kodak Vision3 500T. Muted naturalistic tones. Subtle camera movement.`,
    image: { imageBytes: imgB64, mimeType },
    config: { durationSeconds: 5, aspectRatio: '16:9', numberOfVideos: 1 },
  });

  const deadline = Date.now() + 240_000;
  while (!op.done) {
    if (Date.now() > deadline) return NextResponse.json({ error: 'Veo timeout after 240s' }, { status: 504 });
    await new Promise((r) => setTimeout(r, 10_000));
    op = await ai.operations.getVideosOperation({ operation: op });
  }

  const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) return NextResponse.json({ error: 'No video URI in response' }, { status: 502 });

  const vidRes = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
  if (!vidRes.ok) return NextResponse.json({ error: `Video download failed: ${vidRes.status}` }, { status: 502 });
  const vidBuf = Buffer.from(await vidRes.arrayBuffer());

  const blob = await put(
    `veo-test/shot-${String(shotNumber).padStart(2, '0')}.mp4`,
    vidBuf,
    { access: 'public', allowOverwrite: true, contentType: 'video/mp4' },
  );

  return NextResponse.json({ shotNumber, url: blob.url, sizeBytes: vidBuf.length });
}
