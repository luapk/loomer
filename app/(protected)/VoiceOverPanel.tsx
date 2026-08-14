'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Play, Pause, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';

export type VoiceOver = {
  shot_number: number;
  voice: string;
  text: string;
  url: string;
  duration_ms: number | null;
};

type Voice = { slot: string; label: string; description: string };

/**
 * Voice-over controls for a board: pick a voice, cut every spoken line, audition
 * the result. Lines come from each shot's dialogue — silent frames stay silent.
 */
export function VoiceOverPanel({
  storyboardId,
  lineCount,
  voiceOvers,
  savedVoice,
  onChange,
  onCreditError,
}: {
  storyboardId: string;
  /** How many shots carry a spoken line — drives the cost estimate. */
  lineCount: number;
  voiceOvers: VoiceOver[];
  savedVoice: string | null;
  onChange: (voiceOvers: VoiceOver[]) => void;
  onCreditError: (message: string) => void;
}) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [voice, setVoice] = useState<string>(savedVoice ?? 'male-uk');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/voices')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { configured: boolean; voices: Voice[] } | null) => {
        if (!data) return;
        setConfigured(data.configured);
        setVoices(data.voices);
      })
      .catch(() => { /* picker just stays empty */ });
  }, []);

  // Stop audio when the panel unmounts — otherwise it keeps playing over a
  // tab switch.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  async function refresh() {
    const res = await fetch(`/api/storyboard/${storyboardId}`);
    if (!res.ok) return;
    const data = await res.json() as { voice_overs?: VoiceOver[] };
    onChange(data.voice_overs ?? []);
  }

  async function generate(force: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/storyboard/${storyboardId}/voiceover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice, force }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string; rendered?: number; skipped?: number;
        failures?: { shotNumber: number; message: string }[];
      };
      if (res.status === 402) {
        onCreditError(data.error ?? 'Not enough credits.');
      } else if (!res.ok) {
        setError(data.error ?? 'Voice-over failed.');
      } else {
        const parts: string[] = [];
        if (data.rendered) parts.push(`${data.rendered} line${data.rendered === 1 ? '' : 's'} cut`);
        if (data.skipped) parts.push(`${data.skipped} already up to date`);
        if (data.failures?.length) {
          parts.push(`${data.failures.length} failed`);
          setError(data.failures[0]?.message ?? null);
        }
        setStatus(parts.join(' · ') || 'Nothing to do.');
        await refresh();
      }
    } catch {
      setError('Network error.');
    }
    setBusy(false);
  }

  async function clearAll() {
    setBusy(true);
    await fetch(`/api/storyboard/${storyboardId}/voiceover`, { method: 'DELETE' });
    await refresh();
    setStatus('Voice-over cleared.');
    setBusy(false);
  }

  function toggle(vo: VoiceOver) {
    if (playing === vo.shot_number) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(vo.url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
    setPlaying(vo.shot_number);
  }

  const done = voiceOvers.length;
  const stale = voiceOvers.filter((vo) => vo.voice !== voice).length;

  if (lineCount === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs text-stone-500">
          No spoken lines in this storyboard — nothing to voice.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-stone-600">Voice-over</p>
          <p className="text-xs text-stone-400 mt-0.5">
            {lineCount} spoken line{lineCount === 1 ? '' : 's'}
            {done > 0 && ` · ${done} cut`}
            {stale > 0 && ` · ${stale} in another voice`}
          </p>
        </div>
        {done > 0 && (
          <button
            type="button"
            onClick={() => { void clearAll(); }}
            disabled={busy}
            className="text-xs text-stone-400 hover:text-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            Voice-over needs <code className="text-[11px]">ELEVENLABS_API_KEY</code> set in the
            deployment. The picker works, but nothing will render until it is.
          </p>
        </div>
      )}

      {/* Voice picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(voices ?? []).map((v) => {
          const active = voice === v.slot;
          return (
            <button
              key={v.slot}
              type="button"
              onClick={() => setVoice(v.slot)}
              disabled={busy}
              title={v.description}
              className={`rounded-xl border p-3 text-left transition-all disabled:opacity-50 ${
                active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <Mic className={`h-3.5 w-3.5 mb-1.5 ${active ? 'text-white' : 'text-stone-500'}`} />
              <p className={`text-xs font-medium ${active ? 'text-white' : 'text-stone-900'}`}>{v.label}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { void generate(false); }}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-xs text-white hover:bg-stone-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
          {done > 0 ? 'Update voice-over' : 'Cut voice-over'}
        </button>
        {done > 0 && (
          <button
            type="button"
            onClick={() => { void generate(true); }}
            disabled={busy}
            className="text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Re-cut every line, even unchanged ones"
          >
            <RotateCcw className="h-3 w-3" />
            Re-cut all
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {status && !error && <p className="text-xs text-stone-500">{status}</p>}

      {/* Audition list */}
      {voiceOvers.length > 0 && (
        <div className="glass rounded-xl divide-y divide-stone-100 max-h-64 overflow-y-auto">
          {voiceOvers.map((vo) => (
            <div key={vo.shot_number} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                onClick={() => toggle(vo)}
                className="h-7 w-7 rounded-full bg-stone-900 text-white flex items-center justify-center flex-shrink-0 hover:bg-stone-700 transition-colors"
                title={playing === vo.shot_number ? 'Pause' : 'Play'}
              >
                {playing === vo.shot_number
                  ? <Pause className="h-3 w-3" />
                  : <Play className="h-3 w-3 ml-0.5" />}
              </button>
              <span className="text-xs text-stone-400 tabular-nums flex-shrink-0">
                {String(vo.shot_number).padStart(2, '0')}
              </span>
              <p className="text-xs text-stone-600 truncate flex-1" title={vo.text}>{vo.text}</p>
              {vo.voice !== voice && (
                <span className="text-[10px] text-amber-600 flex-shrink-0">other voice</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
