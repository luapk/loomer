'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import {
  analyseWriting,
  estimateRemainingSeconds,
  formatRemaining,
} from '@/src/lib/generation-progress';

/**
 * Progress for the two long stages — writing the storyboard, then extracting
 * the shot list.
 *
 * Everything shown here is derived from real signal: the section structure and
 * shot headings in the streaming markdown, and the parser's actual job count.
 * Where the true total isn't known yet the bar is deliberately indeterminate
 * rather than inventing a percentage — a bar that creeps to 90% and stalls is
 * what teaches people to give up and close the tab.
 */

export type ParseStats = { shots: number; jobs: number; done: number } | null;

export function GenerationProgress({
  stage,
  markdown,
  parseStats,
  startedAt,
}: {
  stage: 'writing' | 'parsing';
  /** Markdown accumulated so far — the writing stage's progress signal. */
  markdown: string;
  /** Real job counts from the parser, once it has planned the work. */
  parseStats: ParseStats;
  startedAt: number;
}) {
  // Re-render once a second so elapsed time and the estimate stay live even
  // between stream events.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = Math.max(0, now - startedAt);
  const elapsed = formatElapsed(elapsedMs);

  const writing = analyseWriting(markdown);

  const fraction = stage === 'writing'
    ? writing.fraction
    : parseStats && parseStats.jobs > 0
      ? parseStats.done / parseStats.jobs
      : null;

  const label = stage === 'writing'
    ? writing.label
    : parseStats
      ? parseStats.done >= parseStats.jobs
        ? 'Assembling the shot list'
        : `Extracting shots — ${parseStats.done} of ${parseStats.jobs} passes complete`
      : 'Reading the storyboard';

  const remaining = formatRemaining(estimateRemainingSeconds(fraction, elapsedMs));

  const steps: { key: string; label: string; state: 'done' | 'active' | 'todo' }[] =
    stage === 'writing'
      ? [
          { key: 'read', label: 'Script read', state: writing.phase === 'starting' ? 'active' : 'done' },
          {
            key: 'bible',
            label: 'Continuity bible',
            state: writing.phase === 'starting' ? 'todo'
              : writing.phase === 'bible' ? 'active' : 'done',
          },
          {
            key: 'shots',
            label: 'Shot blocks',
            state: writing.phase === 'shots' ? 'active'
              : writing.phase === 'audit' ? 'done' : 'todo',
          },
          { key: 'audit', label: 'Continuity check', state: writing.phase === 'audit' ? 'active' : 'todo' },
        ]
      : [
          { key: 'plan', label: 'Work planned', state: parseStats ? 'done' : 'active' },
          {
            key: 'extract',
            label: 'Shots extracted',
            state: !parseStats ? 'todo'
              : parseStats.done >= parseStats.jobs ? 'done' : 'active',
          },
          {
            key: 'validate',
            label: 'Validated',
            state: parseStats && parseStats.done >= parseStats.jobs ? 'active' : 'todo',
          },
        ];

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      {/* Headline: what is happening, and how long it's taken */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-500 flex-shrink-0" />
            <p className="text-sm font-medium text-stone-900 truncate">{label}</p>
          </div>
          <p className="text-xs text-stone-400 mt-1 tabular-nums">
            {elapsed} elapsed
            {remaining && <span className="text-stone-500"> · {remaining}</span>}
          </p>
        </div>
        {fraction !== null && (
          <p className="text-sm text-stone-500 tabular-nums flex-shrink-0">
            {Math.round(fraction * 100)}%
          </p>
        )}
      </div>

      {/* The bar. Indeterminate until a real denominator exists. */}
      <div className="h-1.5 rounded-full bg-stone-200/70 overflow-hidden">
        {fraction === null ? (
          <div className="h-full w-1/3 rounded-full bg-stone-400 animate-indeterminate" />
        ) : (
          <div
            className="h-full rounded-full bg-stone-900 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(2, fraction * 100)}%` }}
          />
        )}
      </div>

      {/* Milestones — each one flips only on real evidence from the stream. */}
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-1.5">
            {step.state === 'done' ? (
              <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
            ) : step.state === 'active' ? (
              <span className="h-1.5 w-1.5 rounded-full bg-stone-900 animate-pulse flex-shrink-0" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-stone-300 flex-shrink-0" />
            )}
            <span
              className={`text-xs ${
                step.state === 'done' ? 'text-stone-500'
                  : step.state === 'active' ? 'text-stone-900 font-medium'
                  : 'text-stone-400'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {/* Real counts, once they exist — concrete evidence that work is landing. */}
      {stage === 'writing' && (writing.characters + writing.locations + writing.props > 0) && (
        <p className="text-xs text-stone-400">
          {writing.characters} character{writing.characters === 1 ? '' : 's'} ·{' '}
          {writing.locations} location{writing.locations === 1 ? '' : 's'} ·{' '}
          {writing.props} prop{writing.props === 1 ? '' : 's'}
          {writing.totalShots !== null && ` · ${writing.totalShots} shots planned`}
        </p>
      )}
      {stage === 'parsing' && parseStats && (
        <p className="text-xs text-stone-400">
          {parseStats.shots} shot{parseStats.shots === 1 ? '' : 's'} across{' '}
          {parseStats.jobs} parallel pass{parseStats.jobs === 1 ? '' : 'es'}
        </p>
      )}

      <p className="text-xs text-stone-400">
        Keep this tab open — the work continues if you switch away, but closing it
        loses the live view.
      </p>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
