'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import {
  Loader2, ChevronRight, AlertTriangle, CheckCircle2,
  Camera, Paintbrush, ChevronDown, Check, ImageIcon,
  Film, Download,
} from 'lucide-react';
import type { ImageModel } from '@/app/api/google-models/route';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ShotKeyFrames } from '@/app/api/storyboard/[id]/generate-shots/route';
import { DevStatsPanel, EMPTY_DEV_STATS } from '@/src/components/dev-stats';
import type { DevStats } from '@/src/components/dev-stats';

type RenderStyle = 'PHOTOREAL' | 'WATERCOLOUR_SKETCH';
type Tab = 'storyboard' | 'shots' | 'images' | 'boards' | 'json';

type State =
  | { phase: 'empty' }
  | { phase: 'generating'; markdown: string }
  | { phase: 'parsing'; id: string; title: string; markdown: string; charsGenerated: number }
  | {
      phase: 'parsed' | 'generating_refs' | 'refs_done' | 'generating_shots' | 'shots_done';
      id: string;
      title: string;
      markdown: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsedJson: any;
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

  const [renderStyle, setRenderStyle] = useState<RenderStyle>('PHOTOREAL');
  const [imageModel, setImageModel] = useState<string>('gemini-2.0-flash-preview-image-generation');
  const [availableModels, setAvailableModels] = useState<ImageModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Reference stills — separate from main state so they survive phase transitions
  const [refStills, setRefStills] = useState<ReferenceStills>({});
  const [refsCurrentEntity, setRefsCurrentEntity] = useState<string | null>(null);

  // Shot key frames
  const [shotKeyFrames, setShotKeyFrames] = useState<ShotKeyFrames>({});
  const [shotsGenerating, setShotsGenerating] = useState(false);

  // Dev timing stats
  const [devStats, setDevStats] = useState<DevStats>(EMPTY_DEV_STATS);

  const [activeTab, setActiveTab] = useState<Tab>('storyboard');

  const generateMessage = useProgressMessage(state.phase === 'generating', GENERATE_MILESTONES);
  const parseMessage = useProgressMessage(state.phase === 'parsing', PARSE_MILESTONES);

  const isLoaded =
    state.phase === 'parsed' ||
    state.phase === 'generating_refs' ||
    state.phase === 'refs_done' ||
    state.phase === 'generating_shots' ||
    state.phase === 'shots_done';

  useEffect(() => {
    if (!isLoaded) return;
    if (availableModels.length > 0) return;
    setModelsLoading(true);
    fetch('/api/google-models')
      .then((r) => r.json())
      .then((data: { models: ImageModel[] }) => {
        setAvailableModels(data.models ?? []);
        if (data.models?.[0]) setImageModel(data.models[0].id);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  async function approveRef(storyboardId: string, entityId: string, url: string) {
    setRefStills((prev) => ({
      ...prev,
      [entityId]: { ...prev[entityId]!, selected: url },
    }));
    await fetch(`/api/storyboard/${storyboardId}/approve-ref`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId, selectedUrl: url }),
    });
  }

  async function startGeneration(id: string) {
    // Save settings, then start the SSE generation stream
    await fetch(`/api/storyboard/${id}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ render_style: renderStyle, image_model: imageModel }),
    });

    setState((prev) =>
      prev.phase === 'parsed' || prev.phase === 'refs_done'
        ? { ...prev, phase: 'generating_refs' }
        : prev,
    );
    setRefStills({});
    setRefsCurrentEntity(null);
    setActiveTab('images');
    setDevStats((prev) => ({ ...prev, refsStart: Date.now(), refsEnd: undefined, entities: [] }));

    let res: Response;
    try {
      res = await fetch(`/api/storyboard/${id}/generate-refs`, { method: 'POST' });
    } catch {
      setState((prev) =>
        prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
      );
      return;
    }

    if (!res.body || !res.ok) {
      setState((prev) =>
        prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
      );
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
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(part.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (payload['type'] === 'entity_start') {
            const entityId = payload['entityId'] as string;
            const entityName = payload['entityName'] as string;
            const entityType = payload['entityType'] as string;
            setRefsCurrentEntity(entityId);
            setRefStills((prev) => ({
              ...prev,
              [entityId]: { status: 'generating', candidates: [], selected: null },
            }));
            setDevStats((prev) => ({
              ...prev,
              entities: [...prev.entities, { id: entityId, name: entityName, type: entityType, startMs: Date.now() }],
            }));
          } else if (payload['type'] === 'entity_done') {
            const entityId = payload['entityId'] as string;
            const candidates = payload['candidates'] as string[];
            const durationMs = payload['durationMs'] as number | undefined;
            setRefsCurrentEntity(null);
            setRefStills((prev) => ({
              ...prev,
              [entityId]: { status: 'done', candidates, selected: null },
            }));
            setDevStats((prev) => ({
              ...prev,
              entities: prev.entities.map((e) =>
                e.id === entityId ? { ...e, durationMs, candidateCount: candidates.length } : e,
              ),
            }));
          } else if (payload['type'] === 'entity_error') {
            const entityId = payload['entityId'] as string;
            const message = payload['message'] as string;
            const durationMs = payload['durationMs'] as number | undefined;
            setRefsCurrentEntity(null);
            setRefStills((prev) => ({
              ...prev,
              [entityId]: { status: 'error', candidates: [], selected: null, error: message },
            }));
            setDevStats((prev) => ({
              ...prev,
              entities: prev.entities.map((e) =>
                e.id === entityId ? { ...e, durationMs, error: message } : e,
              ),
            }));
          } else if (payload['type'] === 'done') {
            setDevStats((prev) => ({ ...prev, refsEnd: Date.now() }));
            setState((prev) =>
              prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
            );
          }
        }
      }
    } catch {
      // stream closed — leave state as-is
    } finally {
      setState((prev) =>
        prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
      );
    }
  }

  async function startShotGeneration(id: string) {
    setState((prev) =>
      prev.phase === 'refs_done' || prev.phase === 'parsed'
        ? { ...prev, phase: 'generating_shots' }
        : prev,
    );
    setShotsGenerating(true);
    setShotKeyFrames({});
    setActiveTab('boards');

    let res: Response;
    try {
      res = await fetch(`/api/storyboard/${id}/generate-shots`, { method: 'POST' });
    } catch {
      setState((prev) => (prev.phase === 'generating_shots' ? { ...prev, phase: 'refs_done' } : prev));
      setShotsGenerating(false);
      return;
    }

    if (!res.body || !res.ok) {
      setState((prev) => (prev.phase === 'generating_shots' ? { ...prev, phase: 'refs_done' } : prev));
      setShotsGenerating(false);
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
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(part.slice(6)) as Record<string, unknown>; } catch { continue; }

          if (payload['type'] === 'shot_start') {
            const n = String(payload['shotNumber'] as number);
            setShotKeyFrames((prev) => ({ ...prev, [n]: { status: 'generating', url: null } }));
          } else if (payload['type'] === 'shot_done') {
            const n = String(payload['shotNumber'] as number);
            const url = payload['url'] as string;
            setShotKeyFrames((prev) => ({ ...prev, [n]: { status: 'done', url } }));
          } else if (payload['type'] === 'shot_error') {
            const n = String(payload['shotNumber'] as number);
            const message = payload['message'] as string;
            setShotKeyFrames((prev) => ({ ...prev, [n]: { status: 'error', url: null, error: message } }));
          } else if (payload['type'] === 'done') {
            setState((prev) => (prev.phase === 'generating_shots' ? { ...prev, phase: 'shots_done' } : prev));
            setShotsGenerating(false);
          }
        }
      }
    } catch {
      // stream closed
    } finally {
      setState((prev) => (prev.phase === 'generating_shots' ? { ...prev, phase: 'shots_done' } : prev));
      setShotsGenerating(false);
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
      setState({
        phase: 'error',
        message: typeof data['error'] === 'string' ? data['error'] : 'Parse failed.',
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

          if (payload['type'] === 'progress') {
            const chars = payload['chars'] as number;
            setState((prev) =>
              prev.phase === 'parsing' ? { ...prev, charsGenerated: chars } : prev,
            );
          } else if (payload['type'] === 'done') {
            const usage = payload['usage'] as { input_tokens?: number; output_tokens?: number } | undefined;
            setDevStats((prev) => ({
              ...prev,
              parseEnd: Date.now(),
              parseInputTokens: usage?.input_tokens,
              parseOutputTokens: usage?.output_tokens,
            }));
            setState({
              phase: 'parsed',
              id,
              title,
              markdown,
              parsedJson: payload['storyboard'],
              warnings: Array.isArray(payload['warnings'])
                ? (payload['warnings'] as string[])
                : [],
            });
            setActiveTab('storyboard');
            return;
          } else if (payload['type'] === 'error') {
            const base = (payload['message'] as string | undefined) ?? 'Parse failed.';
            const details = Array.isArray(payload['details'])
              ? (payload['details'] as string[])
              : [];
            setState({
              phase: 'error',
              message: details.length > 0
                ? `${base}\n\n${details.slice(0, 5).join('\n')}`
                : base,
            });
            return;
          }
        }
      }
    } catch {
      // Connection dropped — check if the parse already completed in the DB
      // before showing an error. This recovers from transient network blips
      // where the server finished but the SSE stream closed before the client
      // received the done event.
      try {
        const check = await fetch(`/api/storyboard/${id}`);
        if (check.ok) {
          const data = await check.json() as { status?: string; parsed_json?: unknown; title?: string };
          if (data.status === 'PARSED' && data.parsed_json) {
            setState({
              phase: 'parsed',
              id,
              title: typeof data.title === 'string' ? data.title : title,
              markdown,
              parsedJson: data.parsed_json,
              warnings: [],
            });
            setActiveTab('storyboard');
            return;
          }
        }
      } catch { /* ignore recovery errors, fall through to error state */ }
      setState({ phase: 'error', message: 'Lost connection during parse. Please try again.' });
    }
  }

  async function generate() {
    if (!script.trim()) return;
    setState({ phase: 'generating', markdown: '' });
    setActiveTab('storyboard');
    const genStart = Date.now();
    setDevStats({ ...EMPTY_DEV_STATS, generateStart: genStart });

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
            : 'Server error. Check that ANTHROPIC_API_KEY and DATABASE_URL are set in Vercel.',
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
              id: string; title: string; markdown: string; type: string;
            };
            setDevStats((prev) => ({ ...prev, generateEnd: Date.now(), parseStart: Date.now() }));
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

  const approvedCount = Object.values(refStills).filter((s) => s.selected !== null).length;
  const totalEntities = Object.keys(refStills).length;
  const shotsTotal = Object.keys(shotKeyFrames).length;
  const shotsDone = Object.values(shotKeyFrames).filter((s) => s.status === 'done').length;
  const hasAnyApproved = approvedCount > 0;

  // Which tabs have content yet
  const hasStoryboard = state.phase !== 'empty' && state.phase !== 'error';
  const hasShots = isLoaded;
  const hasImages = state.phase === 'generating_refs' || state.phase === 'refs_done' ||
    state.phase === 'generating_shots' || state.phase === 'shots_done';
  const hasBoards = state.phase === 'generating_shots' || state.phase === 'shots_done';
  const hasJson = isLoaded;

  const tabDefs = [
    { id: 'storyboard' as Tab, label: 'Storyboard', enabled: hasStoryboard },
    {
      id: 'shots' as Tab,
      label: isLoaded ? `Shot list (${(state as { parsedJson: { shots?: unknown[] } }).parsedJson?.shots?.length ?? 0})` : 'Shot list',
      enabled: hasShots,
    },
    {
      id: 'images' as Tab,
      label: totalEntities > 0 ? `Stills ${approvedCount}/${totalEntities}` : 'Stills',
      enabled: hasImages,
      spinner: state.phase === 'generating_refs',
    },
    {
      id: 'boards' as Tab,
      label: shotsTotal > 0 ? `Boards ${shotsDone}/${shotsTotal}` : 'Boards',
      enabled: hasBoards,
      spinner: shotsGenerating,
    },
    { id: 'json' as Tab, label: 'JSON', enabled: hasJson },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
            {isLoaded && 'title' in state ? state.title
              : (isGenerating || isParsing) && 'title' in state && state.title ? state.title
              : 'New storyboard'}
          </h1>
          {state.phase === 'empty' && (
            <p className="mt-1 text-stone-500 text-sm">
              Paste a script, premise, or beat list. The storyboard skill handles the rest.
            </p>
          )}
          {'id' in state && (
            <p className="text-xs text-stone-400 font-mono mt-1">ID: {state.id}</p>
          )}
        </div>
        {isLoaded && 'warnings' in state && (
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            {state.warnings.length > 0 && (
              <Badge variant="warning">{state.warnings.length} warnings</Badge>
            )}
            <Badge variant="success">Parsed</Badge>
          </div>
        )}
      </div>

      {/* ── Tab bar — always visible ── */}
      <div className="flex gap-1 border-b border-stone-200">
        {tabDefs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && setActiveTab(tab.id)}
            aria-disabled={!tab.enabled}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative select-none ${
              !tab.enabled
                ? 'text-stone-300 cursor-not-allowed'
                : activeTab === tab.id
                  ? 'text-stone-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-stone-900'
                  : 'text-stone-500 hover:text-stone-700 cursor-pointer'
            }`}
          >
            {'spinner' in tab && tab.spinner && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Settings panel — only when storyboard is loaded ── */}
      {isLoaded && 'parsedJson' in state && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-stone-900 text-sm">Generation settings</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Choose how reference stills and key frames will look.
            </p>
          </div>

          {/* Style picker */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-stone-600">Visual style</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'PHOTOREAL' as const, icon: Camera, label: 'Photoreal', description: 'Matches your DP & film stock' },
                  { value: 'WATERCOLOUR_SKETCH' as const, icon: Paintbrush, label: 'Watercolour sketch', description: 'Pencil lines, muted watercolour wash' },
                ] as const
              ).map(({ value, icon: Icon, label, description }) => {
                const active = renderStyle === value;
                return (
                  <button
                    key={value}
                    onClick={() => setRenderStyle(value)}
                    disabled={state.phase === 'generating_refs'}
                    className={`rounded-xl border p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 mb-2 ${active ? 'text-white' : 'text-stone-500'}`} />
                    <p className={`text-xs font-medium ${active ? 'text-white' : 'text-stone-900'}`}>{label}</p>
                    <p className={`text-xs mt-0.5 ${active ? 'text-stone-300' : 'text-stone-400'}`}>{description}</p>
                  </button>
                );
              })}
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
                  disabled={state.phase === 'generating_refs'}
                  className="w-full appearance-none rounded-lg border border-stone-200 bg-white px-3 py-2 pr-8 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setState({ phase: 'empty' }); setScript(''); setRefStills({}); setShotKeyFrames({}); setActiveTab('storyboard'); }}
            >
              New storyboard
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ref generation */}
              {state.phase === 'generating_refs' ? (
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating stills…
                  {refsCurrentEntity && <span className="font-mono text-stone-400">{refsCurrentEntity}</span>}
                </div>
              ) : (
                <Button
                  onClick={() => { void startGeneration(state.id); }}
                  disabled={modelsLoading || shotsGenerating}
                  variant="secondary"
                  size="sm"
                >
                  {state.phase === 'refs_done' || state.phase === 'generating_shots' || state.phase === 'shots_done'
                    ? 'Redo stills' : 'Generate stills'}
                </Button>
              )}

              {/* Generate boards — only once some refs are approved */}
              {(state.phase === 'refs_done' || state.phase === 'shots_done') && hasAnyApproved && (
                shotsGenerating ? (
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating boards…
                  </div>
                ) : (
                  <Button
                    onClick={() => { void startShotGeneration(state.id); }}
                    disabled={modelsLoading}
                    variant={state.phase === 'shots_done' ? 'secondary' : 'default'}
                    size={state.phase === 'shots_done' ? 'sm' : 'default'}
                  >
                    <Film className="h-4 w-4" />
                    {state.phase === 'shots_done' ? 'Regenerate boards' : 'Generate boards'}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )
              )}

              {/* PDF download — once at least one board is done */}
              {shotsDone > 0 && !shotsGenerating && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { window.open(`/api/storyboard/${state.id}/pdf`, '_blank'); }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}

      {/* Storyboard tab */}
      {activeTab === 'storyboard' && (
        <div className="space-y-4">
          {/* Input form — empty state */}
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
                  {script.length > 0 ? `${script.length} chars` : "Tip: include the word \"storyboard\" if the skill doesn't trigger"}
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
              <p className="text-sm text-red-600 whitespace-pre-wrap">{state.message}</p>
              <Button variant="secondary" size="sm" onClick={() => setState({ phase: 'empty' })}>
                Try again
              </Button>
            </div>
          )}

          {/* Progress — generating */}
          {isGenerating && (
            <div className="glass rounded-2xl p-6 space-y-3">
              <p className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {generateMessage}
              </p>
              <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed border border-stone-100">
                {'markdown' in state ? state.markdown : ''}
                <span className="inline-block w-1.5 h-3 bg-stone-400 animate-pulse ml-0.5 align-middle" />
              </pre>
            </div>
          )}

          {/* Progress — parsing */}
          {isParsing && (
            <div className="glass rounded-2xl p-6 space-y-2">
              <p className="text-xs text-stone-500 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                {parseMessage}
                {state.phase === 'parsing' && state.charsGenerated > 0 && (
                  <span className="text-stone-400">· {state.charsGenerated.toLocaleString()} chars</span>
                )}
              </p>
            </div>
          )}

          {/* Loaded — warnings + markdown */}
          {isLoaded && 'markdown' in state && (
            <div className="space-y-3">
              {'warnings' in state && state.warnings.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-medium text-amber-700 mb-2">Integrity warnings — review before generating:</p>
                  {state.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 font-mono">• {w}</p>
                  ))}
                </div>
              )}
              <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[600px] whitespace-pre-wrap leading-relaxed border border-stone-100">
                {state.markdown}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Shots tab */}
      {activeTab === 'shots' && isLoaded && 'parsedJson' in state && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(state.parsedJson?.shots ?? []).map((shot: any) => (
            <div key={shot.shot_number as number} className="glass rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-stone-400 flex-shrink-0 w-7">
                    {String(shot.shot_number as number).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium text-stone-900 truncate">{shot.descriptor as string}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">{shot.grammar?.scale as string}</Badge>
                  <Badge variant="outline" className="text-xs">{shot.grammar?.lens as string}</Badge>
                </div>
              </div>
              <p className="text-xs text-stone-500 pl-9">{shot.function as string}</p>
              {shot.action_beat && (
                <p className="text-xs text-stone-600 pl-9 leading-relaxed">{shot.action_beat as string}</p>
              )}
              {(shot.continuity?.characters as string[] | undefined)?.length ? (
                <div className="pl-9 flex flex-wrap items-center gap-1.5">
                  {(shot.continuity.characters as string[]).map((c) => (
                    <span key={c} className="text-xs font-mono text-stone-400 bg-stone-100 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                  <span className="text-xs font-mono text-stone-400 bg-stone-100 rounded px-1.5 py-0.5">
                    {shot.continuity.location_id as string}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Images tab */}
      {activeTab === 'images' && isLoaded && 'parsedJson' in state && (
        <div className="space-y-6">
          {totalEntities === 0 && state.phase !== 'generating_refs' && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400 space-y-3">
              <ImageIcon className="h-8 w-8" />
              <p className="text-sm">No reference stills yet.</p>
              <p className="text-xs text-center">Choose your settings above, then click Generate reference stills.</p>
            </div>
          )}
          <EntitySection
            title="Characters"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities={(state.parsedJson?.characters ?? []).map((c: any) => ({ id: c.id as string, name: c.name as string }))}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
          />
          <EntitySection
            title="Locations"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities={(state.parsedJson?.locations ?? []).map((l: any) => ({ id: l.id as string, name: l.name as string }))}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
          />
          <EntitySection
            title="Props"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities={(state.parsedJson?.props ?? []).filter((p: any) => p.generates_reference_still as boolean).map((p: any) => ({ id: p.id as string, name: p.name as string }))}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
          />
        </div>
      )}

      {/* Boards tab */}
      {activeTab === 'boards' && isLoaded && 'parsedJson' in state && (
        <div className="space-y-4">
          {shotsTotal === 0 && !shotsGenerating && (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400 space-y-3">
              <Film className="h-8 w-8" />
              <p className="text-sm">No boards generated yet.</p>
            </div>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(state.parsedJson?.shots ?? []).map((shot: any) => {
            const n = String(shot.shot_number as number);
            const frame = shotKeyFrames[n];
            return (
              <div key={n} className="glass rounded-xl overflow-hidden">
                {/* Image area */}
                {frame?.status === 'done' && frame.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame.url}
                    alt={`Shot ${n} — ${shot.descriptor as string}`}
                    className="w-full object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-stone-100 flex items-center justify-center">
                    {frame?.status === 'generating' ? (
                      <div className="flex items-center gap-2 text-stone-400 text-xs">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating…
                      </div>
                    ) : frame?.status === 'error' ? (
                      <div className="flex items-center gap-2 text-red-400 text-xs px-4 text-center">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        {frame.error ?? 'Generation failed'}
                      </div>
                    ) : (
                      <div className="text-stone-300 text-xs">Pending</div>
                    )}
                  </div>
                )}
                {/* Metadata */}
                <div className="p-3 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono font-bold text-stone-400 w-6 flex-shrink-0">
                      {String(shot.shot_number as number).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-medium text-stone-900">{shot.descriptor as string}</span>
                  </div>
                  <p className="text-xs text-stone-500 pl-8 leading-snug">{shot.function as string}</p>
                  <div className="flex items-center gap-2 pl-8 flex-wrap">
                    <span className="text-xs font-mono text-stone-400">{shot.grammar?.scale as string}</span>
                    <span className="text-stone-200">·</span>
                    <span className="text-xs font-mono text-stone-400">{shot.grammar?.lens as string}</span>
                    <span className="text-stone-200">·</span>
                    <span className="text-xs text-stone-400">Veo {shot.duration?.veo as number}s</span>
                  </div>
                  {shot.dialogue_vo && (
                    <p className="text-xs text-stone-600 italic pl-8 leading-snug">"{shot.dialogue_vo as string}"</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JSON tab */}
      {activeTab === 'json' && isLoaded && 'parsedJson' in state && (
        <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[700px] whitespace-pre leading-relaxed border border-stone-100">
          {JSON.stringify(state.parsedJson, null, 2)}
        </pre>
      )}

      <DevStatsPanel stats={devStats} />
    </div>
  );
}

// ─── EntitySection ────────────────────────────────────────────────────────────

interface EntitySectionProps {
  title: string;
  entities: { id: string; name: string }[];
  refStills: ReferenceStills;
  onApprove: (entityId: string, url: string) => void;
}

function EntitySection({ title, entities, refStills, onApprove }: EntitySectionProps) {
  if (entities.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{title}</h4>
      <div className="space-y-4">
        {entities.map((entity) => {
          const still = refStills[entity.id];
          return (
            <div key={entity.id} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-stone-900">{entity.name}</span>
                  <span className="text-xs font-mono text-stone-400 truncate">{entity.id}</span>
                </div>
                {still?.selected && (
                  <div className="flex items-center gap-1 text-xs text-green-700 flex-shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approved
                  </div>
                )}
              </div>

              {!still && (
                <p className="text-xs text-stone-400 flex items-center gap-2 py-1">
                  <span className="h-2 w-2 rounded-full bg-stone-200 flex-shrink-0" />
                  Pending generation
                </p>
              )}

              {still?.status === 'generating' && (
                <p className="text-xs text-stone-500 flex items-center gap-2 py-1">
                  <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                  Generating candidates…
                </p>
              )}

              {still?.status === 'error' && (
                <p className="text-xs text-red-600 flex items-center gap-2 py-1">
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  {still.error ?? 'Generation failed'}
                </p>
              )}

              {still?.status === 'done' && still.candidates.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {still.candidates.map((url, i) => {
                    const isSelected = still.selected === url;
                    return (
                      <button
                        key={i}
                        onClick={() => onApprove(entity.id, url)}
                        className={`relative group rounded-lg overflow-hidden aspect-square border-2 transition-all ${
                          isSelected
                            ? 'border-stone-900 ring-2 ring-stone-900/20'
                            : 'border-transparent hover:border-stone-300'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`${entity.name} candidate ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isSelected ? (
                          <div className="absolute inset-0 bg-stone-900/20 flex items-center justify-center">
                            <div className="bg-stone-900 rounded-full p-1">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/10 transition-colors" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
