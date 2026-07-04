'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';

interface Props {
  storyboardId: string;
}

const LAYOUTS: { key: string; label: string; hint: string }[] = [
  { key: 'shooting', label: 'Shooting board', hint: 'Grid with camera grammar + lenses' },
  { key: 'treatment', label: 'Treatment', hint: 'One frame per page with prose' },
  { key: 'client', label: 'Client boards', hint: 'Frames + captions only' },
  { key: 'lookbook', label: 'Look book', hint: 'Style lock + approved references' },
];

export function ExportMenu({ storyboardId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-white/70 transition-colors bg-white/40"
      >
        <Download className="h-3.5 w-3.5" />
        Export PDF
        <ChevronDown className="h-3 w-3 text-stone-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-50 w-64 rounded-xl border border-stone-200 bg-white shadow-xl py-1.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                setOpen(false);
                window.open(`/api/storyboard/${storyboardId}/pdf?layout=${l.key}`, '_blank');
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-stone-50 transition-colors"
            >
              <span className="block text-xs font-medium text-stone-900">{l.label}</span>
              <span className="block text-xs text-stone-400 mt-0.5">{l.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
