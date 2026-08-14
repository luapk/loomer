/**
 * Flattens an end card in the browser.
 *
 * Runs on a canvas rather than server-side so no image library is needed
 * anywhere. The result is uploaded as an ordinary PNG, which means PDF export,
 * the ZIP, the share view and the animatic all consume one URL and know
 * nothing about layers.
 */

export type EndCardSettings = {
  mode: 'upload' | 'overlay';
  /** Uploaded card (upload mode) or transparent logo (overlay mode). */
  imageUrl: string | null;
  endline: string | null;
  logoScale: number;
  logoX: number;
  logoY: number;
  /** 'last_frame' or a hex colour. Overlay mode only. */
  background: string;
};

/** 16:9 at a size that holds up in a PDF without being wasteful. */
const WIDTH = 1920;
const HEIGHT = 1080;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Blob URLs are same-origin-ish but canvas taints without this, and a
    // tainted canvas can't be exported.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

/** Draws `img` to fill the frame, cropping overflow (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

/**
 * Renders the card and returns it as a PNG blob.
 *
 * `lastFrameUrl` is the board's final rendered frame, used as the bed in
 * overlay mode when `background` is 'last_frame'.
 */
export async function compositeEndCard(
  settings: EndCardSettings,
  lastFrameUrl: string | null,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser');

  // 1. The bed.
  if (settings.mode === 'upload' && settings.imageUrl) {
    drawCover(ctx, await loadImage(settings.imageUrl));
  } else if (settings.background === 'last_frame' && lastFrameUrl) {
    drawCover(ctx, await loadImage(lastFrameUrl));
    // Knock the frame back so a logo and endline read cleanly over it.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    ctx.fillStyle = settings.background === 'last_frame' ? '#000000' : settings.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // 2. The logo — overlay mode only; in upload mode the image is the bed.
  if (settings.mode === 'overlay' && settings.imageUrl) {
    const logo = await loadImage(settings.imageUrl);
    const targetWidth = WIDTH * settings.logoScale;
    const targetHeight = targetWidth * (logo.height / logo.width);
    ctx.drawImage(
      logo,
      WIDTH * settings.logoX - targetWidth / 2,
      HEIGHT * settings.logoY - targetHeight / 2,
      targetWidth,
      targetHeight,
    );
  }

  // 3. The endline, sitting below the logo.
  if (settings.endline) {
    const fontSize = Math.round(HEIGHT * 0.055);
    ctx.font = `${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A soft shadow keeps it legible over a busy frame without a hard box.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = fontSize * 0.4;

    const lines = wrapText(ctx, settings.endline, WIDTH * 0.8);
    const lineHeight = fontSize * 1.35;
    // Below the logo in overlay mode, centred otherwise.
    const anchorY = settings.mode === 'overlay' && settings.imageUrl
      ? HEIGHT * settings.logoY + HEIGHT * settings.logoScale * 0.4 + lineHeight
      : HEIGHT / 2;
    const startY = anchorY - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
    });
    ctx.shadowBlur = 0;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/png',
    );
  });
}

/** Greedy word wrap to a pixel width. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}
