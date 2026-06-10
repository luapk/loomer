'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Download, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnimaticProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shots: any[];
  shotKeyFrames: Record<string, { status: string; url: string | null }>;
  storyboardTitle: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fallback duration in seconds based on shot scale (grammar.scale). */
function fallbackDuration(scale: string | undefined): number {
  if (!scale) return 3;
  const s = scale.toUpperCase();
  if (s === 'CU' || s === 'ECU') return 2;
  if (s === 'WS' || s === 'EWS') return 4;
  return 3;
}

/** Effective hold duration for a shot in milliseconds, with speed multiplier. */
function holdMs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shot: any,
  speed: number,
): number {
  const raw: number =
    typeof shot?.estimated_duration_seconds === 'number'
      ? shot.estimated_duration_seconds
      : fallbackDuration(shot?.grammar?.scale as string | undefined);
  return (raw / speed) * 1000;
}

/** Zero-pad a number to at least 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];

const CANVAS_W = 1280;
const CANVAS_H = 720;
const EXPORT_FPS = 30;

// ─── Component ────────────────────────────────────────────────────────────────

export function Animatic({ shots, shotKeyFrames, storyboardTitle }: AnimaticProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0); // 0–1
  const [mediaRecorderSupported] = useState(() => typeof MediaRecorder !== 'undefined');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  const totalShots = shots.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentShot: any = shots[currentIndex] ?? null;
  const shotKey = currentShot ? String(currentShot.shot_number) : null;
  const frameData = shotKey ? (shotKeyFrames[shotKey] ?? null) : null;
  const frameUrl = frameData?.status === 'done' ? frameData.url : null;

  // ── Playback timer ──────────────────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= shots.length) {
        // End of animatic — stop
        setPlaying(false);
        return prev;
      }
      return next;
    });
  }, [shots.length]);

  // Schedule the next advance whenever playing/currentIndex/speed change
  useEffect(() => {
    clearTimer();
    if (!playing) return;
    if (!currentShot) { setPlaying(false); return; }
    const delay = holdMs(currentShot, speed);
    timerRef.current = setTimeout(advance, delay);
    return clearTimer;
  }, [playing, currentIndex, speed, currentShot, advance, clearTimer]);

  // ── Keyboard shortcut (spacebar) ────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only capture space when not in a form element
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'BUTTON'
      ) {
        e.preventDefault();
        setPlaying((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Controls ────────────────────────────────────────────────────────────────

  function goTo(index: number) {
    clearTimer();
    const clamped = Math.max(0, Math.min(shots.length - 1, index));
    setCurrentIndex(clamped);
    // Don't stop play — let the effect reschedule
  }

  function togglePlay() {
    if (currentIndex >= shots.length - 1 && !playing) {
      // Restart from beginning
      setCurrentIndex(0);
    }
    setPlaying((v) => !v);
  }

  // ── Progress bar ────────────────────────────────────────────────────────────
  const progressPct = totalShots > 1 ? (currentIndex / (totalShots - 1)) * 100 : 0;

  // ── Shot label ──────────────────────────────────────────────────────────────
  const shotLabel: string = currentShot
    ? currentShot.shot_label
      ? `Shot ${currentShot.shot_label}`
      : `Shot ${pad2(currentShot.shot_number as number)}`
    : '—';

  const descriptor: string =
    (currentShot?.descriptor as string | undefined) ??
    (currentShot?.grammar?.scale as string | undefined) ??
    '';

  const dialogue: string = (currentShot?.dialogue as string | undefined) ?? '';

  // ── Canvas export ───────────────────────────────────────────────────────────

  async function doExport() {
    if (exporting) return;
    setExporting(true);
    setExportProgress(0);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d')!;

    const stream = canvas.captureStream(EXPORT_FPS);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.start();

      (async () => {
        const EXPORT_SPEED = 2;

        for (let i = 0; i < shots.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const shot: any = shots[i];
          const key = String(shot.shot_number);
          const frame = shotKeyFrames[key];
          const url = frame?.status === 'done' ? frame.url : null;

          setExportProgress(i / shots.length);

          // Load the image (with CORS) if we have a URL
          let img: HTMLImageElement | null = null;
          if (url) {
            img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((res, _rej) => {
              img!.onload = () => res();
              img!.onerror = () => res(); // degrade gracefully
              img!.src = url;
            });
            if (img.naturalWidth === 0) img = null; // load failed
          }

          // Figure out how many frames to draw for this shot
          const holdSec = holdMs(shot, EXPORT_SPEED) / 1000;
          const frameCount = Math.max(1, Math.round(holdSec * EXPORT_FPS));

          for (let f = 0; f < frameCount; f++) {
            // Background
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

            if (img) {
              // Cover-fit the image into the canvas
              const imgAspect = img.naturalWidth / img.naturalHeight;
              const canvasAspect = CANVAS_W / CANVAS_H;
              let drawW: number, drawH: number, drawX: number, drawY: number;
              if (imgAspect > canvasAspect) {
                drawH = CANVAS_H;
                drawW = drawH * imgAspect;
                drawX = (CANVAS_W - drawW) / 2;
                drawY = 0;
              } else {
                drawW = CANVAS_W;
                drawH = drawW / imgAspect;
                drawX = 0;
                drawY = (CANVAS_H - drawH) / 2;
              }
              ctx.drawImage(img, drawX, drawY, drawW, drawH);
            } else {
              // Placeholder: shot number centered
              ctx.fillStyle = '#1c1c1c';
              ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
              ctx.fillStyle = '#555';
              ctx.font = `bold 48px "JetBrains Mono", monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const label = shot.shot_label
                ? `Shot ${shot.shot_label as string}`
                : `Shot ${pad2(shot.shot_number as number)}`;
              ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2);
            }

            // Subtitle overlay
            const dlg: string = (shot.dialogue as string | undefined) ?? '';
            if (dlg.trim()) {
              const lines = wrapText(ctx, dlg, CANVAS_W - 120, '28px "Newsreader", serif');
              const lineH = 38;
              const boxH = lines.length * lineH + 24;
              const boxY = CANVAS_H - boxH - 40;

              ctx.fillStyle = 'rgba(0,0,0,0.72)';
              roundRect(ctx, 60, boxY - 4, CANVAS_W - 120, boxH + 8, 8);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = '28px "Newsreader", serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              lines.forEach((line, li) => {
                ctx.fillText(line, CANVAS_W / 2, boxY + lineH * li + lineH);
              });
            }

            // Force the MediaRecorder to grab this frame
            await new Promise<void>((res) => setTimeout(res, 1000 / EXPORT_FPS));
          }
        }

        setExportProgress(1);
        recorder.stop();
      })().catch(() => recorder.stop());
    });

    const blob = new Blob(chunks, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const safeName = storyboardTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `${safeName}-animatic.webm`;
    a.click();
    URL.revokeObjectURL(blobUrl);

    setExporting(false);
    setExportProgress(0);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!shots || shots.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center text-stone-400">
        <p className="text-sm">No shots to play. Generate a storyboard first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Player card */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Frame area */}
        <div className="relative w-full aspect-video bg-stone-900 select-none">
          {frameUrl ? (
            <img
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ref={(el) => { if (el) imgRefs.current.set(currentIndex, el); }}
              src={frameUrl}
              alt={`${shotLabel} — ${descriptor}`}
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            /* Placeholder */
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {frameData?.status === 'generating' ? (
                <>
                  <Loader2 className="h-6 w-6 text-stone-500 animate-spin" />
                  <p
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}
                    className="text-stone-500"
                  >
                    Rendering…
                  </p>
                </>
              ) : (
                <>
                  <p
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, letterSpacing: '0.04em', fontWeight: 'bold' }}
                    className="text-stone-600"
                  >
                    {currentShot?.shot_label
                      ? `Shot ${currentShot.shot_label as string}`
                      : `Shot ${pad2((currentShot?.shot_number as number | undefined) ?? 0)}`}
                  </p>
                  {descriptor && (
                    <p
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}
                      className="text-stone-600 max-w-xs text-center"
                    >
                      {descriptor}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Dialogue subtitle overlay */}
          {dialogue.trim() && (
            <div
              className="absolute inset-x-0 bottom-6 px-8 flex justify-center pointer-events-none"
            >
              <div className="bg-black/70 rounded-lg px-4 py-2 max-w-2xl">
                <p
                  style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 16, lineHeight: 1.45, color: '#ffffff' }}
                  className="text-center"
                >
                  {dialogue}
                </p>
              </div>
            </div>
          )}

          {/* Shot counter — top-right corner */}
          <div className="absolute top-3 right-3 bg-black/60 rounded px-2 py-1">
            <span
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em' }}
              className="text-white/80"
            >
              {pad2(currentIndex + 1)} / {pad2(totalShots)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-stone-200 relative">
          <div
            className="absolute inset-y-0 left-0 bg-stone-800 transition-all duration-150"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Controls bar */}
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* Prev / Play / Next */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous shot"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition-colors"
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
            >
              {playing
                ? <Pause className="h-3.5 w-3.5" />
                : <Play className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex === totalShots - 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next shot"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Shot info */}
          <div className="flex-1 min-w-0">
            <p
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}
              className="text-stone-600 truncate"
            >
              {shotLabel}{descriptor ? ` — ${descriptor}` : ''}
            </p>
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`h-6 px-2 rounded text-xs transition-colors ${
                  speed === s
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.1em' }}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Export button */}
          {mediaRecorderSupported ? (
            <button
              type="button"
              onClick={() => { void doExport(); }}
              disabled={exporting}
              className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}
            >
              {exporting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {Math.round(exportProgress * 100)}%
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  Export MP4
                </>
              )}
            </button>
          ) : (
            <span
              className="text-xs text-stone-400"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.12em' }}
            >
              Export not supported in this browser
            </span>
          )}
        </div>
      </div>

      {/* Shot strip — thumbnail filmstrip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shots.map((shot, idx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = shot as any;
          const k = String(s.shot_number);
          const f = shotKeyFrames[k];
          const url = f?.status === 'done' ? f.url : null;
          const isActive = idx === currentIndex;

          return (
            <button
              key={k}
              type="button"
              onClick={() => { clearTimer(); setCurrentIndex(idx); }}
              className={`flex-shrink-0 w-20 rounded-lg overflow-hidden border-2 transition-colors ${
                isActive
                  ? 'border-stone-900'
                  : 'border-transparent hover:border-stone-300'
              }`}
              title={s.shot_label ? `Shot ${s.shot_label as string}` : `Shot ${pad2(s.shot_number as number)}`}
            >
              <div className="aspect-video bg-stone-800 relative">
                {url ? (
                  <img
                    src={url}
                    alt=""
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: '0.08em' }}
                      className="text-stone-500"
                    >
                      {s.shot_label ?? pad2(s.shot_number as number)}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

/** Word-wrap text to fit within maxWidth on the given canvas context. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draw a rounded rectangle path (does not stroke/fill). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
