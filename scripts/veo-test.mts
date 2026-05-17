import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const DB = process.env.DATABASE_URL!;
const GKEY = process.env.GOOGLE_AI_API_KEY!;

async function main() {
  const adapter = new PrismaPg({ connectionString: DB });
  const db = new PrismaClient({ adapter });

  // Find the most recent storyboard with completed frames
  const boards = await db.storyboard.findMany({
    select: { id: true, title: true, shot_key_frames: true },
    orderBy: { created_at: 'desc' },
  });

  let target: typeof boards[0] | undefined;
  for (const b of boards) {
    const frames = b.shot_key_frames as Record<string, { status: string; url: string | null }> | null;
    const done = frames ? Object.values(frames).filter(f => f.status === 'done').length : 0;
    console.log(b.id, '|', b.title, '|', done, 'frames');
    if (!target && done > 0) target = b;
  }

  await db.$disconnect();

  if (!target) { console.log('No boards with frames found'); return; }

  const frames = target.shot_key_frames as Record<string, { status: string; url: string | null }>;
  const shots = Object.entries(frames)
    .filter(([, f]) => f.status === 'done' && f.url)
    .sort(([a], [b]) => Number(a) - Number(b));

  console.log(`\nUsing storyboard: ${target.title} (${target.id})`);
  console.log(`Generating clips for ${shots.length} shots...\n`);

  const ai = new GoogleGenAI({ apiKey: GKEY });

  for (const [shotNum, frame] of shots) {
    console.log(`Shot ${shotNum}: fetching image...`);
    const imgRes = await fetch(frame.url!);
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = Buffer.from(imgBuf).toString('base64');
    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';

    console.log(`Shot ${shotNum}: starting Veo generation...`);
    const start = Date.now();
    let op = await ai.models.generateVideos({
      model: 'veo-2.0-generate-001',
      prompt: `Cinematic storyboard shot, British coastal naturalism, Kodak Vision3 500T, muted naturalistic tones`,
      image: { imageBytes: imgB64, mimeType },
      config: { durationSeconds: 5, aspectRatio: '16:9', numberOfVideos: 1 },
    });

    while (!op.done) {
      await new Promise(r => setTimeout(r, 10000));
      op = await ai.operations.getVideosOperation({ operation: op });
      console.log(`  Shot ${shotNum}: waiting... ${Math.round((Date.now()-start)/1000)}s`);
    }

    const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) { console.log(`  Shot ${shotNum}: no video URI`); continue; }

    // Download the video
    const vidRes = await fetch(videoUri, { headers: { 'x-goog-api-key': GKEY } });
    const vidBuf = Buffer.from(await vidRes.arrayBuffer());
    const outPath = `/tmp/leo-shot-${shotNum.padStart(2,'0')}.mp4`;
    fs.writeFileSync(outPath, vidBuf);
    const elapsed = Math.round((Date.now()-start)/1000);
    console.log(`  Shot ${shotNum}: done in ${elapsed}s → ${outPath} (${(vidBuf.length/1024/1024).toFixed(1)}MB)\n`);
  }

  console.log('All done. Videos saved to /tmp/leo-shot-*.mp4');
}

main().catch(console.error);
