import { NextRequest } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
} from 'pdf-lib';
import { getDb } from '@/src/lib/db';
import { ParsedStoryboardSchema } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';

// ============================================================================
// Layout constants
// ============================================================================

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Stone palette
const TEXT = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.7, 0.7, 0.7);

// ============================================================================
// ShotKeyFrames type — keyed by shot_number string
// ============================================================================

type ShotKeyFrameEntry = {
  status: string;
  url: string | null;
  error?: string;
};

// The Prisma Json field deserialises to `unknown`; we cast after runtime check.
type ShotKeyFrames = Record<string, ShotKeyFrameEntry>;

// ============================================================================
// Helpers
// ============================================================================

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Draw wrapped text, returning the y position after the last line. */
function drawWrapped(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    maxWidth: number;
    font: PDFFont;
    size: number;
    color: ReturnType<typeof rgb>;
    lineHeight?: number;
  },
): number {
  const { x, y, maxWidth, font, size, color } = opts;
  const lineHeight = opts.lineHeight ?? size * 1.4;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  let curY = y;
  for (const line of lines) {
    page.drawText(line, { x, y: curY, size, font, color });
    curY -= lineHeight;
  }

  return curY;
}

/** Fetch a URL and return its bytes, or null on failure. */
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

// ============================================================================
// Page builders
// ============================================================================

function buildCoverPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  parsed: ReturnType<typeof ParsedStoryboardSchema.parse>,
): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Border rectangle
  page.drawRectangle({
    x: 40,
    y: 40,
    width: PAGE_W - 80,
    height: PAGE_H - 80,
    borderColor: LIGHT,
    borderWidth: 0.5,
  });

  let y = PAGE_H - MARGIN - 60;

  // Title
  const titleSize = 36;
  const titleWidth = fonts.bold.widthOfTextAtSize(parsed.title, titleSize);
  const titleX = Math.max(MARGIN, (PAGE_W - titleWidth) / 2);
  page.drawText(parsed.title, {
    x: titleX,
    y,
    size: titleSize,
    font: fonts.bold,
    color: TEXT,
  });

  y -= 48;

  // Subtitle
  const subtitle = 'Illustrated Storyboard';
  const subtitleSize = 18;
  const subtitleWidth = fonts.regular.widthOfTextAtSize(subtitle, subtitleSize);
  page.drawText(subtitle, {
    x: (PAGE_W - subtitleWidth) / 2,
    y,
    size: subtitleSize,
    font: fonts.regular,
    color: GREY,
  });

  y -= 32;

  // Shot count + format
  const format = parsed.format.replace('_', ' ');
  const meta = `${parsed.total_shots} shots · ${format} · ${parsed.duration_seconds}s`;
  const metaSize = 12;
  const metaWidth = fonts.regular.widthOfTextAtSize(meta, metaSize);
  page.drawText(meta, {
    x: (PAGE_W - metaWidth) / 2,
    y,
    size: metaSize,
    font: fonts.regular,
    color: GREY,
  });

  y -= 36;

  // Narrative arc (max 400 chars with ellipsis)
  const arc =
    parsed.narrative_arc.length > 400
      ? parsed.narrative_arc.slice(0, 397) + '…'
      : parsed.narrative_arc;

  drawWrapped(page, arc, {
    x: MARGIN + 24,
    y,
    maxWidth: CONTENT_W - 48,
    font: fonts.regular,
    size: 10,
    color: GREY,
  });
}

async function buildShotPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont; oblique: PDFFont },
  shot: ReturnType<typeof ParsedStoryboardSchema.parse>['shots'][number],
  frameUrl: string,
): Promise<void> {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  const shotLabel = `SHOT ${String(shot.shot_number).padStart(2, '0')}`;
  let y = PAGE_H - MARGIN;

  // Shot number — top-left, bold monospace grey
  page.drawText(shotLabel, {
    x: MARGIN,
    y,
    size: 10,
    font: fonts.bold,
    color: GREY,
  });

  // Descriptor — top-centre
  const descSize = 12;
  const descWidth = fonts.regular.widthOfTextAtSize(shot.descriptor, descSize);
  const descX = Math.max(MARGIN, (PAGE_W - descWidth) / 2);
  page.drawText(shot.descriptor, {
    x: descX,
    y,
    size: descSize,
    font: fonts.regular,
    color: TEXT,
  });

  y -= 20;

  // Thin rule
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5,
    color: LIGHT,
  });

  y -= 16;

  // Key frame image
  const imgBytes = await fetchBytes(frameUrl);
  if (imgBytes) {
    try {
      const img = await pdfDoc.embedJpg(imgBytes);
      const intrinsicW = img.width;
      const intrinsicH = img.height;
      const maxImgH = 360;
      const availW = CONTENT_W;
      const scale = Math.min(availW / intrinsicW, maxImgH / intrinsicH, 1);
      const imgW = intrinsicW * scale;
      const imgH = intrinsicH * scale;
      const imgX = MARGIN + (availW - imgW) / 2;

      page.drawImage(img, {
        x: imgX,
        y: y - imgH,
        width: imgW,
        height: imgH,
      });

      y -= imgH + 16;
    } catch {
      // If embedding fails (e.g. PNG returned instead of JPEG), skip image block
      y -= 8;
    }
  } else {
    y -= 8;
  }

  // Function line — italics
  y = drawWrapped(page, shot.function, {
    x: MARGIN,
    y,
    maxWidth: CONTENT_W,
    font: fonts.oblique,
    size: 9,
    color: GREY,
  });

  y -= 4;

  // Metadata line: scale | lens | duration
  const metaLine = [
    shot.grammar.scale,
    shot.grammar.lens,
    shot.duration?.veo != null ? `Veo ${shot.duration.veo}s` : null,
  ].filter(Boolean).join('  ·  ');

  page.drawText(metaLine, {
    x: MARGIN,
    y,
    size: 9,
    font: fonts.regular,
    color: GREY,
  });

  y -= 16;

  // Dialogue / VO
  if (shot.dialogue_vo) {
    const quote = `"${shot.dialogue_vo}"`;
    drawWrapped(page, quote, {
      x: MARGIN,
      y,
      maxWidth: CONTENT_W,
      font: fonts.regular,
      size: 9,
      color: rgb(0.45, 0.42, 0.38), // warm stone
    });
  }
}

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
    return Response.json(
      { error: 'No shots generated yet', code: 'NO_SHOTS' },
      { status: 422 },
    );
  }

  // Parse shot_key_frames — Prisma returns Json as `unknown`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyFrames = row.shot_key_frames as any as ShotKeyFrames;

  const doneCount = Object.values(keyFrames).filter(
    (f) => f.status === 'done' && f.url,
  ).length;

  if (doneCount === 0) {
    return Response.json(
      { error: 'No shots generated yet', code: 'NO_SHOTS' },
      { status: 422 },
    );
  }

  // Parse parsed_json
  const parseResult = ParsedStoryboardSchema.safeParse(row.parsed_json);
  if (!parseResult.success) {
    return Response.json(
      { error: 'Storyboard parse data is invalid', details: parseResult.error.flatten() },
      { status: 500 },
    );
  }
  const parsed = parseResult.data;

  // ── Build PDF ──────────────────────────────────────────────────────────────

  const pdfDoc = await PDFDocument.create();

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Cover page
  buildCoverPage(pdfDoc, { regular, bold }, parsed);

  // Shot pages — one per shot with a done URL
  for (const shot of parsed.shots) {
    const key = String(shot.shot_number);
    const frame = keyFrames[key];
    if (!frame || frame.status !== 'done' || !frame.url) continue;

    await buildShotPage(pdfDoc, { regular, bold, oblique }, shot, frame.url);
  }

  const pdfBytes = await pdfDoc.save();

  const filename = `${slugify(parsed.title || row.title)}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
