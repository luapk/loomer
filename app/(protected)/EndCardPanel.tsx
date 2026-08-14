'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Trash2, Image as ImageIcon, Layers } from 'lucide-react';
import { compositeEndCard, type EndCardSettings } from '@/src/lib/end-card-composite';

export type EndCard = {
  mode: string;
  image_url: string | null;
  endline: string | null;
  logo_scale: number;
  logo_x: number;
  logo_y: number;
  background: string;
  composited_url: string | null;
};

/**
 * Builds the board's closing frame — an uploaded end card, or a logo laid over
 * the final frame — and flattens it in the browser so everything downstream
 * reads one ordinary image.
 */
export function EndCardPanel({
  storyboardId,
  lastFrameUrl,
  endCard,
  onChange,
}: {
  storyboardId: string;
  /** The board's final rendered frame — the bed in overlay mode. */
  lastFrameUrl: string | null;
  endCard: EndCard | null;
  onChange: (endCard: EndCard | null) => void;
}) {
  const [mode, setMode] = useState<'upload' | 'overlay'>(
    endCard?.mode === 'upload' ? 'upload' : 'overlay',
  );
  const [endline, setEndline] = useState(endCard?.endline ?? '');
  const [logoScale, setLogoScale] = useState(endCard?.logo_scale ?? 0.3);
  const [logoY, setLogoY] = useState(endCard?.logo_y ?? 0.45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(endCard?.composited_url ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sourceUrl = endCard?.image_url ?? null;

  // Revoke the object URL the preview holds, or it leaks on every re-render.
  useEffect(() => {
    return () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); };
  }, [preview]);

  const settings = (): EndCardSettings => ({
    mode,
    imageUrl: sourceUrl,
    endline: endline.trim() || null,
    logoScale,
    logoX: 0.5,
    logoY,
    background: 'last_frame',
  });

  /** Flatten and save. Sends settings + the composited PNG in one request. */
  async function save() {
    if (!sourceUrl && !endline.trim()) {
      setError('Add a logo, an end card, or an endline first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await compositeEndCard(settings(), lastFrameUrl);

      const form = new FormData();
      form.set('kind', 'composited');
      form.set('image', new File([blob], 'end-card.png', { type: 'image/png' }));
      form.set('mode', mode);
      form.set('endline', endline.trim());
      form.set('logoScale', String(logoScale));
      form.set('logoX', '0.5');
      form.set('logoY', String(logoY));
      form.set('background', 'last_frame');

      const res = await fetch(`/api/storyboard/${storyboardId}/end-card`, {
        method: 'POST', body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Could not save the end card.');
      } else {
        const data = await res.json() as { endCard: EndCard };
        onChange(data.endCard);
        setPreview(data.endCard.composited_url);
      }
    } catch (err) {
      // Cross-origin images taint the canvas; that's the likely failure here.
      setError(err instanceof Error ? err.message : 'Could not build the end card.');
    }
    setBusy(false);
  }

  /** Upload the logo or card image, then flatten immediately. */
  async function uploadSource(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('kind', 'source');
      form.set('image', file);
      form.set('mode', mode);
      const res = await fetch(`/api/storyboard/${storyboardId}/end-card`, {
        method: 'POST', body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Upload failed.');
      } else {
        const data = await res.json() as { endCard: EndCard };
        onChange(data.endCard);
      }
    } catch {
      setError('Network error.');
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/storyboard/${storyboardId}/end-card`, { method: 'DELETE' });
    onChange(null);
    setPreview(null);
    setEndline('');
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-stone-600">End card</p>
          <p className="text-xs text-stone-400 mt-0.5">
            The board&rsquo;s closing frame — a logo over the last shot, or a card of your own.
          </p>
        </div>
        {endCard && (
          <button
            type="button"
            onClick={() => { void remove(); }}
            disabled={busy}
            className="text-xs text-stone-400 hover:text-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        )}
      </div>

      {/* Mode */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { value: 'overlay' as const, icon: Layers, label: 'Logo over last frame' },
          { value: 'upload' as const, icon: ImageIcon, label: 'Upload a card' },
        ]).map(({ value, icon: Icon, label }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              disabled={busy}
              className={`rounded-xl border p-3 text-left transition-all disabled:opacity-50 ${
                active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 mb-1.5 ${active ? 'text-white' : 'text-stone-500'}`} />
              <p className={`text-xs font-medium ${active ? 'text-white' : 'text-stone-900'}`}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* Source image */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void uploadSource(e.target.files?.[0]); }}
      />
      <div className="flex items-center gap-3">
        {sourceUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl}
              alt="End card source"
              className="h-12 w-12 object-contain rounded-lg bg-stone-100 flex-shrink-0"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
            >
              Replace {mode === 'overlay' ? 'logo' : 'card'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-900 border border-dashed border-stone-300 hover:border-stone-500 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {mode === 'overlay' ? 'Upload logo (transparent PNG)' : 'Upload end card'}
          </button>
        )}
      </div>

      {/* Endline */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-stone-600">Endline <span className="text-stone-400">— optional</span></label>
        <input
          value={endline}
          onChange={(e) => setEndline(e.target.value)}
          placeholder="e.g. Every story starts somewhere."
          maxLength={200}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
        />
      </div>

      {/* Logo placement — overlay mode only */}
      {mode === 'overlay' && sourceUrl && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-stone-500">
            Logo size
            <input
              type="range" min={0.1} max={0.8} step={0.05}
              value={logoScale}
              onChange={(e) => setLogoScale(Number(e.target.value))}
              className="w-full mt-1"
            />
          </label>
          <label className="text-xs text-stone-500">
            Vertical position
            <input
              type="range" min={0.15} max={0.85} step={0.05}
              value={logoY}
              onChange={(e) => setLogoY(Number(e.target.value))}
              className="w-full mt-1"
            />
          </label>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-xs text-white hover:bg-stone-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {preview ? 'Update end card' : 'Build end card'}
        </button>
        {mode === 'overlay' && !lastFrameUrl && (
          <span className="text-xs text-stone-400">Generate the board first for a frame to sit on.</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {preview && (
        <div className="rounded-xl overflow-hidden border border-stone-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="End card preview" className="w-full aspect-video object-cover" />
        </div>
      )}
    </div>
  );
}
