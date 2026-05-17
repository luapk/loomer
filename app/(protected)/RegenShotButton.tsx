'use client';

import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { SHOT_VARIATION_GROUPS } from '@/src/lib/shot-variations';

const MAX_SELECTED = 3;

interface Props {
  storyboardId: string;
  shotNumber: number;
  onSuccess: (url: string) => void;
}

export function RegenShotButton({ storyboardId, shotNumber, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
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

  async function regen(variationPrompts: string[]) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/storyboard/${storyboardId}/regen-shot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotNumber, variations: variationPrompts }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Regeneration failed');
        return;
      }
      const data = (await res.json()) as { url: string };
      setSelected([]);
      onSuccess(data.url);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        aria-label="Regenerate shot"
        disabled={loading}
        onClick={() => {
          if (!loading) {
            setOpen((v) => !v);
            setError(null);
          }
        }}
        className="h-7 w-7 p-0 flex items-center justify-center rounded-full bg-white/80 shadow-sm hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-600" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 text-stone-600" />
        )}
      </button>

      {/* Inline error display */}
      {error && !open && (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700 shadow-md">
          {error}
        </div>
      )}

      {/* Popover panel */}
      {open && (
        <div className="absolute right-0 top-8 z-50 w-72 rounded-xl border border-stone-200 bg-white shadow-xl">
          <div className="p-3 border-b border-stone-100">
            <p className="text-xs font-semibold text-stone-900">Regenerate shot</p>
            <p className="text-xs text-stone-400 mt-0.5">
              Pick up to {MAX_SELECTED} variations, or just retry.
            </p>
          </div>

          <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
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
          </div>

          <div className="p-3 border-t border-stone-100 flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={selected.length === 0}
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
