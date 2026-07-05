'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Clapperboard } from 'lucide-react';
import { FILM_FACTS } from '@/src/lib/film-facts';

const FACT_INTERVAL_MS = 28000;
const FADE_MS = 400;

/** Fisher–Yates shuffle so a session walks the facts in random order without repeats. */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Props {
  /** e.g. "Script breakdown usually takes 3–5 minutes." */
  estimate: string;
}

/**
 * Shown during the long script→breakdown waits: expectation-setting line,
 * a coffee-break nudge, and a rotating film fact so the wait gives back.
 */
export function WaitCard({ estimate }: Props) {
  const order = useMemo(() => shuffled(FILM_FACTS), []);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % order.length);
        setVisible(true);
      }, FADE_MS);
    }, FACT_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [order.length]);

  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/50 px-4 py-3.5 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
          <Coffee className="h-4 w-4 text-stone-500" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-700">{estimate}</p>
          <p className="text-xs text-stone-400">Good moment for a coffee — this keeps running if you leave the page open.</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 border-t border-stone-100 pt-3">
        <Clapperboard className="h-3.5 w-3.5 text-stone-400 flex-shrink-0 mt-0.5" />
        <p
          className="text-xs text-stone-500 leading-relaxed transition-opacity duration-300 min-h-[2.5rem]"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {order[index]}
        </p>
      </div>
    </div>
  );
}
