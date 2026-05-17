import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { shotNumber, imageUrl } = (await request.json()) as { shotNumber: number; imageUrl: string };

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY not set' }, { status: 503 });

  // Fetch the shot image from Vercel Blob (server-side, so no host restriction)
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
    if (Date.now() > deadline) return NextResponse.json({ error: 'Veo timeout' }, { status: 504 });
    await new Promise((r) => setTimeout(r, 10_000));
    op = await ai.operations.getVideosOperation({ operation: op });
  }

  const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) return NextResponse.json({ error: 'No video URI in response' }, { status: 502 });

  // Download from Google and upload to Vercel Blob
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
