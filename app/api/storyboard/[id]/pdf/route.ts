import { NextRequest, NextResponse } from 'next/server';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFImage,
  PDFPage,
} from 'pdf-lib';
import { getDb } from '@/src/lib/db';
import { requireSession, assertStoryboardAccess } from '@/src/lib/auth';
import { getReferenceStills, getShotFrames } from '@/src/lib/frame-store';
import type { ParsedStoryboard } from '@/src/schema/storyboard';
import type { ReferenceStills } from '@/src/lib/reference-stills';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

// ============================================================================
// Deliverable layouts — Landscape A4 throughout.
//
//   shooting  (default) 3×2 grid, grammar + lens under every frame.
//   treatment           cover + narrative, then one large frame per page
//                       with director's prose. For pitching.
//   client              2×2 grid, frames + captions only, zero technical
//                       fields. For client review.
//   lookbook            style lock typography + approved reference stills.
//                       The project's visual bible.
// ============================================================================

type PdfLayout = 'shooting' | 'treatment' | 'client' | 'lookbook';

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN_H = 48;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 30;

const HEADER_H = 20;
const FOOTER_H = 16;
const SCENE_GAP = 8;

// Colors
const INK = rgb(0.067, 0.067, 0.067);
const MID = rgb(0.5, 0.5, 0.5);
const DIM = rgb(0.7, 0.7, 0.7);
const DARK_PLACEHOLDER = rgb(0.15, 0.15, 0.15);
const PAPER_TINT = rgb(0.98, 0.976, 0.968);

// ============================================================================
// Shot key frame types
// ============================================================================

type ShotKeyFrameEntry = {
  status: string;
  url: string | null;
  error?: string;
};

type ShotKeyFrames = Record<string, ShotKeyFrameEntry>;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

// ============================================================================
// Helpers
// ============================================================================

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toTitleCase(str: string): string {
  const minors = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up']);
  return str
    .toLowerCase()
    .replace(/[^\s-]+/g, (word: string, offset: number) =>
      offset === 0 || !minors.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
    );
}

/** Sanitize text for WinAnsi encoding — standard pdf-lib fonts only support Latin-1. */
function safe(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/—/g, '--')   // em dash
    .replace(/–/g, '-')    // en dash
    .replace(/[“”]/g, '"')  // curly double quotes
    .replace(/[‘’]/g, "'")  // curly single quotes
    .replace(/…/g, '...')  // ellipsis
    .replace(/•/g, '*')    // bullet
    .replace(/●/g, '*')    // black circle bullet
    .replace(/ /g, ' ')    // non-breaking space
    .replace(/’/g, "'")    // right single quote
    // eslint-disable-next-line no-control-regex -- intentional Latin-1 range guard for WinAnsi
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

/** Fetch + embed a batch of urls with bounded concurrency. */
async function embedImagesBatch(
  pdfDoc: PDFDocument,
  urls: (string | null)[],
): Promise<(PDFImage | null)[]> {
  const out: (PDFImage | null)[] = new Array(urls.length).fill(null);
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(
      urls.slice(i, i + BATCH).map(async (url, j) => {
        if (!url) return;
        const bytes = await fetchBytes(url);
        if (bytes) out[i + j] = await embedImage(pdfDoc, bytes);
      }),
    );
  }
  return out;
}

/** Draw image into a rect, aspect-preserving (contain), over a dark placeholder. */
function drawFramedImage(
  page: PDFPage,
  img: PDFImage | null,
  x: number,
  y: number, // bottom of the rect
  w: number,
  h: number,
): void {
  page.drawRectangle({ x, y, width: w, height: h, color: DARK_PLACEHOLDER });
  if (!img) return;
  const { width: iw, height: ih } = img.size();
  const scale = Math.min(w / iw, h / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  page.drawImage(img, {
    x: x + (w - drawW) / 2,
    y: y + (h - drawH) / 2,
    width: drawW,
    height: drawH,
  });
}

/** Standard LOOMER header. Returns the y of the hairline under it. */
function drawHeader(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  infoText: string,
): number {
  const headerY = PAGE_H - MARGIN_TOP;

  // "LOOMER" — simulate letterspacing by drawing char-by-char
  let loomerX = MARGIN_H;
  const loomerSize = 7;
  for (const ch of 'LOOMER') {
    page.drawText(ch, { x: loomerX, y: headerY, size: loomerSize, font: fonts.bold, color: INK });
    loomerX += fonts.bold.widthOfTextAtSize(ch, loomerSize) + 1.2;
  }

  page.drawText(safe(infoText), {
    x: MARGIN_H + 50,
    y: headerY,
    size: 7,
    font: fonts.regular,
    color: MID,
  });

  const titleSize = 14;
  const safeTitle = safe(toTitleCase(title));
  const titleW = fonts.italic.widthOfTextAtSize(safeTitle, titleSize);
  page.drawText(safeTitle, {
    x: PAGE_W - MARGIN_H - titleW,
    y: headerY,
    size: titleSize,
    font: fonts.italic,
    color: INK,
  });

  const hairlineY = headerY - 22;
  page.drawLine({
    start: { x: MARGIN_H, y: hairlineY },
    end: { x: PAGE_W - MARGIN_H, y: hairlineY },
    thickness: 0.5,
    color: INK,
  });
  return hairlineY;
}

/** Standard footer: title left, date centre, page right. */
function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  pageNum: number,
  totalPages: number,
): void {
  const footerHairlineY = MARGIN_BOTTOM + FOOTER_H;
  page.drawLine({
    start: { x: MARGIN_H, y: footerHairlineY },
    end: { x: PAGE_W - MARGIN_H, y: footerHairlineY },
    thickness: 0.5,
    color: INK,
  });

  const footerTextY = MARGIN_BOTTOM + 4;

  page.drawText(safe(toTitleCase(title)), {
    x: MARGIN_H,
    y: footerTextY,
    size: 7,
    font: fonts.regular,
    color: MID,
  });

  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateW = fonts.regular.widthOfTextAtSize(dateStr, 7);
  page.drawText(dateStr, {
    x: (PAGE_W - dateW) / 2,
    y: footerTextY,
    size: 7,
    font: fonts.regular,
    color: MID,
  });

  const footerRight = `* PAGE ${pageNum} / ${totalPages}`;
  const footerRightW = fonts.bold.widthOfTextAtSize(footerRight, 7);
  page.drawText(footerRight, {
    x: PAGE_W - MARGIN_H - footerRightW,
    y: footerTextY,
    size: 7,
    font: fonts.bold,
    color: INK,
  });
}

/** Draw a small mono label with wide letterspacing. Returns width drawn. */
function drawSpacedLabel(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  spacing = 1.6,
): number {
  let cx = x;
  for (const ch of safe(text)) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + spacing;
  }
  return cx - x;
}

/** Preload done-frame images for a shot list. Map: shot_number → image. */
async function loadShotImages(
  pdfDoc: PDFDocument,
  shots: ParsedStoryboard['shots'],
  keyFrames: ShotKeyFrames,
): Promise<Map<number, PDFImage | null>> {
  const urls = shots.map((shot) => {
    const frame = keyFrames[String(shot.shot_number)];
    return frame && frame.status === 'done' && frame.url ? frame.url : null;
  });
  const images = await embedImagesBatch(pdfDoc, urls);
  const map = new Map<number, PDFImage | null>();
  shots.forEach((shot, i) => map.set(shot.shot_number, images[i] ?? null));
  return map;
}

// ============================================================================
// SHOOTING BOARD — 3×2 grid with camera grammar under every frame
// ============================================================================

async function buildShootingPages(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  parsed: ParsedStoryboard,
  keyFrames: ShotKeyFrames,
): Promise<void> {
  const COLS = 3;
  const ROWS = 2;
  const COL_GAP = 10;
  const ROW_GAP = 16;

  const contentW = PAGE_W - 2 * MARGIN_H;
  const cellW = (contentW - (COLS - 1) * COL_GAP) / COLS;
  const imgH = cellW * 9 / 16;

  const gridTopY = PAGE_H - MARGIN_TOP - HEADER_H - SCENE_GAP - 18 - SCENE_GAP;
  const gridBottomY = MARGIN_BOTTOM + FOOTER_H + SCENE_GAP;
  const gridH = gridTopY - gridBottomY;
  const cellH = (gridH - (ROWS - 1) * ROW_GAP) / ROWS;

  const shots = parsed.shots;
  const title = parsed.title;
  const SHOTS_PER_PAGE = COLS * ROWS;
  const totalPages = Math.ceil(shots.length / SHOTS_PER_PAGE);

  const imageMap = await loadShotImages(pdfDoc, shots, keyFrames);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const pageShots = shots.slice(pageIdx * SHOTS_PER_PAGE, (pageIdx + 1) * SHOTS_PER_PAGE);

    const firstShot = pageShots[0]?.shot_number ?? pageIdx * SHOTS_PER_PAGE + 1;
    const lastShot = pageShots[pageShots.length - 1]?.shot_number ?? Math.min((pageIdx + 1) * SHOTS_PER_PAGE, shots.length);
    const firstShotPad = String(firstShot).padStart(2, '0');
    const lastShotPad = String(lastShot).padStart(2, '0');

    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const hairlineY = drawHeader(
      page, fonts, title,
      `SC.${firstShotPad}-${lastShotPad} · ${parsed.style_lock.aspect_ratio} · SHOOTING BOARD`,
    );

    // Shot count row
    const shotRowY = hairlineY - SCENE_GAP - 14;
    const shotsLabel = `SHOTS ${firstShotPad}-${lastShotPad}`;
    page.drawText(shotsLabel, { x: MARGIN_H, y: shotRowY, size: 8, font: fonts.bold, color: INK });
    const pageLabel = `PAGE ${pageNum} / ${totalPages}`;
    const pageLabelW = fonts.regular.widthOfTextAtSize(pageLabel, 8);
    page.drawText(pageLabel, { x: PAGE_W - MARGIN_H - pageLabelW, y: shotRowY, size: 8, font: fonts.regular, color: INK });
    const shotsLabelW = fonts.bold.widthOfTextAtSize(shotsLabel, 8);
    page.drawLine({
      start: { x: MARGIN_H + shotsLabelW + 8, y: shotRowY + 3 },
      end: { x: PAGE_W - MARGIN_H - pageLabelW - 8, y: shotRowY + 3 },
      thickness: 0.5,
      color: DIM,
    });

    for (let i = 0; i < pageShots.length; i++) {
      const shot = pageShots[i]!;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const cellX = MARGIN_H + col * (cellW + COL_GAP);
      const cellTopY = gridTopY - row * (cellH + ROW_GAP);
      const cellBottomY = cellTopY - cellH;
      const imageBottomY = cellTopY - imgH;

      drawFramedImage(page, imageMap.get(shot.shot_number) ?? null, cellX, imageBottomY, cellW, imgH);

      const TEXT_LINE_H = 10;
      const TEXT_MARGIN = 2;
      let textCursorY = imageBottomY - 8;

      // Shot number + descriptor
      const shotNum = (shot.shot_label ?? String(shot.shot_number).padStart(2, '0'));
      const metaLines = wrapText(`${safe(shotNum)}  ${safe(shot.descriptor)}`, cellW, fonts.regular, 7);
      for (const line of metaLines) {
        if (textCursorY - TEXT_LINE_H < cellBottomY + TEXT_MARGIN) break;
        page.drawText(line, { x: cellX, y: textCursorY, size: 7, font: fonts.regular, color: rgb(0.2, 0.2, 0.2) });
        textCursorY -= TEXT_LINE_H;
      }

      // Camera grammar — the line that makes this a shooting board
      const g = shot.grammar;
      const grammarText = safe(`${g.scale} | ${g.lens} | ${g.camera_move} | ${g.screen_direction}`.toUpperCase());
      const grammarLines = wrapText(grammarText, cellW, fonts.mono, 5.5);
      for (const line of grammarLines.slice(0, 2)) {
        if (textCursorY - 8 < cellBottomY + TEXT_MARGIN) break;
        page.drawText(line, { x: cellX, y: textCursorY, size: 5.5, font: fonts.mono, color: MID });
        textCursorY -= 8;
      }

      // VO / dialogue
      if (shot.dialogue_vo) {
        const voLines = wrapText(safe(`"${shot.dialogue_vo}"`), cellW, fonts.italic, 6.5);
        for (const line of voLines) {
          if (textCursorY - 9 < cellBottomY + TEXT_MARGIN) break;
          page.drawText(line, { x: cellX, y: textCursorY, size: 6.5, font: fonts.italic, color: rgb(0.35, 0.35, 0.35) });
          textCursorY -= 9;
        }
      }
    }

    drawFooter(page, fonts, title, pageNum, totalPages);
  }
}

// ============================================================================
// TREATMENT — cover + narrative, then one large frame per page with prose
// ============================================================================

async function buildTreatmentPages(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  parsed: ParsedStoryboard,
  keyFrames: ShotKeyFrames,
): Promise<void> {
  const title = parsed.title;
  const shots = parsed.shots;
  const totalPages = shots.length + 1; // cover + one per shot

  const imageMap = await loadShotImages(pdfDoc, shots, keyFrames);

  // ── Cover ──────────────────────────────────────────────────────────────────
  {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER_TINT });

    drawSpacedLabel(page, fonts.bold, 'LOOMER', MARGIN_H, PAGE_H - MARGIN_TOP, 7);
    const label = 'DIRECTOR\'S TREATMENT';
    const labelSize = 8;
    let labelW = 0;
    for (const ch of label) labelW += fonts.regular.widthOfTextAtSize(ch, labelSize) + 1.6;
    drawSpacedLabel(page, fonts.regular, label, PAGE_W - MARGIN_H - labelW, PAGE_H - MARGIN_TOP, labelSize, MID);

    // Title — big italic serif, centred
    const titleSize = 44;
    const safeTitle = safe(toTitleCase(title));
    const titleLines = wrapText(safeTitle, PAGE_W - 4 * MARGIN_H, fonts.italic, titleSize);
    let ty = PAGE_H * 0.62;
    for (const line of titleLines) {
      const w = fonts.italic.widthOfTextAtSize(line, titleSize);
      page.drawText(line, { x: (PAGE_W - w) / 2, y: ty, size: titleSize, font: fonts.italic, color: INK });
      ty -= titleSize * 1.15;
    }

    // Brand / format / duration line
    const bits: string[] = [];
    if (parsed.brand) bits.push(parsed.brand.toUpperCase());
    if (parsed.format) bits.push(parsed.format.toUpperCase());
    if (parsed.duration_seconds) bits.push(`${parsed.duration_seconds}s`);
    bits.push(parsed.style_lock.aspect_ratio);
    const metaText = bits.join('  ·  ');
    const metaW = fonts.mono.widthOfTextAtSize(safe(metaText), 8);
    page.drawText(safe(metaText), { x: (PAGE_W - metaW) / 2, y: ty - 6, size: 8, font: fonts.mono, color: MID });

    // Narrative arc — centred measure
    const narrative = safe(parsed.narrative_arc);
    if (narrative) {
      const measure = 420;
      const narrLines = wrapText(narrative, measure, fonts.regular, 10);
      let ny = ty - 60;
      for (const line of narrLines) {
        const w = fonts.regular.widthOfTextAtSize(line, 10);
        page.drawText(line, { x: (PAGE_W - w) / 2, y: ny, size: 10, font: fonts.regular, color: rgb(0.25, 0.25, 0.25) });
        ny -= 16;
      }
    }

    // Look line at the base
    const look = safe(parsed.style_lock.look);
    if (look) {
      const lookLines = wrapText(look, 480, fonts.italic, 9);
      let ly = MARGIN_BOTTOM + FOOTER_H + 24;
      for (const line of lookLines.slice(0, 2).reverse()) {
        const w = fonts.italic.widthOfTextAtSize(line, 9);
        page.drawText(line, { x: (PAGE_W - w) / 2, y: ly, size: 9, font: fonts.italic, color: MID });
        ly += 13;
      }
    }

    drawFooter(page, fonts, title, 1, totalPages);
  }

  // ── One shot per page ──────────────────────────────────────────────────────
  const contentTop = PAGE_H - MARGIN_TOP - HEADER_H - SCENE_GAP;
  const contentBottom = MARGIN_BOTTOM + FOOTER_H + SCENE_GAP;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    const pageNum = i + 2;
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    const shotPad = shot.shot_label ?? String(shot.shot_number).padStart(2, '0');
    drawHeader(page, fonts, title, `SC.${shotPad} · ${parsed.style_lock.aspect_ratio} · TREATMENT`);

    // Large frame — left ~58% of content width, top-aligned
    const contentW = PAGE_W - 2 * MARGIN_H;
    const imgW = contentW * 0.58;
    const imgH2 = imgW * 9 / 16;
    const imgX = MARGIN_H;
    const imgTopY = contentTop - 8;
    const imgBottomY = imgTopY - imgH2;

    drawFramedImage(page, imageMap.get(shot.shot_number) ?? null, imgX, imgBottomY, imgW, imgH2);

    // Right column — prose
    const colX = imgX + imgW + 28;
    const colW = PAGE_W - MARGIN_H - colX;
    let cy = imgTopY - 12;

    // Shot number, small mono
    drawSpacedLabel(page, fonts.mono, `SHOT ${shotPad}`, colX, cy, 8, MID);
    cy -= 26;

    // Descriptor headline — italic serif
    const headSize = 19;
    for (const line of wrapText(safe(shot.descriptor), colW, fonts.italic, headSize)) {
      page.drawText(line, { x: colX, y: cy, size: headSize, font: fonts.italic, color: INK });
      cy -= headSize * 1.2;
    }
    cy -= 8;

    // Function — grey kicker
    for (const line of wrapText(safe(shot.function), colW, fonts.regular, 8.5)) {
      if (cy < contentBottom + 60) break;
      page.drawText(line, { x: colX, y: cy, size: 8.5, font: fonts.regular, color: MID });
      cy -= 13;
    }
    cy -= 10;

    // Action beat — main prose
    for (const line of wrapText(safe(shot.action_beat), colW, fonts.regular, 10)) {
      if (cy < contentBottom + 30) break;
      page.drawText(line, { x: colX, y: cy, size: 10, font: fonts.regular, color: rgb(0.2, 0.2, 0.2) });
      cy -= 15.5;
    }
    cy -= 10;

    // Dialogue / VO
    if (shot.dialogue_vo && cy > contentBottom + 20) {
      for (const line of wrapText(safe(`"${shot.dialogue_vo}"`), colW, fonts.italic, 10)) {
        if (cy < contentBottom + 10) break;
        page.drawText(line, { x: colX, y: cy, size: 10, font: fonts.italic, color: rgb(0.35, 0.35, 0.35) });
        cy -= 15;
      }
    }

    // Under the frame: quiet grammar line
    const g = shot.grammar;
    const grammarText = safe(`${g.scale}  ·  ${g.lens}  ·  ${g.camera_move}`.toUpperCase());
    page.drawText(grammarText, { x: imgX, y: imgBottomY - 14, size: 6.5, font: fonts.mono, color: DIM });

    drawFooter(page, fonts, title, pageNum, totalPages);
  }
}

// ============================================================================
// CLIENT BOARDS — 2×2 grid, frames + captions only, no technical fields
// ============================================================================

async function buildClientPages(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  parsed: ParsedStoryboard,
  keyFrames: ShotKeyFrames,
): Promise<void> {
  const COLS = 2;
  const ROWS = 2;
  const COL_GAP = 20;
  const ROW_GAP = 22;

  const contentW = PAGE_W - 2 * MARGIN_H;
  const cellW = (contentW - (COLS - 1) * COL_GAP) / COLS;
  const imgH = cellW * 9 / 16;

  const gridTopY = PAGE_H - MARGIN_TOP - HEADER_H - SCENE_GAP;
  const gridBottomY = MARGIN_BOTTOM + FOOTER_H + SCENE_GAP;
  const gridH = gridTopY - gridBottomY;
  const cellH = (gridH - (ROWS - 1) * ROW_GAP) / ROWS;

  const shots = parsed.shots;
  const title = parsed.title;
  const SHOTS_PER_PAGE = COLS * ROWS;
  const totalPages = Math.ceil(shots.length / SHOTS_PER_PAGE);

  const imageMap = await loadShotImages(pdfDoc, shots, keyFrames);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pageNum = pageIdx + 1;
    const pageShots = shots.slice(pageIdx * SHOTS_PER_PAGE, (pageIdx + 1) * SHOTS_PER_PAGE);
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    drawHeader(page, fonts, title, 'STORYBOARD');

    for (let i = 0; i < pageShots.length; i++) {
      const shot = pageShots[i]!;
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const cellX = MARGIN_H + col * (cellW + COL_GAP);
      const cellTopY = gridTopY - row * (cellH + ROW_GAP);
      const cellBottomY = cellTopY - cellH;
      const imageBottomY = cellTopY - imgH;

      drawFramedImage(page, imageMap.get(shot.shot_number) ?? null, cellX, imageBottomY, cellW, imgH);

      let textCursorY = imageBottomY - 12;
      const shotPad = shot.shot_label ?? String(shot.shot_number).padStart(2, '0');

      // Caption: number + descriptor, roomier type than the shooting board
      for (const line of wrapText(`${safe(shotPad)}   ${safe(shot.descriptor)}`, cellW, fonts.regular, 8.5)) {
        if (textCursorY - 12 < cellBottomY) break;
        page.drawText(line, { x: cellX, y: textCursorY, size: 8.5, font: fonts.regular, color: rgb(0.2, 0.2, 0.2) });
        textCursorY -= 12;
      }
      if (shot.dialogue_vo) {
        for (const line of wrapText(safe(`"${shot.dialogue_vo}"`), cellW, fonts.italic, 8)) {
          if (textCursorY - 11 < cellBottomY) break;
          page.drawText(line, { x: cellX, y: textCursorY, size: 8, font: fonts.italic, color: rgb(0.4, 0.4, 0.4) });
          textCursorY -= 11;
        }
      }
    }

    drawFooter(page, fonts, title, pageNum, totalPages);
  }
}

// ============================================================================
// LOOK BOOK — style lock typography + approved reference stills
// ============================================================================

async function buildLookbookPages(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  parsed: ParsedStoryboard,
  refStills: ReferenceStills,
): Promise<void> {
  const title = parsed.title;

  // Gather approved (selected) references grouped by entity type.
  type RefEntry = { name: string; url: string };
  const groups: { label: string; entries: RefEntry[] }[] = [
    { label: 'CHARACTERS', entries: [] },
    { label: 'LOCATIONS', entries: [] },
    { label: 'PROPS', entries: [] },
  ];
  for (const c of parsed.characters) {
    const url = refStills[c.id]?.selected;
    if (url) groups[0]!.entries.push({ name: c.name, url });
  }
  for (const l of parsed.locations) {
    const url = refStills[l.id]?.selected;
    if (url) groups[1]!.entries.push({ name: l.name, url });
  }
  for (const p of parsed.props) {
    const url = refStills[p.id]?.selected;
    if (url) groups[2]!.entries.push({ name: p.name, url });
  }
  const activeGroups = groups.filter((g) => g.entries.length > 0);

  // Grid geometry for ref pages: 3 columns.
  const COLS = 3;
  const COL_GAP = 14;
  const contentW = PAGE_W - 2 * MARGIN_H;
  const cellW = (contentW - (COLS - 1) * COL_GAP) / COLS;
  const imgH = cellW * 9 / 16;
  const cellH = imgH + 30;
  const ROW_GAP = 14;

  const gridTopY = PAGE_H - MARGIN_TOP - HEADER_H - SCENE_GAP - 20 - SCENE_GAP;
  const gridBottomY = MARGIN_BOTTOM + FOOTER_H + SCENE_GAP;
  const rowsPerPage = Math.max(1, Math.floor((gridTopY - gridBottomY + ROW_GAP) / (cellH + ROW_GAP)));
  const perPage = rowsPerPage * COLS;

  // Page count: 1 style page + ceil(entries/perPage) per group.
  const totalPages = 1 + activeGroups.reduce((n, g) => n + Math.ceil(g.entries.length / perPage), 0);
  let pageNum = 0;

  // ── Page 1: the look, typographically ─────────────────────────────────────
  {
    pageNum++;
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAPER_TINT });

    drawSpacedLabel(page, fonts.bold, 'LOOMER', MARGIN_H, PAGE_H - MARGIN_TOP, 7);
    const lbl = 'LOOK BOOK';
    let lblW = 0;
    for (const ch of lbl) lblW += fonts.regular.widthOfTextAtSize(ch, 8) + 1.6;
    drawSpacedLabel(page, fonts.regular, lbl, PAGE_W - MARGIN_H - lblW, PAGE_H - MARGIN_TOP, 8, MID);

    // Title
    const titleSize = 30;
    const safeTitle = safe(toTitleCase(title));
    const titleLines = wrapText(safeTitle, PAGE_W - 4 * MARGIN_H, fonts.italic, titleSize);
    let ty = PAGE_H - 118;
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN_H, y: ty, size: titleSize, font: fonts.italic, color: INK });
      ty -= titleSize * 1.15;
    }

    // Narrative arc under the title, left-set on a comfortable measure
    const narrative = safe(parsed.narrative_arc);
    if (narrative) {
      let ny = ty - 12;
      for (const line of wrapText(narrative, 460, fonts.regular, 9.5)) {
        page.drawText(line, { x: MARGIN_H, y: ny, size: 9.5, font: fonts.regular, color: rgb(0.3, 0.3, 0.3) });
        ny -= 14.5;
      }
      ty = ny;
    }

    // Style lock fields — two columns of label/value pairs
    const sl = parsed.style_lock;
    const fields: { label: string; value: string | null }[] = [
      { label: 'LOOK', value: sl.look },
      { label: 'DP REFERENCE', value: sl.dp_reference },
      { label: 'LENS DEFAULT', value: sl.lens_default },
      { label: 'COLOUR GRADE', value: sl.colour_grade },
      { label: 'FILM STOCK', value: sl.film_stock_feel },
      { label: 'LIGHTING', value: sl.lighting_register },
      { label: 'TEXTURE', value: sl.texture },
      { label: 'NEGATIVE STYLE', value: sl.negative_style },
    ];
    const present = fields.filter((f) => f.value);

    const colWidth = (contentW - 40) / 2;
    const startY = ty - 34;
    const colX = [MARGIN_H, MARGIN_H + colWidth + 40];
    const colY = [startY, startY];
    const half = Math.ceil(present.length / 2);

    present.forEach((f, idx) => {
      const c = idx < half ? 0 : 1;
      let y = colY[c]!;
      drawSpacedLabel(page, fonts.mono, f.label, colX[c]!, y, 6.5, MID, 1.2);
      y -= 12;
      for (const line of wrapText(safe(f.value), colWidth, fonts.regular, 9)) {
        page.drawText(line, { x: colX[c]!, y, size: 9, font: fonts.regular, color: INK });
        y -= 13;
      }
      colY[c] = y - 12;
    });

    drawFooter(page, fonts, title, pageNum, totalPages);
  }

  // ── Reference pages per group ──────────────────────────────────────────────
  for (const group of activeGroups) {
    const images = await embedImagesBatch(pdfDoc, group.entries.map((e) => e.url));

    for (let pageStart = 0; pageStart < group.entries.length; pageStart += perPage) {
      pageNum++;
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      const hairlineY = drawHeader(page, fonts, title, 'LOOK BOOK · REFERENCES');

      // Group label
      const groupRowY = hairlineY - SCENE_GAP - 14;
      drawSpacedLabel(page, fonts.bold, group.label, MARGIN_H, groupRowY, 8);

      const pageEntries = group.entries.slice(pageStart, pageStart + perPage);
      for (let i = 0; i < pageEntries.length; i++) {
        const entry = pageEntries[i]!;
        const img = images[pageStart + i] ?? null;
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        const cellX = MARGIN_H + col * (cellW + COL_GAP);
        const cellTopY = gridTopY - row * (cellH + ROW_GAP);
        const imageBottomY = cellTopY - imgH;

        drawFramedImage(page, img, cellX, imageBottomY, cellW, imgH);

        // Entity name — strip appearance descriptor after em/en dash
        const displayName = entry.name.split(/\s[—–]\s/)[0]?.trim() ?? entry.name;
        const nameLines = wrapText(safe(displayName), cellW, fonts.regular, 8);
        let nameY = imageBottomY - 12;
        for (const line of nameLines.slice(0, 2)) {
          page.drawText(line, { x: cellX, y: nameY, size: 8, font: fonts.regular, color: rgb(0.2, 0.2, 0.2) });
          nameY -= 11;
        }
      }

      drawFooter(page, fonts, title, pageNum, totalPages);
    }
  }
}

// ============================================================================
// Route handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;
  const accessError = await assertStoryboardAccess(getDb(), id, auth);
  if (accessError) return accessError;


  const layoutParam = request.nextUrl.searchParams.get('layout');
  const layout: PdfLayout =
    layoutParam === 'treatment' || layoutParam === 'client' || layoutParam === 'lookbook'
      ? layoutParam
      : 'shooting';

  const db = getDb();
  const row = await db.storyboard.findUnique({
    where: { id },
    select: { title: true, parsed_json: true },
  });

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

  const keyFrames: ShotKeyFrames = await getShotFrames(db, id);
  const refStills: ReferenceStills = layout === 'lookbook' ? await getReferenceStills(db, id) : {};

  try {
    const pdfDoc = await PDFDocument.create();

    const fonts: Fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
      mono: await pdfDoc.embedFont(StandardFonts.Courier),
    };

    switch (layout) {
      case 'treatment':
        await buildTreatmentPages(pdfDoc, fonts, parsed, keyFrames);
        break;
      case 'client':
        await buildClientPages(pdfDoc, fonts, parsed, keyFrames);
        break;
      case 'lookbook':
        await buildLookbookPages(pdfDoc, fonts, parsed, refStills);
        break;
      default:
        await buildShootingPages(pdfDoc, fonts, parsed, keyFrames);
    }

    const pdfBytes = await pdfDoc.save();

    const suffix = layout === 'shooting' ? 'shooting-board'
      : layout === 'treatment' ? 'treatment'
      : layout === 'client' ? 'boards'
      : 'look-book';
    const filename = `${slugify(parsed.title || row.title)}-${suffix}.pdf`;

    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('PDF generation failed:', message);
    return Response.json({ error: 'PDF generation failed', details: message }, { status: 500 });
  }
}
