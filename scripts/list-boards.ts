import { PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  const boards = await db.storyboard.findMany({
    select: { id: true, title: true, status: true, shot_key_frames: true },
    orderBy: { created_at: 'desc' },
  });
  for (const b of boards) {
    const frames = b.shot_key_frames as Record<string, { status: string; url: string | null }> | null;
    const done = frames ? Object.values(frames).filter(f => f.status === 'done').length : 0;
    console.log(b.id, '|', b.title, '|', b.status, '|', done, 'frames done');
  }
  await db.$disconnect();
}
main().catch(console.error);
