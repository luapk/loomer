import { NextRequest, NextResponse } from 'next/server';
import { head } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const BLOB_BASE = 'https://yldnjflhzh4heowu.public.blob.vercel-storage.com';

export async function GET(request: NextRequest) {
  const shotNumber = Number(request.nextUrl.searchParams.get('shot'));
  if (!shotNumber || shotNumber < 1 || shotNumber > 14) {
    return new Response('Use ?shot=1..14', { status: 400 });
  }

  const blobPath = `veo-test/shot-${String(shotNumber).padStart(2, '0')}.mp4`;

  // Use head() to verify existence and get canonical URL (uses BLOB_READ_WRITE_TOKEN)
  let blobUrl: string;
  try {
    const meta = await head(blobPath);
    blobUrl = meta.url;
  } catch {
    // Try direct URL as fallback
    blobUrl = `${BLOB_BASE}/${blobPath}`;
  }

  const vidRes = await fetch(blobUrl);
  if (!vidRes.ok) {
    return new Response(`Video not ready yet (${vidRes.status})`, { status: 404 });
  }

  // ?format=base64 returns JSON so MCP tools can retrieve the video data
  const fmt = request.nextUrl.searchParams.get('format');
  if (fmt === 'base64') {
    const buf = Buffer.from(await vidRes.arrayBuffer());
    return NextResponse.json({ shotNumber, mimeType: 'video/mp4', sizeBytes: buf.length, data: buf.toString('base64') });
  }

  // Default: proxy the video bytes through loomer domain (bypasses Blob host restriction)
  return new Response(vidRes.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `inline; filename="leo-shot-${String(shotNumber).padStart(2, '0')}.mp4"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
