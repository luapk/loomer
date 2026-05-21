'use client';

import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Loader2, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { SHOT_VARIATION_GROUPS } from '@/src/lib/shot-variations';

const MAX_SELECTED = 3;

interface EntityInfo {
  id: string;
  name: string;
}

interface Props {
  storyboardId: string;
  shotNumber: number;
  keyFramePrompt?: string;
  conditioningEntities?: EntityInfo[];
  onSuccess: (url: string) => void;
}

export function RegenShotButton({
  storyboardId,
  shotNumber,
  keyFramePrompt,
  conditioningEntities = [],
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [overridePrompt, setOverridePrompt] = useState('');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset and pre-populate when popover opens
  useEffect(() => {
    if (open) {
      setOverridePrompt(keyFramePrompt ?? '');
      setExcludedIds(new Set());
      setSelected([]);
    }
  }, [open, keyFramePrompt]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggleVariation(prompt: string) {
    setSelected((prev) => {
      if (prev.includes(prompt)) return prev.filter((p) => p !== prompt);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, prompt];
    });
  }

  function toggleExclude(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function regen(variationPrompts: string[]) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/storyboard/${storyboardId}/regen-shot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shotNumber,
          variations: variationPrompts,
          overridePrompt: overridePrompt.trim() || undefined,
          excludedEntityIds: excludedIds.size > 0 ? [...excludedIds] : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Regeneration failed');
        return;
      }
      const data = (await res.json()) as { url: string };
      onSuccess(data.url);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  // Live director's note preview — shown when variations are selected so the
  // user can see what will be appended to their prompt before triggering regen.
  const directorNotePreview = selected.length > 0
    ? selected.map((p) => {
        // Show first clause of the variation prompt (up to ' — ' or 60 chars)
        const dash = p.indexOf(' — ');
        return dash > 0 ? p.slice(0, dash) : p.slice(0, 60) + (p.length > 60 ? '…' : '');
      }).join(' + ')
    : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-label="Regenerate shot"
        disabled={loading}
        onClick={() => { if (!loading) { setOpen((v) => !v); setError(null); } }}
        className="h-7 w-7 p-0 flex items-center justify-center rounded-full bg-white/80 shadow-sm hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-600" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 text-stone-600" />
        )}
      </button>

      {/* Inline error */}
      {error && !open && (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700 shadow-md">
          {error}
        </div>
      )}

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-8 z-50 w-80 rounded-xl border border-stone-200 bg-white shadow-xl flex flex-col max-h-[min(560px,85vh)]">
          <div className="p-3 border-b border-stone-100 flex-shrink-0">
            <p className="text-xs font-semibold text-stone-900">Regenerate shot</p>
            <p className="text-xs text-stone-400 mt-0.5">Edit the prompt, pick variations, or just retry.</p>
          </div>

          <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
            {/* Editable prompt */}
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Prompt</p>
              <textarea
                rows={4}
                value={overridePrompt}
                onChange={(e) => setOverridePrompt(e.target.value)}
                placeholder="Describe the shot…"
                className="w-full text-xs rounded-md border border-stone-200 bg-white px-2.5 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800 placeholder:text-stone-400"
              />
            </div>

            {/* Variation chips */}
            {SHOT_VARIATION_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="text-xs font-medium text-stone-500 mb-1.5">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.variations.map((v) => {
                    const isActive = selected.includes(v.prompt);
                    const isDisabled = !isActive && selected.length >= MAX_SELECTED;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => toggleVariation(v.prompt)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          isActive
                            ? 'bg-stone-900 text-white border-stone-900'
                            : isDisabled
                              ? 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400 hover:text-stone-900'
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Live Director's note preview */}
            {directorNotePreview && (
              <div className="rounded-md bg-stone-50 border border-stone-100 px-2.5 py-2">
                <p className="text-xs text-stone-400 mb-0.5 font-medium">Director&apos;s note (will append)</p>
                <p className="text-xs text-stone-600 italic">{directorNotePreview}</p>
              </div>
            )}

            {/* Exclude entities from conditioning */}
            {conditioningEntities.length > 0 && (
              <div>
                <p className="text-xs font-medium text-stone-500 mb-1.5">Remove from this frame</p>
                <div className="flex flex-wrap gap-1.5">
                  {conditioningEntities.map((e) => {
                    const isExcluded = excludedIds.has(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => toggleExclude(e.id)}
                        title={isExcluded ? `Re-include ${e.name}` : `Exclude ${e.name} from conditioning`}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          isExcluded
                            ? 'bg-red-50 text-red-600 border-red-200 line-through'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-red-300 hover:text-red-600'
                        }`}
                      >
                        {isExcluded && <X className="h-2.5 w-2.5 flex-shrink-0" />}
                        {e.name}
                      </button>
                    );
                  })}
                </div>
                {excludedIds.size > 0 && (
                  <p className="text-xs text-stone-400 mt-1.5">Excluded entities won&apos;t be used as visual references for this frame.</p>
                )}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-stone-100 flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { void regen(selected); }}
            >
              Regenerate
            </Button>
            <button
              type="button"
              onClick={() => { void regen([]); }}
              className="text-xs text-stone-500 hover:text-stone-900 transition-colors px-2 py-1.5"
            >
              Just retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
