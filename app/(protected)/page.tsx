'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { Loader2, ChevronRight, AlertTriangle, CheckCircle2, Camera, Paintbrush, ChevronDown } from 'lucide-react';
import type { ImageModel } from '@/app/api/google-models/route';

type RenderStyle = 'PHOTOREAL' | 'WATERCOLOUR_SKETCH';

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

  // Generation settings — shown after parse
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('PHOTOREAL');
  const [imageModel, setImageModel] = useState<string>('imagen-3.0-generate-002');
  const [availableModels, setAvailableModels] = useState<ImageModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const generateMessage = useProgressMessage(state.phase === 'generating', GENERATE_MILESTONES);
  const parseMessage = useProgressMessage(state.phase === 'parsing', PARSE_MILESTONES);

  // Fetch available Google image models when parse completes
  useEffect(() => {
    if (state.phase !== 'parsed') return;
    setModelsLoading(true);
    setSettingsSaved(false);
    fetch('/api/google-models')
      .then((r) => r.json())
      .then((data: { models: ImageModel[] }) => {
        setAvailableModels(data.models ?? []);
        if (data.models?.[0]) setImageModel(data.models[0].id);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, [state.phase]);

  async function saveSettings(id: string) {
    setSettingsSaving(true);
    try {
      await fetch(`/api/storyboard/${id}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ render_style: renderStyle, image_model: imageModel }),
      });
      setSettingsSaved(true);
    } catch {
      // non-fatal — settings can be re-saved
    } finally {
      setSettingsSaving(false);
    }
  }

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

            {/* Streaming markdown */}
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

          {/* Generation settings — shown after parse */}
          {state.phase === 'parsed' && (
            <div className="glass rounded-2xl p-6 space-y-5">
              <div>
                <h3 className="font-semibold text-stone-900 text-sm">Generation settings</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Choose how your reference stills and key frames will look.
                </p>
              </div>

              {/* Style picker */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-stone-600">Visual style</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRenderStyle('PHOTOREAL')}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      renderStyle === 'PHOTOREAL'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <Camera className={`h-4 w-4 mb-2 ${renderStyle === 'PHOTOREAL' ? 'text-white' : 'text-stone-500'}`} />
                    <p className={`text-xs font-medium ${renderStyle === 'PHOTOREAL' ? 'text-white' : 'text-stone-900'}`}>
                      Photoreal
                    </p>
                    <p className={`text-xs mt-0.5 ${renderStyle === 'PHOTOREAL' ? 'text-stone-300' : 'text-stone-400'}`}>
                      Matches your DP & film stock
                    </p>
                  </button>

                  <button
                    onClick={() => setRenderStyle('WATERCOLOUR_SKETCH')}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      renderStyle === 'WATERCOLOUR_SKETCH'
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <Paintbrush className={`h-4 w-4 mb-2 ${renderStyle === 'WATERCOLOUR_SKETCH' ? 'text-white' : 'text-stone-500'}`} />
                    <p className={`text-xs font-medium ${renderStyle === 'WATERCOLOUR_SKETCH' ? 'text-white' : 'text-stone-900'}`}>
                      Watercolour sketch
                    </p>
                    <p className={`text-xs mt-0.5 ${renderStyle === 'WATERCOLOUR_SKETCH' ? 'text-stone-300' : 'text-stone-400'}`}>
                      Pencil lines, muted watercolour wash
                    </p>
                  </button>
                </div>
              </div>

              {/* Model picker */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-stone-600">Image model</p>
                {modelsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-stone-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking available models…
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2 pr-8 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} — {m.description}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
                  </div>
                )}
              </div>

              {/* Save button */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setState({ phase: 'empty' });
                    setScript('');
                  }}
                >
                  New storyboard
                </Button>
                <Button
                  onClick={() => { void saveSettings(state.id); }}
                  disabled={settingsSaving || modelsLoading}
                >
                  {settingsSaving ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                  ) : settingsSaved ? (
                    <><CheckCircle2 className="h-3 w-3" /> Settings saved</>
                  ) : (
                    <>Save settings<ChevronRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
