'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { Loader2, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

type State =
  | { phase: 'empty' }
  | { phase: 'generating' }
  | { phase: 'generated'; id: string; title: string; markdown: string }
  | { phase: 'parsing'; id: string; title: string; markdown: string }
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
      // store last timer so we can clear on unmount only (not critical)
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

  async function generate() {
    if (!script.trim()) return;
    setState({ phase: 'generating' });

    const res = await fetch('/api/storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script }),
    });

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      setState({ phase: 'error', message: 'Server error — no response body. Check that ANTHROPIC_API_KEY and DATABASE_URL are set in Vercel.' });
      return;
    }

    if (!res.ok) {
      const msg = typeof data['error'] === 'string' ? data['error'] : 'Generation failed.';
      setState({ phase: 'error', message: msg });
      return;
    }

    setState({
      phase: 'generated',
      id: data['id'] as string,
      title: data['title'] as string,
      markdown: data['markdown'] as string,
    });
  }

  async function parse() {
    if (state.phase !== 'generated') return;
    const { id, title, markdown } = state;
    setState({ phase: 'parsing', id, title, markdown });

    const res = await fetch(`/api/storyboard/${id}/parse`, { method: 'POST' });

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      setState({ phase: 'error', message: 'Server error — no response body.' });
      return;
    }

    if (!res.ok) {
      setState({ phase: 'error', message: typeof data['error'] === 'string' ? data['error'] : 'Parse failed.' });
      return;
    }

    setState({
      phase: 'parsed',
      id,
      title,
      markdown,
      parsedJson: data['storyboard'],
      warnings: Array.isArray(data['warnings']) ? data['warnings'] as string[] : [],
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
          New storyboard
        </h1>
        <p className="mt-1 text-stone-500 text-sm">
          Paste a script, premise, or beat list. The storyboard skill handles the rest.
        </p>
      </div>

      {/* Input card */}
      {(state.phase === 'empty' || state.phase === 'generating') && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <Textarea
            placeholder="INT. PIER - LATE AFTERNOON&#10;&#10;Leo, 8, stands at the rail with his crimson kite..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="min-h-[280px] font-mono text-xs"
            disabled={state.phase === 'generating'}
          />
          <div className="flex items-center justify-between">
            {state.phase === 'generating' ? (
              <span className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {generateMessage}
              </span>
            ) : (
              <span className="text-xs text-stone-400">
                {script.length > 0 ? `${script.length} chars` : 'Tip: include the word "storyboard" if the skill doesn\'t trigger'}
              </span>
            )}
            <Button
              onClick={() => { void generate(); }}
              disabled={state.phase === 'generating' || !script.trim()}
            >
              {state.phase === 'generating' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  Generate storyboard
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
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

      {/* Generated — show markdown, offer Parse */}
      {(state.phase === 'generated' || state.phase === 'parsing') && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-stone-900">{state.title}</h2>
                <p className="text-xs text-stone-500 mt-0.5 font-mono">ID: {state.id}</p>
              </div>
              <Button
                onClick={() => { void parse(); }}
                disabled={state.phase === 'parsing'}
              >
                {state.phase === 'parsing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  <>
                    Parse storyboard
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {state.phase === 'parsing' && (
              <p className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {parseMessage}
              </p>
            )}

            <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed border border-stone-100">
              {state.markdown}
            </pre>
          </div>
        </div>
      )}

      {/* Parsed — show JSON */}
      {state.phase === 'parsed' && (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <h2 className="font-semibold text-stone-900">{state.title}</h2>
                  <p className="text-xs text-stone-500 font-mono mt-0.5">ID: {state.id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {state.warnings.length > 0 && (
                  <Badge variant="warning">{state.warnings.length} warnings</Badge>
                )}
                <Badge variant="success">Parsed</Badge>
              </div>
            </div>

            {state.warnings.length > 0 && (
              <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 space-y-1">
                <p className="text-xs font-medium text-amber-700 mb-2">Integrity warnings — review before generating:</p>
                {state.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 font-mono">• {w}</p>
                ))}
              </div>
            )}

            <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[600px] whitespace-pre leading-relaxed border border-stone-100">
              {JSON.stringify(state.parsedJson, null, 2)}
            </pre>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setState({ phase: 'empty' }); setScript(''); }}>
              New storyboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
