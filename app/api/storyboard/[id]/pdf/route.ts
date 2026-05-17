import { NextRequest } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
  PDFImage,
} from 'pdf-lib';
import { getDb } from '@/src/lib/db';
import { ParsedStoryboardSchema } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// Layout constants — Landscape A4
// ============================================================================

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;

// Stone palette
const DARK_BG = rgb(28 / 255, 25 / 255, 23 / 255);   // stone-900 approx
const WHITE = rgb(1, 1, 1);
const LIGHT_GREY = rgb(0.78, 0.76, 0.74);
const MID_GREY = rgb(0.5, 0.5, 0.5);
const NEAR_BLACK = rgb(0.1, 0.1, 0.1);
const PALE_GREY = rgb(0.88, 0.87, 0.86);

// ============================================================================
// Shot key frame types
// ============================================================================

type ShotKeyFrameEntry = {
  status: string;
  url: string | null;
  error?: string;
};

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
    maxLines?: number;
  },
): number {
  const { x, y, maxWidth, font, size, color } = opts;
  const lineHeight = opts.lineHeight ?? size * 1.4;
  const maxLines = opts.maxLines ?? Infinity;

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

  const renderLines = lines.slice(0, maxLines);
  // If truncated, add ellipsis to last line
  if (lines.length > maxLines && renderLines.length > 0) {
    const last = renderLines[renderLines.length - 1]!;
    renderLines[renderLines.length - 1] = last.length > 3 ? last.slice(0, -3) + '…' : last + '…';
  }

  let curY = y;
  for (const line of renderLines) {
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

/** Try to embed an image from bytes — tries JPEG first, falls back to PNG. */
async function embedImage(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage | null> {
  try {
    return await pdfDoc.embedJpg(bytes);
  } catch {
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Page 1 — Cover
// ============================================================================

function buildCoverPage(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  parsed: ReturnType<typeof ParsedStoryboardSchema.parse>,
  shotCount: number,
): void {
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Full-bleed dark background
  page.drawRectangle({
    x: 0, y: 0,
    width: PAGE_W, height: PAGE_H,
    color: DARK_BG,
  });

  // Title — centred, vertically centred upper half
  const titleSize = 48;
  const titleText = parsed.title;
  const titleWidth = fonts.bold.widthOfTextAtSize(titleText, titleSize);
  const titleX = Math.max(MARGIN, (PAGE_W - titleWidth) / 2);
  const titleY = PAGE_H * 0.55; // upper half centred
  page.drawText(titleText, {
    x: titleX,
    y: titleY,
    size: titleSize,
    font: fonts.bold,
    color: WHITE,
  });

  // Subtitle — look field below title
  const subtitleText = parsed.style_lock.look;
  const subtitleSize = 24;
  const subtitleWidth = fonts.regular.widthOfTextAtSize(subtitleText, subtitleSize);
  const subtitleX = Math.max(MARGIN, (PAGE_W - subtitleWidth) / 2);
  page.drawText(subtitleText, {
    x: subtitleX,
    y: titleY - titleSize - 20,
    size: subtitleSize,
    font: fonts.regular,
    color: LIGHT_GREY,
  });

  // Bottom strip
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const bottomText = `Loomer  ·  ${shotCount} shots  ·  ${dateStr}`;
  const bottomSize = 12;
  const bottomWidth = fonts.regular.widthOfTextAtSize(bottomText, bottomSize);
  const bottomX = Math.max(MARGIN, (PAGE_W - bottomWidth) / 2);
  page.drawText(bottomText, {
    x: bottomX,
    y: MARGIN + 8,
    size: bottomSize,
    font: fonts.regular,
    color: MID_GREY,
  });
}

// ============================================================================
// Pages 2+ — Grid pages (3×3, 9 shots per page)
// ============================================================================

async function buildGridPages(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont },
  shots: ReturnType<typeof ParsedStoryboardSchema.parse>['shots'],
  keyFrames: ShotKeyFrames,
  title: string,
): Promise<void> {
  const COLS = 3;
  const ROWS = 3;
  const SHOTS_PER_PAGE = COLS * ROWS;
  const PAGE_MARGIN = 12;
  const GUTTER = 8;
  const HEADER_H = 20;

  const gridW = PAGE_W - PAGE_MARGIN * 2;
  const gridH = PAGE_H - PAGE_MARGIN * 2 - HEADER_H;
  const cellW = (gridW - GUTTER * (COLS - 1)) / COLS;
  // 16:9 image height + metadata below
  const imgH = cellW * (9 / 16);
  const metaH = 32; // approx height for shot number + descriptor + dialogue
  const cellH = (gridH - GUTTER * (ROWS - 1)) / ROWS;

  // Gather shots with done status
  const doneShots = shots.filter((s) => {
    const key = String(s.shot_number);
    const f = keyFrames[key];
    return f && f.status === 'done' && f.url;
  });

  // Suppress unused variable warning — imgH is used below in the draw call
  void imgH;

  const totalPages = Math.ceil(doneShots.length / SHOTS_PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const pageNum = pageIdx + 1;

    // Header
    page.drawText(title, {
      x: PAGE_MARGIN,
      y: PAGE_H - PAGE_MARGIN - 10,
      size: 10,
      font: fonts.regular,
      color: MID_GREY,
    });
    const pageLabel = `${pageNum} / ${totalPages}`;
    const pageLabelW = fonts.regular.widthOfTextAtSize(pageLabel, 10);
    page.drawText(pageLabel, {
      x: PAGE_W - PAGE_MARGIN - pageLabelW,
      y: PAGE_H - PAGE_MARGIN - 10,
      size: 10,
      font: fonts.regular,
      color: MID_GREY,
    });

    const pageShots = doneShots.slice(pageIdx * SHOTS_PER_PAGE, (pageIdx + 1) * SHOTS_PER_PAGE);

    for (let i = 0; i < pageShots.length; i++) {
      const shot = pageShots[i]!;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const cellX = PAGE_MARGIN + col * (cellW + GUTTER);
      const cellY = PAGE_H - PAGE_MARGIN - HEADER_H - row * (cellH + GUTTER) - cellH;

      const key = String(shot.shot_number);
      const frame = keyFrames[key];

      if (frame?.url) {
        // Draw image
        const bytes = await fetchBytes(frame.url);
        if (bytes) {
          const img = await embedImage(pdfDoc, bytes);
          if (img) {
            const drawImgH = Math.min(cellW * (9 / 16), cellH - metaH);
            page.drawImage(img, {
              x: cellX,
              y: cellY + cellH - drawImgH,
              width: cellW,
              height: drawImgH,
            });
          } else {
            // Grey placeholder
            page.drawRectangle({ x: cellX, y: cellY + metaH, width: cellW, height: cellH - metaH, color: PALE_GREY });
          }
        } else {
          page.drawRectangle({ x: cellX, y: cellY + metaH, width: cellW, height: cellH - metaH, color: PALE_GREY });
        }
      } else {
        page.drawRectangle({ x: cellX, y: cellY + metaH, width: cellW, height: cellH - metaH, color: PALE_GREY });
      }

      // Shot label below image
      const shotLabel = `${String(shot.shot_number).padStart(2, '0')}  ${shot.descriptor}`;
      page.drawText(
        shotLabel.length > 40 ? shotLabel.slice(0, 39) + '…' : shotLabel,
        { x: cellX, y: cellY + metaH - 12, size: 8, font: fonts.bold, color: NEAR_BLACK },
      );

      // Dialogue if present
      if (shot.dialogue_vo) {
        drawWrapped(page, `"${shot.dialogue_vo}"`, {
          x: cellX,
          y: cellY + metaH - 24,
          maxWidth: cellW,
          font: fonts.regular,
          size: 7,
          color: MID_GREY,
          maxLines: 2,
        });
      }
    }
  }
}

// ============================================================================
// Detail pages — one shot per page, landscape two-column
// ============================================================================

async function buildDetailPages(
  pdfDoc: PDFDocument,
  fonts: { regular: PDFFont; bold: PDFFont; oblique: PDFFont },
  shots: ReturnType<typeof ParsedStoryboardSchema.parse>['shots'],
  keyFrames: ShotKeyFrames,
  totalDetailPages: number,
  characterIndex: Map<string, string>,
): Promise<void> {
  const LEFT_FRAC = 0.55;
  const imgColW = (PAGE_W - MARGIN * 2) * LEFT_FRAC;
  const metaColX = MARGIN + imgColW + 20;
  const metaColW = PAGE_W - metaColX - MARGIN;

  const doneShots = shots.filter((s) => {
    const key = String(s.shot_number);
    const f = keyFrames[key];
    return f && f.status === 'done' && f.url;
  });

  for (let i = 0; i < doneShots.length; i++) {
    const shot = doneShots[i]!;
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const pageNum = i + 1;

    // Left column: image
    const key = String(shot.shot_number);
    const frame = keyFrames[key];
    const imgAreaH = PAGE_H - MARGIN * 2;
    const imgAreaW = imgColW;

    if (frame?.url) {
      const bytes = await fetchBytes(frame.url);
      if (bytes) {
        const img = await embedImage(pdfDoc, bytes);
        if (img) {
          // Scale image to fill left column maintaining aspect ratio
          const scale = Math.min(imgAreaW / img.width, imgAreaH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = MARGIN + (imgAreaW - drawW) / 2;
          const drawY = MARGIN + (imgAreaH - drawH) / 2;
          page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
        } else {
          page.drawRectangle({ x: MARGIN, y: MARGIN, width: imgAreaW, height: imgAreaH, color: PALE_GREY });
        }
      } else {
        page.drawRectangle({ x: MARGIN, y: MARGIN, width: imgAreaW, height: imgAreaH, color: PALE_GREY });
      }
    } else {
      page.drawRectangle({ x: MARGIN, y: MARGIN, width: imgAreaW, height: imgAreaH, color: PALE_GREY });
    }

    // Right column: metadata
    let y = PAGE_H - MARGIN;

    // Shot number + descriptor
    const shotLabel = `Shot ${String(shot.shot_number).padStart(2, '0')}  —  ${shot.descriptor}`;
    y = drawWrapped(page, shotLabel, {
      x: metaColX,
      y,
      maxWidth: metaColW,
      font: fonts.bold,
      size: 14,
      color: NEAR_BLACK,
    });

    y -= 8;

    // Function
    y = drawWrapped(page, shot.function, {
      x: metaColX,
      y,
      maxWidth: metaColW,
      font: fonts.oblique,
      size: 10,
      color: MID_GREY,
    });

    y -= 12;

    // Grammar fields in monospace style
    const grammarFields: [string, string | undefined | null][] = [
      ['Scale', shot.grammar.scale],
      ['Lens', shot.grammar.lens],
      ['Angle', shot.grammar.angle],
      ['Move', shot.grammar.camera_move],
      ['Direction', shot.grammar.screen_direction],
    ];

    for (const [label, value] of grammarFields) {
      if (!value) continue;
      const line = `${label}:  ${value}`;
      page.drawText(line, {
        x: metaColX,
        y,
        size: 9,
        font: fonts.regular,
        color: MID_GREY,
      });
      y -= 13;
    }

    y -= 8;

    // Dialogue / VO
    if (shot.dialogue_vo) {
      y = drawWrapped(page, `"${shot.dialogue_vo}"`, {
        x: metaColX,
        y,
        maxWidth: metaColW,
        font: fonts.oblique,
        size: 9,
        color: NEAR_BLACK,
      });
      y -= 8;
    }

    // Continuity characters
    if (shot.continuity?.characters && shot.continuity.characters.length > 0) {
      page.drawText('Characters:', {
        x: metaColX, y, size: 9, font: fonts.bold, color: MID_GREY,
      });
      y -= 13;
      for (const charId of shot.continuity.characters) {
        const charName = characterIndex.get(charId) ?? charId;
        page.drawText(`· ${charName}`, {
          x: metaColX + 8, y, size: 9, font: fonts.regular, color: MID_GREY,
        });
        y -= 12;
      }
    }

    // Page number — bottom right
    const pageLabel = `${pageNum} / ${totalDetailPages}`;
    const pageLabelW = fonts.regular.widthOfTextAtSize(pageLabel, 9);
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - pageLabelW,
      y: MARGIN - 16,
      size: 9,
      font: fonts.regular,
      color: LIGHT_GREY,
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

  // Page 1: Cover
  buildCoverPage(pdfDoc, { regular, bold }, parsed, doneCount);

  // Pages 2+: Grid (3×3)
  await buildGridPages(pdfDoc, { regular, bold }, parsed.shots, keyFrames, parsed.title);

  // Detail pages
  const doneShots = parsed.shots.filter((s) => {
    const key = String(s.shot_number);
    const f = keyFrames[key];
    return f && f.status === 'done' && f.url;
  });

  const characterIndex = new Map(parsed.characters.map((c) => [c.id, c.name]));
  await buildDetailPages(
    pdfDoc,
    { regular, bold, oblique },
    parsed.shots,
    keyFrames,
    doneShots.length,
    characterIndex,
  );

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
