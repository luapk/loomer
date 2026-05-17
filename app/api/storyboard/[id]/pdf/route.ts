import { NextRequest } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFImage,
} from 'pdf-lib';
import { getDb } from '@/src/lib/db';
import type { ParsedStoryboard } from '@/src/schema/storyboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// Layout constants — Landscape A4
// ============================================================================

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_H = 48;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 30;

const HEADER_H = 20;
const FOOTER_H = 16;
const SCENE_GAP = 8;

const COLS = 3;
const ROWS = 3;
const COL_GAP = 10;
const ROW_GAP = 10;

const contentW = PAGE_W - 2 * MARGIN_H; // 745.89
const cellW = (contentW - (COLS - 1) * COL_GAP) / COLS; // ≈241.96
const imgH = cellW / 2.39; // ≈101.24 — cinematic 2.39:1

const gridTopY =
  PAGE_H - MARGIN_TOP - HEADER_H - SCENE_GAP - 18 - SCENE_GAP; // 505.28
const gridBottomY = MARGIN_BOTTOM + FOOTER_H + SCENE_GAP; // 54
const gridH = gridTopY - gridBottomY; // 451.28
const cellH = (gridH - (ROWS - 1) * ROW_GAP) / ROWS; // ≈143.76

// Colors
const INK = rgb(0.067, 0.067, 0.067);
const MID = rgb(0.5, 0.5, 0.5);
const DIM = rgb(0.7, 0.7, 0.7);
const DARK_PLACEHOLDER = rgb(0.15, 0.15, 0.15);

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

/** Sanitize text for WinAnsi encoding — standard pdf-lib fonts only support Latin-1. */
function safe(text: string): string {
  return text
    .replace(/—/g, '--')   // em dash
    .replace(/–/g, '-')    // en dash
    .replace(/[“”]/g, '"')  // curly double quotes
    .replace(/[‘’]/g, "'")  // curly single quotes
    .replace(/…/g, '...')  // ellipsis
    .replace(/•/g, '*')    // bullet
    .replace(/ /g, ' ')    // non-breaking space
    .replace(/’/g, "'")    // right single quote
    .replace(/[^\x00-\xFF]/g, ''); // strip anything else outside Latin-1
}

/** Split text into lines that fit within maxWidth using word-wrap. */
function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
): string[] {
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

  return lines;
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
// Grid pages — 3×3, no cover, no detail pages
// ============================================================================

async function buildGridPages(
  pdfDoc: PDFDocument,
  fonts: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
  },
  parsed: ParsedStoryboard,
  keyFrames: ShotKeyFrames,
): Promise<void> {
  const shots = parsed.shots;
  const title = parsed.title;
  const SHOTS_PER_PAGE = COLS * ROWS;

  // Include ALL shots — show placeholder for non-done shots
  const totalPages = Math.ceil(shots.length / SHOTS_PER_PAGE);

  // Fetch all images in parallel up front
  const imageMap = new Map<number, PDFImage | null>();
  const fetchTasks = shots.map(async (shot) => {
    const key = String(shot.shot_number);
    const frame = keyFrames[key];
    if (frame && frame.status === 'done' && frame.url) {
      const bytes = await fetchBytes(frame.url);
      if (bytes) {
        const img = await embedImage(pdfDoc, bytes);
        imageMap.set(shot.shot_number, img);
        return;
      }
    }
    imageMap.set(shot.shot_number, null);
  });
  await Promise.all(fetchTasks);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const pageShots = shots.slice(
      pageIdx * SHOTS_PER_PAGE,
      (pageIdx + 1) * SHOTS_PER_PAGE,
    );

    const firstShot = pageShots[0]?.shot_number ?? pageIdx * SHOTS_PER_PAGE + 1;
    const lastShot =
      pageShots[pageShots.length - 1]?.shot_number ??
      Math.min((pageIdx + 1) * SHOTS_PER_PAGE, shots.length);

    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    // ── Header ────────────────────────────────────────────────────────────────
    const headerY = PAGE_H - MARGIN_TOP; // 559.28

    // "LOOMER" — simulate letterspacing by drawing char-by-char
    const loomerChars = 'LOOMER'.split('');
    let loomerX = MARGIN_H;
    const loomerSize = 7;
    for (const ch of loomerChars) {
      page.drawText(ch, {
        x: loomerX,
        y: headerY,
        size: loomerSize,
        font: fonts.bold,
        color: INK,
      });
      loomerX += fonts.bold.widthOfTextAtSize(ch, loomerSize) + 1.2;
    }

    // Mono info strip after LOOMER
    const firstShotPad = String(firstShot).padStart(2, '0');
    const lastShotPad = String(lastShot).padStart(2, '0');
    const infoText = `SC.${firstShotPad}-${lastShotPad} · 2.39:1 · STORYBOARD`;
    page.drawText(infoText, {
      x: MARGIN_H + 50,
      y: headerY,
      size: 7,
      font: fonts.regular,
      color: MID,
    });

    // Title right-aligned
    const titleSize = 14;
    const safeTitle = safe(title);
    const titleW = fonts.italic.widthOfTextAtSize(safeTitle, titleSize);
    page.drawText(safeTitle, {
      x: PAGE_W - MARGIN_H - titleW,
      y: headerY,
      size: titleSize,
      font: fonts.italic,
      color: INK,
    });

    // Hairline under header
    const hairlineY = headerY - 22;
    page.drawLine({
      start: { x: MARGIN_H, y: hairlineY },
      end: { x: PAGE_W - MARGIN_H, y: hairlineY },
      thickness: 0.5,
      color: INK,
    });

    // ── Shot count row ────────────────────────────────────────────────────────
    const shotRowY = hairlineY - SCENE_GAP - 14; // ≈ 505.28 - 8 - 14 = 483.28

    const shotsLabel = `SHOTS ${firstShotPad}-${lastShotPad}`;
    page.drawText(shotsLabel, {
      x: MARGIN_H,
      y: shotRowY,
      size: 8,
      font: fonts.bold,
      color: INK,
    });

    const pageLabel = `PAGE ${pageNum} / ${totalPages}`;
    const pageLabelW = fonts.regular.widthOfTextAtSize(pageLabel, 8);
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN_H - pageLabelW,
      y: shotRowY,
      size: 8,
      font: fonts.regular,
      color: INK,
    });

    // Hairline across the shot count row
    const shotsLabelW = fonts.bold.widthOfTextAtSize(shotsLabel, 8);
    page.drawLine({
      start: { x: MARGIN_H + shotsLabelW + 8, y: shotRowY + 3 },
      end: { x: PAGE_W - MARGIN_H - pageLabelW - 8, y: shotRowY + 3 },
      thickness: 0.5,
      color: DIM,
    });

    // ── 3×3 Grid ─────────────────────────────────────────────────────────────
    for (let i = 0; i < pageShots.length; i++) {
      const shot = pageShots[i]!;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const cellX = MARGIN_H + col * (cellW + COL_GAP);
      // cellY = top of cell in pdf-lib y coords (y=0 at bottom)
      const cellTopY = gridTopY - row * (cellH + ROW_GAP);
      const cellBottomY = cellTopY - cellH;

      // 1. Meta row (height 10pt) at top of cell
      const metaY = cellTopY - 8; // baseline of meta text

      const shotNum = String(shot.shot_number).padStart(2, '0');
      page.drawText(shotNum, {
        x: cellX,
        y: metaY,
        size: 8,
        font: fonts.bold,
        color: INK,
      });

      // Descriptor truncated to 30 chars — centred
      const descText = safe(
        shot.descriptor.length > 30
          ? shot.descriptor.slice(0, 30)
          : shot.descriptor,
      );
      const descW = fonts.regular.widthOfTextAtSize(descText, 7);
      page.drawText(descText, {
        x: cellX + (cellW - descW) / 2,
        y: metaY,
        size: 7,
        font: fonts.regular,
        color: MID,
      });

      // Scale + lens — right-aligned
      const scaleLens = safe(`${shot.grammar.scale} · ${shot.grammar.lens}`);
      const scaleLensW = fonts.regular.widthOfTextAtSize(scaleLens, 7);
      page.drawText(scaleLens, {
        x: cellX + cellW - scaleLensW,
        y: metaY,
        size: 7,
        font: fonts.regular,
        color: MID,
      });

      // 2. Image area (imgH tall), below meta row with 3pt gap
      const imageTopY = cellTopY - 10 - 3;
      const imageBottomY = imageTopY - imgH;

      // Dark grey placeholder
      page.drawRectangle({
        x: cellX,
        y: imageBottomY,
        width: cellW,
        height: imgH,
        color: DARK_PLACEHOLDER,
      });

      // Draw image over placeholder if available
      const img = imageMap.get(shot.shot_number);
      if (img) {
        page.drawImage(img, {
          x: cellX,
          y: imageBottomY,
          width: cellW,
          height: imgH,
        });
      }

      // 3. Action line below image
      let textCursorY = imageBottomY - 3;
      const actionLines = wrapText(safe(shot.action_beat), cellW, fonts.regular, 7.5);
      const actionRender = actionLines.slice(0, 2);
      for (const line of actionRender) {
        page.drawText(line, {
          x: cellX,
          y: textCursorY,
          size: 7.5,
          font: fonts.regular,
          color: rgb(0.2, 0.2, 0.2),
        });
        textCursorY -= 10;
      }

      // 4. Dialogue if present
      if (shot.dialogue_vo) {
        textCursorY -= 2;
        const dialogueText = safe(`"${shot.dialogue_vo.toUpperCase()}"`);
        const dialogueLines = wrapText(dialogueText, cellW, fonts.bold, 6.5);
        const dialogueRender = dialogueLines.slice(0, 2);
        for (const line of dialogueRender) {
          // Guard: don't draw below cell bottom
          if (textCursorY < cellBottomY) break;
          page.drawText(line, {
            x: cellX,
            y: textCursorY,
            size: 6.5,
            font: fonts.bold,
            color: rgb(0.5, 0.5, 0.5),
          });
          textCursorY -= 9;
        }
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerHairlineY = MARGIN_BOTTOM + FOOTER_H; // 46
    page.drawLine({
      start: { x: MARGIN_H, y: footerHairlineY },
      end: { x: PAGE_W - MARGIN_H, y: footerHairlineY },
      thickness: 0.5,
      color: INK,
    });

    const footerTextY = MARGIN_BOTTOM + 4; // baseline below hairline

    // Left: storyboard title in grey
    page.drawText(safe(title), {
      x: MARGIN_H,
      y: footerTextY,
      size: 7,
      font: fonts.regular,
      color: MID,
    });

    // Center: today's date
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const dateW = fonts.regular.widthOfTextAtSize(dateStr, 7);
    page.drawText(dateStr, {
      x: (PAGE_W - dateW) / 2,
      y: footerTextY,
      size: 7,
      font: fonts.regular,
      color: MID,
    });

    // Right: "● PAGE X / Y"
    const footerRight = `● PAGE ${pageNum} / ${totalPages}`;
    const footerRightW = fonts.bold.widthOfTextAtSize(footerRight, 7);
    page.drawText(footerRight, {
      x: PAGE_W - MARGIN_H - footerRightW,
      y: footerTextY,
      size: 7,
      font: fonts.bold,
      color: INK,
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

  // Use type assertion — the stored JSON may not pass Zod due to schema evolution
  const parsed = row.parsed_json as unknown as ParsedStoryboard;

  if (!parsed?.shots?.length) {
    return Response.json(
      { error: 'Storyboard has no shots', code: 'NO_SHOTS' },
      { status: 422 },
    );
  }

  // key frames may be null if generation hasn't started — use empty record
  const keyFrames: ShotKeyFrames = row.shot_key_frames
    ? (row.shot_key_frames as unknown as ShotKeyFrames)
    : {};

  // ── Build PDF ──────────────────────────────────────────────────────────────

  const pdfDoc = await PDFDocument.create();

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  await buildGridPages(pdfDoc, { regular, bold, italic }, parsed, keyFrames);

  const pdfBytes = await pdfDoc.save();

  const filename = `${slugify(parsed.title || row.title)}.pdf`;

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
