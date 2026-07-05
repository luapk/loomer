'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

interface EntityOption {
  id: string;
  name: string;
}

interface Props {
  storyboardId: string;
  position: number; // 1-based shot number the new frame will take
  characters: EntityOption[];
  locations: EntityOption[];
  props: EntityOption[];
  defaultLocationId: string | null;
  onClose: () => void;
  onInserted: (shotNumber: number) => void;
}

function stripName(name: string): string {
  return name.split(/\s[—–]\s/)[0]?.trim() ?? name;
}

export function InsertFrameDialog({
  storyboardId,
  position,
  characters,
  locations,
  props,
  defaultLocationId,
  onClose,
  onInserted,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [charIds, setCharIds] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState<string | null>(defaultLocationId);
  const [propIds, setPropIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(set: Set<string>, id: string, apply: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    apply(next);
  }

  async function submit() {
    if (prompt.trim().length < 10 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/storyboard/${storyboardId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position,
          prompt: prompt.trim(),
          characterIds: [...charIds],
          locationId,
          propIds: [...propIds],
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not insert frame');
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { shotNumber: number };
      onInserted(data.shotNumber);
    } catch {
      setError('Network error — please try again');
      setSubmitting(false);
    }
  }

  const chipClass = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs border transition-colors ${
      active
        ? 'bg-stone-900 text-white border-stone-900'
        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:text-stone-900'
    }`;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-stone-900">New frame</p>
            <p className="text-xs text-stone-400 mt-0.5">Inserted at position {String(position).padStart(2, '0')} — everything after shifts down.</p>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <p className="text-xs font-medium text-stone-500 mb-1.5">Describe the frame</p>
            <textarea
              autoFocus
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What do we see? Composition, action, light — e.g. 'Low angle from the water: Leo leans over the pier rail at golden hour, kite string taut in his fist…'"
              className="w-full text-sm rounded-xl border border-stone-200 bg-white px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent text-stone-800 placeholder:text-stone-400"
            />
          </div>

          {characters.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Characters in frame</p>
              <div className="flex flex-wrap gap-1.5">
                {characters.map((c) => (
                  <button key={c.id} type="button" onClick={() => toggle(charIds, c.id, setCharIds)} className={chipClass(charIds.has(c.id))}>
                    {stripName(c.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {locations.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Location</p>
              <div className="flex flex-wrap gap-1.5">
                {locations.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLocationId(locationId === l.id ? null : l.id)}
                    className={chipClass(locationId === l.id)}
                  >
                    {stripName(l.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {props.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Props</p>
              <div className="flex flex-wrap gap-1.5">
                {props.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(propIds, p.id, setPropIds)} className={chipClass(propIds.has(p.id))}>
                    {stripName(p.name)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-stone-400">
            Selected elements pull their approved reference images into the render, so the new frame stays consistent with the rest of the board.
          </p>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-stone-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="text-xs text-stone-500 hover:text-stone-900 transition-colors px-3 py-2">
            Cancel
          </button>
          <Button size="sm" onClick={() => { void submit(); }} disabled={prompt.trim().length < 10 || submitting}>
            {submitting ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Inserting…</>) : 'Add & render'}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
