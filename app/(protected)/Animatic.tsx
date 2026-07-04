'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Download, Loader2, Music, X, Blend,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnimaticProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shots: any[];
  shotKeyFrames: Record<string, { status: string; url: string | null }>;
  storyboardTitle: string;
  storyboardId?: string;
  initialAudioUrl?: string | null;
  initialTrimStart?: number;
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

/** Hold duration for a shot in milliseconds at 1× (no speed applied). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function holdMs1x(shot: any): number {
  const raw: number =
    typeof shot?.estimated_duration_seconds === 'number'
      ? shot.estimated_duration_seconds
      : fallbackDuration(shot?.grammar?.scale as string | undefined);
  return raw * 1000;
}

/** Zero-pad a number to at least 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const EXPORT_FPS = 30;
const DISSOLVE_S = 0.6; // cross-dissolve length in seconds

// ─── Component ────────────────────────────────────────────────────────────────

export function Animatic({
  shots,
  shotKeyFrames,
  storyboardTitle,
  storyboardId,
  initialAudioUrl = null,
  initialTrimStart = 0,
}: AnimaticProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [dissolve, setDissolve] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0); // 0–1
  const [mediaRecorderSupported] = useState(() => typeof MediaRecorder !== 'undefined');

  // Music track
  const [audioUrl, setAudioUrl] = useState<string | null>(initialAudioUrl);
  const [trimStart, setTrimStart] = useState(initialTrimStart);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<{ peaks: number[]; duration: number } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const trimSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Previous frame URL for the dissolve overlay.
  const prevUrlRef = useRef<string | null>(null);
  const [overlay, setOverlay] = useState<{ url: string; key: number } | null>(null);

  const totalShots = shots.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentShot: any = shots[currentIndex] ?? null;
  const shotKey = currentShot ? String(currentShot.shot_number) : null;
  const frameData = shotKey ? (shotKeyFrames[shotKey] ?? null) : null;
  const frameUrl = frameData?.status === 'done' ? frameData.url : null;

  // Cumulative 1× timeline milliseconds at the start of shot `index`.
  const cumulativeMs = useCallback(
    (index: number): number => {
      let ms = 0;
      for (let i = 0; i < index && i < shots.length; i++) ms += holdMs1x(shots[i]);
      return ms;
    },
    [shots],
  );

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
    const delay = holdMs1x(currentShot) / speed;
    timerRef.current = setTimeout(advance, delay);
    return clearTimer;
  }, [playing, currentIndex, speed, currentShot, advance, clearTimer]);

  // Dissolve overlay: when the frame URL changes during playback, fade the
  // previous frame out over the new one.
  useEffect(() => {
    const prev = prevUrlRef.current;
    prevUrlRef.current = frameUrl;
    if (dissolve && playing && prev && prev !== frameUrl) {
      setOverlay({ url: prev, key: Date.now() });
    }
  }, [frameUrl, dissolve, playing]);

  // ── Music playback sync ─────────────────────────────────────────────────────

  // Keep the audio element aligned with the shot timeline: audio time =
  // trimStart + cumulative-1×-timeline. playbackRate follows the speed
  // selector so 2× picture means 2× music.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.playbackRate = speed;
    if (playing) {
      el.currentTime = trimStart + cumulativeMs(currentIndex) / 1000;
      void el.play().catch(() => { /* autoplay policy — ignore */ });
    } else {
      el.pause();
    }
    // Deliberately not depending on currentIndex: within continuous playback
    // the element free-runs (no per-shot seeks, which would stutter).
  }, [playing, audioUrl, speed]); // eslint-disable-line

  // On manual seek while playing, re-align the audio.
  const alignAudio = useCallback((index: number) => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.currentTime = trimStart + cumulativeMs(index) / 1000;
  }, [audioUrl, trimStart, cumulativeMs]);

  // ── Waveform decoding ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!audioUrl) { setWaveform(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(audioUrl);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        if (cancelled) return;
        const channel = audio.getChannelData(0);
        const BUCKETS = 240;
        const bucketSize = Math.floor(channel.length / BUCKETS);
        const peaks: number[] = [];
        for (let i = 0; i < BUCKETS; i++) {
          let max = 0;
          const start = i * bucketSize;
          // Sample sparsely inside the bucket — full scan is unnecessary for a preview.
          for (let j = start; j < start + bucketSize; j += 32) {
            const v = Math.abs(channel[j] ?? 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        setWaveform({ peaks, duration: audio.duration });
      } catch {
        if (!cancelled) setWaveform(null);
      }
    })();
    return () => { cancelled = true; };
  }, [audioUrl]);

  // ── Music upload / trim / remove ────────────────────────────────────────────

  async function handleAudioUpload(file: File) {
    if (!storyboardId) return;
    setAudioUploading(true);
    setAudioError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/storyboard/${storyboardId}/audio`, { method: 'POST', body: form });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setAudioError(data.error ?? 'Upload failed');
        return;
      }
      const data = (await res.json()) as { url: string };
      setAudioUrl(data.url);
      setTrimStart(0);
    } catch {
      setAudioError('Network error during upload');
    } finally {
      setAudioUploading(false);
    }
  }

  function handleTrimChange(seconds: number) {
    setTrimStart(seconds);
    alignAudio(currentIndex);
    if (!storyboardId) return;
    if (trimSaveTimer.current) clearTimeout(trimSaveTimer.current);
    trimSaveTimer.current = setTimeout(() => {
      void fetch(`/api/storyboard/${storyboardId}/audio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimStart: seconds }),
      });
    }, 600);
  }

  async function handleAudioRemove() {
    if (!storyboardId) return;
    setAudioUrl(null);
    setTrimStart(0);
    setWaveform(null);
    await fetch(`/api/storyboard/${storyboardId}/audio`, { method: 'DELETE' });
  }

  // ── Keyboard shortcut (spacebar) ────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'BUTTON' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'A'
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
    alignAudio(clamped);
  }

  function togglePlay() {
    if (currentIndex >= shots.length - 1 && !playing) {
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

    // Mix the music track into the recording, honouring the trim-in point.
    let audioCtx: AudioContext | null = null;
    let audioSource: AudioBufferSourceNode | null = null;
    if (audioUrl) {
      try {
        audioCtx = new AudioContext();
        const res = await fetch(audioUrl);
        const buf = await res.arrayBuffer();
        const audioBuf = await audioCtx.decodeAudioData(buf);
        const dest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = audioBuf;
        audioSource.connect(dest);
        const track = dest.stream.getAudioTracks()[0];
        if (track) stream.addTrack(track);
      } catch {
        audioCtx = null;
        audioSource = null;
      }
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    // Preload every frame image up front so dissolves have both frames ready.
    const loadImage = (url: string): Promise<HTMLImageElement | null> =>
      new Promise((res) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img.naturalWidth > 0 ? img : null);
        img.onerror = () => res(null);
        img.src = url;
      });
    const exportImages: (HTMLImageElement | null)[] = await Promise.all(
      shots.map((shot) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const frame = shotKeyFrames[String((shot as any).shot_number)];
        const url = frame?.status === 'done' ? frame.url : null;
        return url ? loadImage(url) : Promise.resolve(null);
      }),
    );

    const drawFrame = (img: HTMLImageElement | null, shotIdx: number, alpha = 1) => {
      ctx.globalAlpha = alpha;
      if (img) {
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
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = '#555';
        ctx.font = `bold 72px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s: any = shots[shotIdx];
        const label = s?.shot_label
          ? `Shot ${s.shot_label as string}`
          : `Shot ${pad2((s?.shot_number as number | undefined) ?? 0)}`;
        ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2);
      }
      ctx.globalAlpha = 1;
    };

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.start();
      // Music starts at the trim-in point, in lockstep with frame 0.
      if (audioSource) audioSource.start(0, trimStart);

      (async () => {
        const dissolveFrames = dissolve ? Math.round(DISSOLVE_S * EXPORT_FPS) : 0;

        for (let i = 0; i < shots.length; i++) {
          setExportProgress(i / shots.length);
          const img = exportImages[i] ?? null;
          const nextImg = i + 1 < shots.length ? (exportImages[i + 1] ?? null) : null;
          const hasDissolveOut = dissolveFrames > 0 && i + 1 < shots.length;

          const holdSec = holdMs1x(shots[i]) / 1000;
          const frameCount = Math.max(1, Math.round(holdSec * EXPORT_FPS));
          const solidFrames = hasDissolveOut ? Math.max(1, frameCount - dissolveFrames) : frameCount;

          for (let f = 0; f < frameCount; f++) {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
            drawFrame(img, i);

            // Cross-dissolve: blend the next shot in over the tail frames.
            if (hasDissolveOut && f >= solidFrames) {
              const t = (f - solidFrames + 1) / dissolveFrames;
              drawFrame(nextImg, i + 1, Math.min(1, t));
            }

            // Subtitle overlay
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dlg: string = ((shots[i] as any).dialogue as string | undefined) ?? '';
            if (dlg.trim()) {
              const lines = wrapText(ctx, dlg, CANVAS_W - 180, '42px "Newsreader", serif');
              const lineH = 57;
              const boxH = lines.length * lineH + 36;
              const boxY = CANVAS_H - boxH - 60;

              ctx.fillStyle = 'rgba(0,0,0,0.72)';
              roundRect(ctx, 90, boxY - 6, CANVAS_W - 180, boxH + 12, 12);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = '42px "Newsreader", serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              lines.forEach((line, li) => {
                ctx.fillText(line, CANVAS_W / 2, boxY + lineH * li + lineH);
              });
            }

            // Real-time pacing keeps the music in sync with the picture.
            await new Promise<void>((res) => setTimeout(res, 1000 / EXPORT_FPS));
          }
        }

        setExportProgress(1);
        recorder.stop();
      })().catch(() => recorder.stop());
    });

    if (audioSource) { try { audioSource.stop(); } catch { /* already stopped */ } }
    if (audioCtx) { void audioCtx.close(); }

    const blob = new Blob(chunks, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const safeName = storyboardTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `${safeName}-${audioUrl ? 'mood-film' : 'animatic'}.webm`;
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

  const trimFraction = waveform && waveform.duration > 0 ? trimStart / waveform.duration : 0;

  return (
    <div className="space-y-4">
      {/* Dissolve fade-out animation for the overlay frame */}
      <style>{`@keyframes animatic-fade-out { from { opacity: 1; } to { opacity: 0; } }`}</style>

      {/* Hidden audio element for playback */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" />
      )}

      {/* Player card */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Frame area */}
        <div className="relative w-full aspect-video bg-stone-900 select-none">
          {frameUrl ? (
            <img
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

          {/* Cross-dissolve overlay: previous frame fading out */}
          {overlay && (
            <img
              key={overlay.key}
              src={overlay.url}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ animation: `animatic-fade-out ${DISSOLVE_S}s ease-out forwards` }}
              onAnimationEnd={() => setOverlay(null)}
            />
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

          {/* Dissolve toggle */}
          <button
            type="button"
            onClick={() => setDissolve((v) => !v)}
            className={`h-8 px-2.5 flex items-center gap-1.5 rounded-lg border transition-colors ${
              dissolve
                ? 'bg-stone-900 text-white border-stone-900'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.1em' }}
            title="Cross-dissolve between shots"
          >
            <Blend className="h-3 w-3" />
            DISSOLVE
          </button>

          {/* Music */}
          {storyboardId && (
            <>
              <input
                ref={audioFileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAudioUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => audioFileInputRef.current?.click()}
                disabled={audioUploading}
                className={`h-8 px-2.5 flex items-center gap-1.5 rounded-lg border transition-colors ${
                  audioUrl
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.1em' }}
                title={audioUrl ? 'Replace music track' : 'Add music track'}
              >
                {audioUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music className="h-3 w-3" />}
                {audioUrl ? 'MUSIC' : 'ADD MUSIC'}
              </button>
            </>
          )}

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
              title="Exports in real time — keep this tab in the foreground"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {Math.round(exportProgress * 100)}%
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  Export 1080p
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

        {/* Music strip — waveform with trim-in point */}
        {audioUrl && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative h-12 rounded-lg bg-stone-100 overflow-hidden">
                {waveform ? (
                  <>
                    <WaveformCanvas peaks={waveform.peaks} trimFraction={trimFraction} />
                    <button
                      type="button"
                      className="absolute inset-0 w-full h-full cursor-crosshair"
                      title="Click to set where the music starts"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const frac = (e.clientX - rect.left) / rect.width;
                        handleTrimChange(Math.max(0, Math.min(1, frac)) * waveform.duration);
                      }}
                    />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <span
                  className="text-stone-500 tabular-nums"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.08em' }}
                >
                  IN {trimStart.toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={() => { void handleAudioRemove(); }}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 transition-colors"
                  title="Remove music"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            {audioError && <p className="text-xs text-red-600 mt-1.5">{audioError}</p>}
          </div>
        )}
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
              onClick={() => goTo(idx)}
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
                    loading="lazy"
                    decoding="async"
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

// ─── Waveform canvas ─────────────────────────────────────────────────────────

function WaveformCanvas({ peaks, trimFraction }: { peaks: number[]; trimFraction: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const barW = w / peaks.length;
    const trimX = trimFraction * w;
    const maxPeak = Math.max(0.01, ...peaks);
    peaks.forEach((p, i) => {
      const x = i * barW;
      const barH = Math.max(2, (p / maxPeak) * (h - 8));
      // Bars before the trim-in point are dimmed — they won't play.
      ctx.fillStyle = x < trimX ? 'rgba(120,113,108,0.25)' : 'rgba(41,37,36,0.75)';
      ctx.fillRect(x, (h - barH) / 2, Math.max(1, barW - 1), barH);
    });

    // Trim-in marker
    ctx.fillStyle = '#292524';
    ctx.fillRect(trimX - 1, 0, 2, h);
  }, [peaks, trimFraction]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
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
