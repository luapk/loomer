'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { Loader2, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

type State =
  | { phase: 'empty' }
  | { phase: 'generating'; markdown: string }
  | { phase: 'parsing'; id: string; title: string; markdown: string; charsGenerated: number }
  | {
      phase: 'parsed';
      id: string;
      title: string;
      markdown: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsedJson: any; // opaque JSON blob — typed at the API layer
      warnings: string[];
    }
  | { phase: 'error'; message: string };

const GENERATE_MILESTONES: { ms: number; text: string }[] = [
  { ms: 0,      text: 'Reading your script…' },
  { ms: 4000,   text: 'Breaking down scenes and story structure…' },
  { ms: 10000,  text: 'Establishing characters, locations and props…' },
  { ms: 18000,  text: 'Designing shot sequences and coverage…' },
  { ms: 28000,  text: 'Writing camera direction and lens choices…' },
  { ms: 42000,  text: 'Assembling the storyboard…' },
  { ms: 60000,  text: 'Refining continuity across scenes…' },
  { ms: 80000,  text: 'Checking visual consistency…' },
  { ms: 105000, text: 'Locking the shot list…' },
];

const PARSE_MILESTONES: { ms: number; text: string }[] = [
  { ms: 0,     text: 'Extracting shot list…' },
  { ms: 5000,  text: 'Mapping the continuity bible…' },
  { ms: 12000, text: 'Validating scene integrity…' },
  { ms: 22000, text: 'Locking the storyboard…' },
];

function useProgressMessage(active: boolean, milestones: { ms: number; text: string }[]) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setIndex(0);
    milestones.forEach((m, i) => {
      if (i === 0) return;
      const id = setTimeout(() => setIndex(i), m.ms);
      timerRef.current = id;
    });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return milestones[index]?.text ?? milestones[milestones.length - 1]?.text ?? '';
}

export default function HomePage() {
  const [script, setScript] = useState('');
  const [state, setState] = useState<State>({ phase: 'empty' });

  const generateMessage = useProgressMessage(state.phase === 'generating', GENERATE_MILESTONES);
  const parseMessage = useProgressMessage(state.phase === 'parsing', PARSE_MILESTONES);

  async function doParse(id: string, title: string, markdown: string) {
    setState({ phase: 'parsing', id, title, markdown, charsGenerated: 0 });

    let res: Response;
    try {
      res = await fetch(`/api/storyboard/${id}/parse`, { method: 'POST' });
    } catch {
      setState({ phase: 'error', message: 'Network error during parse.' });
      return;
    }

    if (!res.body) {
      setState({ phase: 'error', message: 'Server returned no response body during parse.' });
      return;
    }

    if (!res.ok) {
      let data: Record<string, unknown> = {};
      try { data = (await res.json()) as Record<string, unknown>; } catch { /* ignore */ }
      setState({ phase: 'error', message: typeof data['error'] === 'string' ? data['error'] : 'Parse failed.' });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = JSON.parse(part.slice(6)) as Record<string, unknown>;

          if (payload['type'] === 'progress') {
            const chars = payload['chars'] as number;
            setState((prev) =>
              prev.phase === 'parsing' ? { ...prev, charsGenerated: chars } : prev,
            );
          } else if (payload['type'] === 'done') {
            setState({
              phase: 'parsed',
              id,
              title,
              markdown,
              parsedJson: payload['storyboard'],
              warnings: Array.isArray(payload['warnings']) ? (payload['warnings'] as string[]) : [],
            });
            return;
          } else if (payload['type'] === 'error') {
            const base = (payload['message'] as string | undefined) ?? 'Parse failed.';
            const details = Array.isArray(payload['details']) ? (payload['details'] as string[]) : [];
            setState({ phase: 'error', message: details.length > 0 ? `${base}\n\n${details.slice(0, 5).join('\n')}` : base });
            return;
          }
        }
      }
    } catch {
      setState({ phase: 'error', message: 'Lost connection during parse.' });
    }
  }

  async function generate() {
    if (!script.trim()) return;
    setState({ phase: 'generating', markdown: '' });

    let res: Response;
    try {
      res = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
    } catch {
      setState({ phase: 'error', message: 'Network error — could not reach server.' });
      return;
    }

    if (!res.body) {
      setState({ phase: 'error', message: 'Server returned no response body.' });
      return;
    }

    // Non-2xx before stream starts means a JSON error response (e.g. 503 MISSING_API_KEY)
    if (!res.ok) {
      let data: Record<string, unknown> = {};
      try { data = (await res.json()) as Record<string, unknown>; } catch { /* ignore */ }
      setState({
        phase: 'error',
        message:
          typeof data['error'] === 'string'
            ? data['error']
            : 'Server error — no response body. Check that ANTHROPIC_API_KEY and DATABASE_URL are set in Vercel.',
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = JSON.parse(part.slice(6)) as Record<string, unknown>;

          if (payload['type'] === 'chunk') {
            const text = payload['text'] as string;
            setState((prev) =>
              prev.phase === 'generating'
                ? { phase: 'generating', markdown: prev.markdown + text }
                : prev,
            );
          } else if (payload['type'] === 'done') {
            const { id, title, markdown } = payload as {
              id: string;
              title: string;
              markdown: string;
              type: string;
            };
            await doParse(id, title, markdown);
            return;
          } else if (payload['type'] === 'error') {
            setState({
              phase: 'error',
              message: (payload['message'] as string | undefined) ?? 'Generation failed.',
            });
            return;
          }
        }
      }
    } catch {
      setState({ phase: 'error', message: 'Lost connection to server mid-generation.' });
    }
  }

  const isGenerating = state.phase === 'generating';
  const isParsing = state.phase === 'parsing';
  const isWorking = isGenerating || isParsing;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">New storyboard</h1>
        <p className="mt-1 text-stone-500 text-sm">
          Paste a script, premise, or beat list. The storyboard skill handles the rest.
        </p>
      </div>

      {/* Input card — visible only when idle */}
      {state.phase === 'empty' && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <Textarea
            placeholder="INT. PIER - LATE AFTERNOON&#10;&#10;Leo, 8, stands at the rail with his crimson kite..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="min-h-[280px] font-mono text-xs"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-400">
              {script.length > 0
                ? `${script.length} chars`
                : 'Tip: include the word "storyboard" if the skill doesn\'t trigger'}
            </span>
            <Button onClick={() => { void generate(); }} disabled={!script.trim()}>
              Generate storyboard
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {state.phase === 'error' && (
        <div className="glass rounded-2xl p-6 border-red-200/60 bg-red-50/40 space-y-3">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium text-sm">Something went wrong</span>
          </div>
          <p className="text-sm text-red-600">{state.message}</p>
          <Button variant="secondary" size="sm" onClick={() => setState({ phase: 'empty' })}>
            Try again
          </Button>
        </div>
      )}

      {/* Streaming / parsing / parsed — the live markdown card */}
      {(isGenerating || isParsing || state.phase === 'parsed') && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {state.phase === 'parsed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
                {isWorking && (
                  <Loader2 className="h-4 w-4 animate-spin text-stone-400 flex-shrink-0" />
                )}
                <div>
                  {'title' in state && state.title ? (
                    <h2 className="font-semibold text-stone-900">{state.title}</h2>
                  ) : (
                    <h2 className="font-semibold text-stone-400">Generating…</h2>
                  )}
                  {'id' in state && (
                    <p className="text-xs text-stone-500 font-mono mt-0.5">ID: {state.id}</p>
                  )}
                </div>
              </div>

              {state.phase === 'parsed' && (
                <div className="flex items-center gap-2">
                  {state.warnings.length > 0 && (
                    <Badge variant="warning">{state.warnings.length} warnings</Badge>
                  )}
                  <Badge variant="success">Parsed</Badge>
                </div>
              )}
            </div>

            {/* Progress messages */}
            {isGenerating && (
              <p className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {generateMessage}
              </p>
            )}
            {isParsing && (
              <p className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {parseMessage}
                {state.phase === 'parsing' && state.charsGenerated > 0 && (
                  <span className="text-stone-400">
                    · {state.charsGenerated.toLocaleString()} chars
                  </span>
                )}
              </p>
            )}

            {/* Streaming markdown — visible while generating and stays for parsed */}
            {(isGenerating || isParsing || state.phase === 'parsed') &&
              'markdown' in state &&
              state.markdown && (
                <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed border border-stone-100">
                  {state.markdown}
                  {isGenerating && (
                    <span className="inline-block w-1.5 h-3 bg-stone-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              )}

            {/* Parse warnings */}
            {state.phase === 'parsed' && state.warnings.length > 0 && (
              <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 space-y-1">
                <p className="text-xs font-medium text-amber-700 mb-2">
                  Integrity warnings — review before generating:
                </p>
                {state.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 font-mono">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {/* Parsed JSON */}
            {state.phase === 'parsed' && (
              <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[600px] whitespace-pre leading-relaxed border border-stone-100">
                {JSON.stringify(state.parsedJson, null, 2)}
              </pre>
            )}
          </div>

          {state.phase === 'parsed' && (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setState({ phase: 'empty' });
                  setScript('');
                }}
              >
                New storyboard
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
