import { NextRequest } from 'next/server';
import { deflateRawSync, crc32 as nodeCrc32 } from 'zlib';
import { getDb } from '@/src/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ============================================================================
// Minimal ZIP writer — no external dependencies
// ============================================================================

// zlib.crc32 was added in Node 22. For older versions we compute it manually.
function computeCrc32(buf: Buffer): number {
  // Use Node's built-in if available (Node 22+)
  if (typeof nodeCrc32 === 'function') {
    return nodeCrc32(buf);
  }
  // Fallback: compute CRC32 using the standard polynomial
  const table = makeCrc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ (table[(crc ^ buf[i]!) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: Uint32Array | null = null;
function makeCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  _crc32Table = table;
  return table;
}

function writeUInt16LE(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function writeUInt32LE(n: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

interface ZipEntry {
  filename: string;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  offset: number;
}

/**
 * Build a ZIP archive from a map of filename → raw bytes.
 * Uses DEFLATE compression (method 8).
 */
function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const entries: ZipEntry[] = [];
  const parts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const crc = computeCrc32(file.data);
    const compressed = deflateRawSync(file.data, { level: 6 });
    const nameBytes = Buffer.from(file.name, 'utf8');

    // Local file header
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
      writeUInt16LE(20),                       // version needed: 2.0
      writeUInt16LE(0),                        // general purpose bit flag
      writeUInt16LE(8),                        // compression method: deflate
      writeUInt16LE(0),                        // last mod time
      writeUInt16LE(0),                        // last mod date
      writeUInt32LE(crc),                      // crc-32
      writeUInt32LE(compressed.length),        // compressed size
      writeUInt32LE(file.data.length),         // uncompressed size
      writeUInt16LE(nameBytes.length),         // file name length
      writeUInt16LE(0),                        // extra field length
      nameBytes,
    ]);

    entries.push({
      filename: file.name,
      data: file.data,
      compressed,
      crc,
      offset,
    });

    parts.push(localHeader, compressed);
    offset += localHeader.length + compressed.length;
  }

  // Central directory
  const cdParts: Buffer[] = [];
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.filename, 'utf8');
    const cdEntry = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]), // central dir signature
      writeUInt16LE(20),                       // version made by
      writeUInt16LE(20),                       // version needed
      writeUInt16LE(0),                        // general purpose bit flag
      writeUInt16LE(8),                        // compression method
      writeUInt16LE(0),                        // last mod time
      writeUInt16LE(0),                        // last mod date
      writeUInt32LE(entry.crc),                // crc-32
      writeUInt32LE(entry.compressed.length),  // compressed size
      writeUInt32LE(entry.data.length),        // uncompressed size
      writeUInt16LE(nameBytes.length),         // file name length
      writeUInt16LE(0),                        // extra field length
      writeUInt16LE(0),                        // file comment length
      writeUInt16LE(0),                        // disk number start
      writeUInt16LE(0),                        // internal attributes
      writeUInt32LE(0),                        // external attributes
      writeUInt32LE(entry.offset),             // relative offset of local header
      nameBytes,
    ]);
    cdParts.push(cdEntry);
  }

  const centralDir = Buffer.concat(cdParts);
  const cdOffset = offset;
  const cdSize = centralDir.length;

  // End of central directory record
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]), // EOCD signature
    writeUInt16LE(0),                        // disk number
    writeUInt16LE(0),                        // disk with central dir
    writeUInt16LE(entries.length),           // entries on this disk
    writeUInt16LE(entries.length),           // total entries
    writeUInt32LE(cdSize),                   // central dir size
    writeUInt32LE(cdOffset),                 // central dir offset
    writeUInt16LE(0),                        // comment length
  ]);

  return Buffer.concat([...parts, centralDir, eocd]);
}

// ============================================================================
// Shot key frames type
// ============================================================================

type ShotKeyFrameEntry = {
  status: string;
  url: string | null;
  error?: string;
};

type ShotKeyFrames = Record<string, ShotKeyFrameEntry>;

// ============================================================================
// Route handler
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const db = getDb();
  const row = await db.storyboard.findUnique({ where: { id } });

  if (!row) {
    return Response.json({ error: 'Storyboard not found' }, { status: 404 });
  }

  if (!row.shot_key_frames) {
    return Response.json({ error: 'No shots generated yet' }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyFrames = row.shot_key_frames as any as ShotKeyFrames;

  const doneEntries = Object.entries(keyFrames)
    .filter(([, f]) => f.status === 'done' && f.url)
    .sort(([a], [b]) => Number(a) - Number(b));

  if (doneEntries.length === 0) {
    return Response.json({ error: 'No completed shots to download' }, { status: 422 });
  }

  // Fetch all images in parallel (max 5 at a time to avoid overloading)
  const files: { name: string; data: Buffer }[] = [];

  // Fetch in batches of 5
  const BATCH = 5;
  for (let i = 0; i < doneEntries.length; i += BATCH) {
    const batch = doneEntries.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async ([shotNum, frame]) => {
        const url = frame.url!;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        const data = Buffer.from(arrayBuf);
        // Detect extension from content type or URL
        const contentType = res.headers.get('content-type') ?? '';
        const ext = contentType.includes('png') ? 'png' :
          url.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        const name = `${String(shotNum).padStart(2, '0')}.${ext}`;
        return { name, data };
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        files.push(result.value);
      }
      // Silently skip failed fetches
    }
  }

  if (files.length === 0) {
    return Response.json({ error: 'Failed to fetch any images' }, { status: 500 });
  }

  const zipBuffer = buildZip(files);

  const title = row.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${title}-boards.zip"`,
    },
  });
}
