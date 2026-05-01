'use client';

import { useState } from 'react';
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

export default function HomePage() {
  const [script, setScript] = useState('');
  const [state, setState] = useState<State>({ phase: 'empty' });

  async function generate() {
    if (!script.trim()) return;
    setState({ phase: 'generating' });

    const res = await fetch('/api/storyboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script }),
    });

    const data = await res.json() as Record<string, unknown>;

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
    const data = await res.json() as Record<string, unknown>;

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
            <span className="text-xs text-stone-400">
              {script.length > 0 ? `${script.length} chars` : 'Tip: include the word "storyboard" if the skill doesn\'t trigger'}
            </span>
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
