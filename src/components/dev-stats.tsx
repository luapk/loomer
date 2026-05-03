'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface DevStats {
  generateStart?: number;
  generateEnd?: number;
  parseStart?: number;
  parseEnd?: number;
  parseInputTokens?: number;
  parseOutputTokens?: number;
  refsStart?: number;
  refsEnd?: number;
  entities: {
    id: string;
    name: string;
    type: string;
    startMs?: number;
    durationMs?: number;
    candidateCount?: number;
    error?: string;
  }[];
}

export const EMPTY_DEV_STATS: DevStats = { entities: [] };

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

interface Props {
  stats: DevStats;
}

export function DevStatsPanel({ stats }: Props) {
  const [open, setOpen] = useState(false);

  const generateMs = stats.generateEnd && stats.generateStart
    ? stats.generateEnd - stats.generateStart : null;
  const parseMs = stats.parseEnd && stats.parseStart
    ? stats.parseEnd - stats.parseStart : null;
  const refsMs = stats.refsEnd && stats.refsStart
    ? stats.refsEnd - stats.refsStart : null;

  const refsInProgress = stats.refsStart && !stats.refsEnd;
  const nowMs = Date.now();

  const totalMs = stats.generateStart && (stats.refsEnd ?? stats.parseEnd ?? stats.generateEnd)
    ? (stats.refsEnd ?? stats.parseEnd ?? stats.generateEnd)! - stats.generateStart
    : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-stone-900 text-stone-300 rounded-lg px-3 py-1.5 shadow-lg hover:bg-stone-800 transition-colors"
      >
        ⏱ Dev stats
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-1.5 bg-stone-900 text-stone-300 rounded-xl shadow-xl p-4 w-80 space-y-3 max-h-[80vh] overflow-y-auto">

          {/* Phase timings */}
          <div className="space-y-1.5">
            <p className="text-stone-500 uppercase tracking-wider text-[10px]">Phase timings</p>

            <Row
              label="Generate"
              value={generateMs != null ? fmt(generateMs) : stats.generateStart ? 'running…' : '—'}
              live={!!stats.generateStart && !stats.generateEnd}
              liveMs={stats.generateStart ? nowMs - stats.generateStart : 0}
            />
            <Row
              label="Parse"
              value={parseMs != null ? fmt(parseMs) : stats.parseStart ? 'running…' : '—'}
              live={!!stats.parseStart && !stats.parseEnd}
              liveMs={stats.parseStart ? nowMs - stats.parseStart : 0}
            />
            {(stats.parseInputTokens != null || stats.parseOutputTokens != null) && (
              <div className="pl-3 text-stone-500 space-y-0.5">
                {stats.parseInputTokens != null && (
                  <p>↳ {stats.parseInputTokens.toLocaleString()} in</p>
                )}
                {stats.parseOutputTokens != null && (
                  <p>↳ {stats.parseOutputTokens.toLocaleString()} out</p>
                )}
              </div>
            )}
            <Row
              label="Ref stills"
              value={refsMs != null ? fmt(refsMs) : refsInProgress ? 'running…' : '—'}
              live={!!refsInProgress}
              liveMs={stats.refsStart ? nowMs - stats.refsStart : 0}
            />
            {totalMs != null && (
              <div className="border-t border-stone-700 pt-1.5 mt-1.5">
                <Row label="Total" value={fmt(totalMs)} highlight />
              </div>
            )}
          </div>

          {/* Per-entity ref timings */}
          {stats.entities.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-stone-500 uppercase tracking-wider text-[10px]">Ref stills per entity</p>
              {stats.entities.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-stone-400">{e.name}</span>
                    <span className="text-stone-600 ml-1">{e.type[0]?.toUpperCase()}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {e.error ? (
                      <span className="text-red-400">error</span>
                    ) : e.durationMs != null ? (
                      <>
                        <span className="text-stone-300">{fmt(e.durationMs)}</span>
                        {e.candidateCount != null && (
                          <span className="text-stone-500 ml-1">({e.candidateCount} imgs)</span>
                        )}
                      </>
                    ) : e.startMs != null ? (
                      <span className="text-amber-400">generating…</span>
                    ) : (
                      <span className="text-stone-600">pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalMs == null && stats.generateStart == null && (
            <p className="text-stone-600 text-center py-2">No session yet — generate a storyboard to start tracking.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, live = false, liveMs = 0, highlight = false,
}: {
  label: string;
  value: string;
  live?: boolean;
  liveMs?: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={highlight ? 'text-stone-200 font-semibold' : 'text-stone-400'}>{label}</span>
      <span className={highlight ? 'text-white font-semibold' : live ? 'text-amber-400' : 'text-stone-300'}>
        {live ? fmt(liveMs) : value}
      </span>
    </div>
  );
}
