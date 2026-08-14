'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Upload, X } from 'lucide-react';

type Style = { id: string; name: string; imageUrls: string[]; summary: string | null };

export function StylesManager({ maxStyles, maxImages }: { maxStyles: number; maxImages: number }) {
  const [styles, setStyles] = useState<Style[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyStyle, setBusyStyle] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const newFileInput = useRef<HTMLInputElement>(null);
  const addFileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    const res = await fetch('/api/styles');
    if (!res.ok) {
      setError('Could not load styles');
      setStyles([]);
      return;
    }
    const data = await res.json() as { styles: Style[] };
    setStyles(data.styles);
  }

  useEffect(() => { void load(); }, []);

  function pickNewFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, maxImages);
    setNewFiles(picked);
  }

  async function createStyle() {
    if (!newName.trim()) { setError('Give the style a name'); return; }
    if (newFiles.length === 0) { setError('Add at least one reference image'); return; }
    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.set('name', newName.trim());
      for (const file of newFiles) form.append('images', file);
      const res = await fetch('/api/styles', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Could not save the style');
      } else {
        setNewName('');
        setNewFiles([]);
        setCreating(false);
        if (newFileInput.current) newFileInput.current.value = '';
        await load();
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  async function addImages(styleId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusyStyle(styleId);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('images', file);
      const res = await fetch(`/api/styles/${styleId}`, { method: 'PATCH', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Could not add images');
      } else {
        await load();
      }
    } catch {
      setError('Network error');
    }
    setBusyStyle(null);
    const input = addFileInputs.current[styleId];
    if (input) input.value = '';
  }

  async function removeImage(styleId: string, url: string) {
    setBusyStyle(styleId);
    await fetch(`/api/styles/${styleId}?imageUrl=${encodeURIComponent(url)}`, { method: 'DELETE' });
    await load();
    setBusyStyle(null);
  }

  async function deleteStyle(styleId: string) {
    setPendingDelete(null);
    setBusyStyle(styleId);
    await fetch(`/api/styles/${styleId}`, { method: 'DELETE' });
    await load();
    setBusyStyle(null);
  }

  async function renameStyle(styleId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await fetch(`/api/styles/${styleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    await load();
  }

  if (styles === null) {
    return (
      <div className="glass rounded-2xl p-8 flex items-center gap-2 text-xs text-stone-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading styles…
      </div>
    );
  }

  const atCap = styles.length >= maxStyles;

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Saved styles */}
      {styles.length === 0 && !creating ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Upload className="h-8 w-8 text-stone-300 mx-auto mb-3" />
          <p className="text-sm text-stone-500">No styles saved yet.</p>
          <p className="text-xs text-stone-400 mt-1">
            Upload up to {maxImages} frames that share a look, and name it after its director.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {styles.map((style) => (
            <div key={style.id} className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <input
                  defaultValue={style.name}
                  onBlur={(e) => { void renameStyle(style.id, e.target.value); }}
                  className="text-sm font-medium text-stone-900 bg-transparent border-0 border-b border-transparent hover:border-stone-200 focus:border-stone-400 focus:outline-none py-0.5 flex-1 min-w-0"
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-stone-400 tabular-nums">
                    {style.imageUrls.length}/{maxImages}
                  </span>
                  {pendingDelete === style.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { void deleteStyle(style.id); }}
                        className="text-xs text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(style.id)}
                      title="Delete style"
                      className="text-stone-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {style.imageUrls.map((url) => (
                  <div key={url} className="relative group aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${style.name} reference`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => { void removeImage(style.id, url); }}
                      title="Remove image"
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {style.imageUrls.length < maxImages && (
                  <button
                    type="button"
                    onClick={() => addFileInputs.current[style.id]?.click()}
                    disabled={busyStyle === style.id}
                    className="aspect-square rounded-lg border border-dashed border-stone-300 flex items-center justify-center text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-colors disabled:opacity-50"
                  >
                    {busyStyle === style.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Plus className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <input
                ref={(el) => { addFileInputs.current[style.id] = el; }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { void addImages(style.id, e.target.files); }}
              />

              {/* How the machine read the look — the director's check that it
                  understood the reference set. */}
              {busyStyle === style.id ? (
                <p className="text-xs text-stone-400 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading the style…
                </p>
              ) : style.summary ? (
                <p className="text-xs text-stone-500 leading-relaxed border-l-2 border-stone-200 pl-3">
                  {style.summary}
                </p>
              ) : style.imageUrls.length > 0 ? (
                <p className="text-xs text-stone-400">
                  Style description unavailable — add or replace an image to retry.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Create */}
      {creating ? (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600">Style name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. MICHAEL MANN"
              autoFocus
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600">
              Reference images <span className="text-stone-400">— up to {maxImages}</span>
            </label>
            <input
              ref={newFileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => pickNewFiles(e.target.files)}
            />
            {newFiles.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {newFiles.map((file, i) => (
                  <div key={i} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/90 flex items-center justify-center hover:text-red-600 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {newFiles.length < maxImages && (
                  <button
                    type="button"
                    onClick={() => newFileInput.current?.click()}
                    className="aspect-square rounded-lg border border-dashed border-stone-300 flex items-center justify-center text-stone-400 hover:border-stone-400 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => newFileInput.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border border-dashed border-stone-300 text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-colors"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs">Choose up to {maxImages} images</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void createStyle(); }}
              disabled={saving}
              className="rounded-lg bg-stone-900 px-4 py-2 text-xs text-white hover:bg-stone-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save style
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewFiles([]); setNewName(''); setError(null); }}
              className="text-xs text-stone-500 hover:text-stone-900 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={atCap}
          title={atCap ? `You can save up to ${maxStyles} styles` : undefined}
          className="w-full rounded-2xl border border-dashed border-stone-300 py-4 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {atCap ? `${maxStyles} of ${maxStyles} styles saved` : 'New style'}
        </button>
      )}
    </div>
  );
}
