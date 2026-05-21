'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import {
  Loader2, ChevronRight, AlertTriangle, CheckCircle2,
  Camera, Paintbrush, Check, ImageIcon,
  Film, Download, ScanEye, Pencil, Bell, BellOff, X,
} from 'lucide-react';

function toTitleCase(str: string): string {
  const minors = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up']);
  return str
    .toLowerCase()
    .replace(/[^\s-]+/g, (word, offset) =>
      offset === 0 || !minors.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word
    );
}
import type { ImageModel } from '@/app/api/google-models/route';
import type { ReferenceStills } from '@/src/lib/reference-stills';
import type { ShotKeyFrames } from '@/app/api/storyboard/[id]/generate-shots/route';
import type { ContinuityIssue, ContinuityCheckResult } from '@/app/api/storyboard/[id]/check-continuity/route';
import { DevStatsPanel, EMPTY_DEV_STATS } from '@/src/components/dev-stats';
import type { DevStats } from '@/src/components/dev-stats';
import { RegenShotButton } from './RegenShotButton';

type RenderStyle = 'PHOTOREAL' | 'WATERCOLOUR_SKETCH';
type Tab = 'storyboard' | 'shots' | 'images' | 'boards';

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

function HomePageInner() {
  const [script, setScript] = useState('');
  const [state, setState] = useState<State>({ phase: 'empty' });

  const [renderStyle, setRenderStyle] = useState<RenderStyle>('PHOTOREAL');
  const [imageModel, setImageModel] = useState<string>('gemini-2.5-flash-image');
  const [availableModels, setAvailableModels] = useState<ImageModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Reference stills — separate from main state so they survive phase transitions
  const [refStills, setRefStills] = useState<ReferenceStills>({});
  const [refsCurrentEntity, setRefsCurrentEntity] = useState<string | null>(null);

  // Shot key frames
  const [shotKeyFrames, setShotKeyFrames] = useState<ShotKeyFrames>({});
  const [shotsGenerating, setShotsGenerating] = useState(false);
  const refsInFlight = useRef(false);

  // Active SSE reader — stored so Cancel can abort it
  const activeReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isCancelledRef = useRef(false);
  // Storyboard ID received from the server during generation (before done event)
  const pendingStoryboardIdRef = useRef<string | null>(null);

  function cancelActive() {
    isCancelledRef.current = true;
    activeReaderRef.current?.cancel().catch(() => {});
    activeReaderRef.current = null;
    setState({ phase: 'empty' });
  }

  // Continuity check
  const [continuityIssues, setContinuityIssues] = useState<ContinuityIssue[]>([]);
  const [continuityChecking, setContinuityChecking] = useState(false);
  const [continuitySummary, setContinuitySummary] = useState<string | null>(null);
  const [continuityFixing, setContinuityFixing] = useState<Set<number>>(new Set());
  const continuityAutoCheckDone = useRef(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [notifyWhenDone, setNotifyWhenDone] = useState(false);

  // Prompt sync from references
  const [syncingPrompts, setSyncingPrompts] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [showSyncLog, setShowSyncLog] = useState(false);

  // Dev timing stats
  const [devStats, setDevStats] = useState<DevStats>(EMPTY_DEV_STATS);

  // VO line editing — shotNumber of the shot currently being edited, plus draft text
  const [editingVoShot, setEditingVoShot] = useState<number | null>(null);
  const [voEditText, setVoEditText] = useState('');

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
        // Only set default model if none was loaded from DB yet
        setImageModel((prev) => prev || data.models?.[0]?.id || prev);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Open "How it works" modal when ?how=1 is in the URL
  useEffect(() => {
    if (searchParams.get('how') === '1') {
      setShowHowItWorks(true);
      router.replace('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate from an existing storyboard record when ?sb={id} is in the URL.
  useEffect(() => {
    const sbId = searchParams.get('sb');
    if (!sbId) return;
    // Clear the param so Back/refresh doesn't re-trigger
    router.replace('/');

    fetch(`/api/storyboard/${sbId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: {
        id: string;
        title: string;
        source_markdown: string;
        parsed_json: unknown;
        status: string;
        render_style: RenderStyle;
        image_model: string | null;
        reference_stills: unknown;
        shot_key_frames: unknown;
      }) => {
        if (data.render_style) setRenderStyle(data.render_style);
        // Only restore the saved model if it's a known-good ID — stale records may
        // have the old non-existent 'gemini-2.0-flash-preview-image-generation' name.
        const KNOWN_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'];
        if (data.image_model && KNOWN_IMAGE_MODELS.includes(data.image_model)) {
          setImageModel(data.image_model);
        }

        const refStillsData = data.reference_stills as ReferenceStills | null;
        if (refStillsData) {
          // Normalize any entity left in 'generating' state (the previous session died).
          // Entities with candidates → done; entities with none → error.
          const normalized: ReferenceStills = {};
          for (const [eid, s] of Object.entries(refStillsData)) {
            if (s.status === 'generating') {
              normalized[eid] = s.candidates.length > 0
                ? { ...s, status: 'done' }
                : { ...s, status: 'error', error: 'Generation was interrupted. Click Redo to retry.' };
            } else {
              normalized[eid] = s;
            }
          }
          setRefStills(normalized);
        }

        const shotFramesData = data.shot_key_frames as ShotKeyFrames | null;
        if (shotFramesData) setShotKeyFrames(shotFramesData);

        if (data.source_markdown) setScript(data.source_markdown);

        const hasParsed = !!data.parsed_json;
        const hasShots = shotFramesData && Object.keys(shotFramesData).length > 0;
        const hasApprovedRef = refStillsData &&
          Object.values(refStillsData).some((s) => s.selected !== null);

        if (hasShots) {
          setState({ phase: 'shots_done', id: data.id, title: data.title, markdown: data.source_markdown, parsedJson: data.parsed_json, warnings: [] });
          setActiveTab('boards');
        } else if (hasApprovedRef || data.status === 'REFS_PENDING' || data.status === 'REFS_APPROVED') {
          setState({ phase: 'refs_done', id: data.id, title: data.title, markdown: data.source_markdown, parsedJson: data.parsed_json, warnings: [] });
          setActiveTab('images');
        } else if (hasParsed) {
          setState({ phase: 'parsed', id: data.id, title: data.title, markdown: data.source_markdown, parsedJson: data.parsed_json, warnings: [] });
          setActiveTab('storyboard');
        } else {
          // DRAFT or failed — just pre-fill the script so user can retry
          setState({ phase: 'empty' });
        }
      })
      .catch(() => {
        setState({ phase: 'error', message: 'Could not load storyboard.' });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function startGeneration(id: string, force = false) {
    if (refsInFlight.current) return;
    refsInFlight.current = true;
    // Save settings, then start the SSE generation stream
    await fetch(`/api/storyboard/${id}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ render_style: renderStyle, image_model: imageModel }),
    });

    setState((prev) =>
      prev.phase === 'parsed' || prev.phase === 'refs_done' || prev.phase === 'shots_done'
        ? { ...prev, phase: 'generating_refs' }
        : prev,
    );
    // Don't clear refStills here — keep existing stills visible while new ones generate.
    // Individual entities update to 'generating' as the SSE entity_start events arrive.
    setRefsCurrentEntity(null);
    setActiveTab('images');
    setDevStats((prev) => ({ ...prev, refsStart: Date.now(), refsEnd: undefined, entities: [] }));

    let res: Response;
    try {
      res = await fetch(`/api/storyboard/${id}/generate-refs${force ? '?force=true' : ''}`, { method: 'POST' });
    } catch {
      refsInFlight.current = false;
      setState((prev) =>
        prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
      );
      return;
    }

    if (!res.body || !res.ok) {
      refsInFlight.current = false;
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
              // Preserve selected so hasAnyApproved stays true during generation.
              [entityId]: { status: 'generating', candidates: prev[entityId]?.candidates ?? [], selected: prev[entityId]?.selected ?? null },
            }));
            setDevStats((prev) => ({
              ...prev,
              entities: [...prev.entities, { id: entityId, name: entityName, type: entityType, startMs: Date.now() }],
            }));
          } else if (payload['type'] === 'entity_candidate') {
            // A single candidate arrived — show it immediately without waiting for all 4
            const entityId = payload['entityId'] as string;
            const url = payload['url'] as string;
            setRefStills((prev) => {
              const existing = prev[entityId] ?? { status: 'generating', candidates: [], selected: null };
              return {
                ...prev,
                [entityId]: { ...existing, candidates: [...existing.candidates, url] },
              };
            });
          } else if (payload['type'] === 'entity_done') {
            const entityId = payload['entityId'] as string;
            const candidates = payload['candidates'] as string[];
            const durationMs = payload['durationMs'] as number | undefined;
            setRefsCurrentEntity(null);
            setRefStills((prev) => ({
              ...prev,
              [entityId]: { status: 'done', candidates, selected: prev[entityId]?.selected ?? null },
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
              // Preserve selected so a failed candidate doesn't wipe an approved image.
              [entityId]: { status: 'error', candidates: prev[entityId]?.candidates ?? [], selected: prev[entityId]?.selected ?? null, error: message },
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
            if (notifyWhenDone) playChime();
          }
        }
      }
    } catch {
      // stream dropped — fall through to finally to reload from DB
    } finally {
      refsInFlight.current = false;
      // Reload reference_stills from DB — entity cards may still show "generating"
      // if the SSE stream closed before all entity_done events arrived (e.g. timeout).
      try {
        const check = await fetch(`/api/storyboard/${id}`);
        if (check.ok) {
          const data = await check.json() as { reference_stills?: ReferenceStills };
          if (data.reference_stills) {
            setRefStills(data.reference_stills);
          }
        }
      } catch { /* ignore */ }
      setState((prev) =>
        prev.phase === 'generating_refs' ? { ...prev, phase: 'refs_done' } : prev,
      );
    }
  }

  async function startShotGeneration(id: string) {
    setState((prev) =>
      prev.phase === 'refs_done' || prev.phase === 'parsed' || prev.phase === 'shots_done'
        ? { ...prev, phase: 'generating_shots' }
        : prev,
    );
    setShotsGenerating(true);
    setShotKeyFrames({});
    setContinuityIssues([]);
    setContinuitySummary(null);
    continuityAutoCheckDone.current = false;
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
            if (notifyWhenDone) playChime();
          }
        }
      }
    } catch {
      // stream closed
    } finally {
      setState((prev) => (prev.phase === 'generating_shots' ? { ...prev, phase: 'shots_done' } : prev));
      setShotsGenerating(false);
    }
    // Auto continuity check — flags remaining issues after generation; no regen.
    if (!continuityAutoCheckDone.current) {
      continuityAutoCheckDone.current = true;
      await runContinuityCheck(id);
    }
  }

  async function runContinuityCheck(id: string) {
    setContinuityChecking(true);
    setContinuityIssues([]);
    setContinuitySummary(null);
    try {
      const res = await fetch(`/api/storyboard/${id}/check-continuity`, { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json() as ContinuityCheckResult;
      setContinuityIssues(data.issues);
      setContinuitySummary(data.summary);
    } finally {
      setContinuityChecking(false);
    }
  }

  function playChime() {
    try {
      const ctx = new AudioContext();
      const times = [0, 0.18, 0.36];
      const freqs = [880, 1108, 1320];
      times.forEach((t, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freqs[i]!;
        gain.gain.setValueAtTime(0, ctx.currentTime + t);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.9);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.9);
      });
    } catch { /* AudioContext may be blocked */ }
  }

  async function syncPrompts(id: string) {
    setSyncingPrompts(true);
    setSyncLog([]);
    setShowSyncLog(true);
    try {
      const res = await fetch(`/api/storyboard/${id}/sync-prompts`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSyncLog([`Error: ${data.error ?? 'Failed'}`]);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (event.type === 'entity_analysed') {
              setSyncLog((prev) => [
                ...prev,
                `Ref "${event.name as string}" → "${event.newAppearance as string}"`,
              ]);
            } else if (event.type === 'shot_updated') {
              setSyncLog((prev) => [
                ...prev,
                `Shot ${event.shotNumber as number} updated: ${event.descriptor as string}`,
              ]);
            } else if (event.type === 'done') {
              const updated = event.updatedShots as number;
              const total = event.totalShots as number;
              setSyncLog((prev) => [
                ...prev,
                `Done — ${updated} of ${total} shot prompts updated`,
              ]);
              // Refresh local parsedJson so the edit-prompt textarea shows the new text
              const check = await fetch(`/api/storyboard/${id}`);
              if (check.ok) {
                const data = (await check.json()) as { parsed_json: unknown };
                setState((prev) =>
                  'parsedJson' in prev ? { ...prev, parsedJson: data.parsed_json } : prev
                );
              }
            } else if (event.type === 'error') {
              setSyncLog((prev) => [...prev, `Error: ${event.message as string}`]);
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch {
      setSyncLog((prev) => [...prev, 'Network error — please try again']);
    } finally {
      setSyncingPrompts(false);
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
    activeReaderRef.current = reader;
    isCancelledRef.current = false;
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
      if (isCancelledRef.current) return;
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
      return;
    } finally {
      activeReaderRef.current = null;
    }
    // Stream closed without done/error event
    if (isCancelledRef.current) return;
    setState((prev) =>
      prev.phase === 'parsing'
        ? { phase: 'error', message: 'Parse timed out. Please try again.' }
        : prev,
    );
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
    activeReaderRef.current = reader;
    isCancelledRef.current = false;
    pendingStoryboardIdRef.current = null;
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

          if (payload['type'] === 'init') {
            // Server sends the storyboard ID early so we can recover if connection drops.
            pendingStoryboardIdRef.current = payload['id'] as string;
          } else if (payload['type'] === 'chunk') {
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
      if (isCancelledRef.current) return;
      setState({ phase: 'error', message: 'Lost connection to server mid-generation.' });
      return;
    } finally {
      activeReaderRef.current = null;
    }
    if (isCancelledRef.current) return;
    // Stream closed without a done/error event — check if the server actually
    // finished and saved the storyboard (e.g. browser was backgrounded on mobile).
    const sbId = pendingStoryboardIdRef.current;
    if (sbId) {
      try {
        const check = await fetch(`/api/storyboard/${sbId}`);
        if (check.ok) {
          const data = await check.json() as { status?: string; source_markdown?: string; title?: string };
          if (data.status === 'DRAFT' && data.source_markdown) {
            setDevStats((prev) => ({ ...prev, generateEnd: Date.now(), parseStart: Date.now() }));
            await doParse(sbId, data.title ?? 'Untitled', data.source_markdown);
            return;
          }
        }
      } catch { /* ignore recovery errors */ }
    }
    setState((prev) =>
      prev.phase === 'generating'
        ? { phase: 'error', message: 'Generation timed out. Please try again — subsequent runs are faster once the prompt is cached.' }
        : prev,
    );
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
  // Elements tab is enabled as soon as the storyboard is parsed — the user
  // needs to be able to click in and hit "Generate stills" even before any
  // refs exist. Previously this was locked to generating_refs/refs_done which
  // created a deadlock when the generation settings panel was tab-gated.
  const hasImages = isLoaded;
  const hasBoards = state.phase === 'generating_shots' || state.phase === 'shots_done' || Object.keys(shotKeyFrames).length > 0;

  // Completion state for green tick icons
  const storyboardComplete = isLoaded;
  const shotsComplete = isLoaded;
  const imagesComplete = totalEntities > 0 && approvedCount === totalEntities;
  const boardsComplete = state.phase === 'shots_done';

  // Approved entities with stripped appearance labels — passed to RegenShotButton
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allParsedEntities: Array<{ id: string; name: string }> = isLoaded && 'parsedJson' in state
    ? [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((state.parsedJson?.characters as any[]) ?? []).map((c: any) => ({
          id: c.id as string,
          name: ((c.name as string).split(/\s[—–]\s/)[0] ?? (c.name as string)).trim(),
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((state.parsedJson?.locations as any[]) ?? []).map((l: any) => ({
          id: l.id as string,
          name: l.name as string,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((state.parsedJson?.props as any[]) ?? []).map((p: any) => ({
          id: p.id as string,
          name: ((p.name as string).split(/\s[—–]\s/)[0] ?? (p.name as string)).trim(),
        })),
      ]
    : [];

  const tabDefs = [
    { id: 'storyboard' as Tab, label: 'Script Analysis', enabled: hasStoryboard, done: storyboardComplete },
    {
      id: 'shots' as Tab,
      label: isLoaded ? `Shot list (${(state as { parsedJson: { shots?: unknown[] } }).parsedJson?.shots?.length ?? 0})` : 'Shot list',
      enabled: hasShots,
      done: shotsComplete,
    },
    {
      id: 'images' as Tab,
      label: totalEntities > 0 ? `Elements ${approvedCount}/${totalEntities}` : 'Elements',
      enabled: hasImages,
      spinner: state.phase === 'generating_refs',
      done: imagesComplete,
    },
    {
      id: 'boards' as Tab,
      label: shotsTotal > 0 ? `Storyboard ${shotsDone}/${shotsTotal}` : 'Storyboard',
      enabled: hasBoards,
      spinner: shotsGenerating,
      done: boardsComplete,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {'parsedJson' in state && state.parsedJson?.brand && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 'bold', letterSpacing: '0.16em', textTransform: 'uppercase', fontVariant: 'small-caps', color: 'var(--ink)', marginBottom: 6 }}>
              {state.parsedJson.brand}
            </p>
          )}
          <h1 className="display-serif" style={{ fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            {isLoaded && 'title' in state ? toTitleCase(state.title)
              : (isGenerating || isParsing) && 'title' in state && state.title ? toTitleCase(state.title)
              : <em>Storyboards that feel like film.</em>}
          </h1>
          {state.phase === 'empty' && (
            <div className="mt-3" style={{ maxWidth: 480 }}>
              <p style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 14, lineHeight: 1.5, color: 'var(--ink-dim)' }}>
                Paste a script, premise, or beat list — Loomer breaks it into shots, sources reference stills, and renders cinematic key frames ready for client delivery.
              </p>
            </div>
          )}
          {'id' in state && (
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginTop: 6 }}>ID: {state.id}</p>
          )}
        </div>
        {isLoaded && 'warnings' in state && (
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            {state.warnings.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('storyboard')}
                title="View integrity warnings on Script Analysis tab"
              >
                <Badge variant="warning" className="cursor-pointer hover:opacity-80 transition-opacity">
                  {state.warnings.length} {state.warnings.length === 1 ? 'warning' : 'warnings'}
                </Badge>
              </button>
            )}
            <button
              onClick={() => { setState({ phase: 'empty' }); setScript(''); setRefStills({}); setShotKeyFrames({}); setActiveTab('storyboard'); }}
              style={{ background: '#111', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', border: 'none', padding: '7px 14px', cursor: 'pointer' }}
            >
              +NEW
            </button>
          </div>
        )}
      </div>

      {/* ── Tab bar — always visible ── */}
      <div className="flex" style={{ borderBottom: '1px solid var(--ink)' }}>
        {tabDefs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.enabled && setActiveTab(tab.id)}
            aria-disabled={!tab.enabled}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              padding: '10px 16px',
              position: 'relative',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 0.15s',
              color: !tab.enabled
                ? 'var(--ink-ghost)'
                : activeTab === tab.id
                  ? 'var(--ink)'
                  : 'var(--ink-low)',
              cursor: !tab.enabled ? 'not-allowed' : 'pointer',
              marginBottom: -1,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--ink)' : '2px solid transparent',
            }}
          >
            {'spinner' in tab && tab.spinner ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : ('done' in tab && tab.done && activeTab !== tab.id) ? (
              <CheckCircle2 style={{ width: 11, height: 11, color: '#3a9a5c', flexShrink: 0 }} />
            ) : null}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Settings panel — only when storyboard is loaded ── */}
      {isLoaded && 'parsedJson' in state && (activeTab === 'images' || activeTab === 'boards') && (
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
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.description}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotifyWhenDone((v) => !v)}
                title={notifyWhenDone ? 'Notifications on — click to disable' : 'Notify me when done'}
                className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${
                  notifyWhenDone
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700'
                }`}
              >
                {notifyWhenDone ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              </button>
              {/* Check continuity — icon button, only once boards exist */}
              {hasBoards && (
                <button
                  type="button"
                  onClick={() => { if ('id' in state) void runContinuityCheck(state.id); }}
                  disabled={continuityChecking}
                  title={continuityChecking ? 'Checking continuity…' : 'Check continuity'}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700 transition-colors disabled:opacity-50"
                >
                  {continuityChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanEye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
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
                  onClick={() => {
                    const isRedo = state.phase === 'refs_done' || state.phase === 'generating_shots' || state.phase === 'shots_done';
                    void startGeneration(state.id, isRedo);
                  }}
                  disabled={modelsLoading || shotsGenerating}
                  variant="secondary"
                  size="sm"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {state.phase === 'refs_done' || state.phase === 'generating_shots' || state.phase === 'shots_done'
                    ? 'Redo stills' : 'Generate stills'}
                </Button>
              )}

              {/* Generate boards — only once some refs are approved */}
              {(state.phase === 'refs_done' || state.phase === 'shots_done' || state.phase === 'generating_shots') && hasAnyApproved && (
                shotsGenerating ? (
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating boards…
                  </div>
                ) : (
                  <Button
                    onClick={() => { void startShotGeneration(state.id); }}
                    disabled={modelsLoading}
                    variant={Object.keys(shotKeyFrames).length > 0 ? 'secondary' : 'default'}
                    size={Object.keys(shotKeyFrames).length > 0 ? 'sm' : 'default'}
                  >
                    <Film className="h-4 w-4" />
                    {Object.keys(shotKeyFrames).length > 0 ? 'Regenerate boards' : 'Generate boards'}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )
              )}

            </div>
          </div>

          {/* Sync prompts from references — shown when at least one ref is approved */}
          {hasAnyApproved && (
            <div className="border-t border-stone-100 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-700">Sync shot prompts from references</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Rewrites appearance descriptions in affected shot prompts to match your approved reference images.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={syncingPrompts || !('id' in state)}
                  onClick={() => { if ('id' in state) void syncPrompts(state.id); }}
                >
                  {syncingPrompts ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Syncing…</>
                  ) : (
                    'Sync prompts'
                  )}
                </Button>
              </div>
              {syncLog.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowSyncLog((v) => !v)}
                    className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {showSyncLog ? '▾ Hide log' : '▸ Show log'}
                  </button>
                  {showSyncLog && (
                    <div className="mt-1.5 rounded-lg bg-stone-50 border border-stone-100 p-2.5 space-y-1 max-h-40 overflow-y-auto">
                      {syncLog.map((line, i) => (
                        <p key={i} className="text-xs text-stone-600 font-mono leading-snug">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                  {script.length > 0 ? `${script.length} chars` : ''}
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
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-500 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                  {generateMessage}
                </p>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-stone-400 hover:text-stone-600" onClick={cancelActive}>
                  <X className="h-3 w-3 mr-1" />Cancel
                </Button>
              </div>
              <pre className="text-xs font-mono text-stone-600 bg-stone-50/60 rounded-xl p-4 overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed border border-stone-100">
                {'markdown' in state ? state.markdown : ''}
                <span className="inline-block w-1.5 h-3 bg-stone-400 animate-pulse ml-0.5 align-middle" />
              </pre>
            </div>
          )}

          {/* Progress — parsing */}
          {isParsing && (
            <div className="glass rounded-2xl p-6 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-500 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                  {parseMessage}
                  {state.phase === 'parsing' && state.charsGenerated > 0 && (
                    <span className="text-stone-400">· {state.charsGenerated.toLocaleString()} chars</span>
                  )}
                </p>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-stone-400 hover:text-stone-600" onClick={cancelActive}>
                  <X className="h-3 w-3 mr-1" />Cancel
                </Button>
              </div>
              <p className="text-xs text-stone-400">This runs on our server — you can leave this page open and come back.</p>
            </div>
          )}

          {/* Loaded — warnings + markdown */}
          {isLoaded && 'markdown' in state && (
            <div className="space-y-3">
              {'warnings' in state && state.warnings.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-amber-700">
                      {state.warnings.length} integrity {state.warnings.length === 1 ? 'warning' : 'warnings'} — non-fatal, storyboard is still usable
                    </p>
                  </div>
                  <p className="text-xs text-amber-600/80">
                    <strong>Bible-injection warnings</strong> fire when a character&apos;s entity name doesn&apos;t appear verbatim in the shot prompt. This is usually a false positive — the storyboard skill often uses pronouns or scene descriptions (&quot;the woman&quot;, &quot;she&quot;) rather than repeating the entity name. The reference image will still be used for conditioning. Warnings about missing descriptions or very short prompts are more likely to need attention.
                  </p>
                  <div className="space-y-1 pt-1 border-t border-amber-200/50">
                    {state.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 font-mono leading-snug">• {w}</p>
                    ))}
                  </div>
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
            storyboardId={state.id}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
            onUploaded={(entityId, url, candidates) => {
              setRefStills((prev) => ({ ...prev, [entityId]: { status: 'done', candidates, selected: url } }));
            }}
            onFineTuned={(entityId, candidates) => {
              setRefStills((prev) => ({
                ...prev,
                [entityId]: { status: 'done', candidates, selected: prev[entityId]?.selected ?? null },
              }));
            }}
          />
          <EntitySection
            title="Locations"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities={(state.parsedJson?.locations ?? []).map((l: any) => ({ id: l.id as string, name: l.name as string }))}
            storyboardId={state.id}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
            onUploaded={(entityId, url, candidates) => {
              setRefStills((prev) => ({ ...prev, [entityId]: { status: 'done', candidates, selected: url } }));
            }}
            onFineTuned={(entityId, candidates) => {
              setRefStills((prev) => ({
                ...prev,
                [entityId]: { status: 'done', candidates, selected: prev[entityId]?.selected ?? null },
              }));
            }}
          />
          <EntitySection
            title="Props"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entities={(state.parsedJson?.props ?? []).filter((p: any) => p.generates_reference_still as boolean).map((p: any) => ({ id: p.id as string, name: p.name as string }))}
            storyboardId={state.id}
            refStills={refStills}
            onApprove={(entityId, url) => void approveRef(state.id, entityId, url)}
            onUploaded={(entityId, url, candidates) => {
              setRefStills((prev) => ({ ...prev, [entityId]: { status: 'done', candidates, selected: url } }));
            }}
            onFineTuned={(entityId, candidates) => {
              setRefStills((prev) => ({
                ...prev,
                [entityId]: { status: 'done', candidates, selected: prev[entityId]?.selected ?? null },
              }));
            }}
          />
        </div>
      )}

      {/* Boards tab */}
      {activeTab === 'boards' && isLoaded && 'parsedJson' in state && (
        <div className="space-y-4">
          {/* Boards toolbar */}
          {shotsTotal > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {'id' in state && shotsDone > 0 && !shotsGenerating && (
                <button
                  onClick={() => { window.open(`/api/storyboard/${state.id}/pdf`, '_blank'); }}
                  className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-white/70 transition-colors bg-white/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PDF
                </button>
              )}
              {'id' in state && Object.values(shotKeyFrames).some((f) => f.status === 'done' && f.url) && (
                <a
                  href={`/api/storyboard/${state.id}/download-zip`}
                  download
                  className="flex items-center gap-1.5 text-xs text-stone-600 border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-white/70 transition-colors bg-white/40"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download ZIP
                </a>
              )}
              {continuitySummary && !continuityChecking && (
                <span className={`text-xs ${continuityIssues.length === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                  {continuitySummary}
                </span>
              )}
              {continuityIssues.length > 0 && (
                <button
                  onClick={() => { setContinuityIssues([]); setContinuitySummary(null); }}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  Clear
                </button>
              )}
            </div>
          )}

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
                {/* Image area — relative so the regen button can be absolutely positioned */}
                <div className="relative">
                  {frame?.status === 'done' && frame.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={frame.url}
                      alt={`Shot ${n} — ${shot.descriptor as string}`}
                      className="w-full aspect-video object-cover"
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
                  {/* Regen button — only show once there is a frame (done or error) */}
                  {'id' in state && (frame?.status === 'done' || frame?.status === 'error') && (
                    <div className="absolute top-2 right-2">
                      <RegenShotButton
                        storyboardId={state.id}
                        shotNumber={shot.shot_number as number}
                        keyFramePrompt={shot.key_frame_prompt as string | undefined}
                        conditioningEntities={allParsedEntities.filter(e => Boolean(refStills[e.id]?.selected))}
                        onSuccess={(url) => {
                          setShotKeyFrames((prev) => ({ ...prev, [n]: { status: 'done', url } }));
                          // Clear any continuity issues for this shot since it was regenerated
                          setContinuityIssues((prev) => prev.filter((i) => i.shot_number !== (shot.shot_number as number)));
                        }}
                      />
                    </div>
                  )}
                  {/* Continuity issue panel */}
                  {continuityIssues.filter((i) => i.shot_number === (shot.shot_number as number)).map((issue, idx) => (
                    <div
                      key={idx}
                      className="absolute bottom-2 left-2 right-12 rounded-lg bg-white px-2.5 py-1.5 text-xs flex items-center gap-2 shadow-md"
                    >
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500" />
                      <span className="flex-1 leading-tight text-stone-800">{issue.description}</span>
                      {'id' in state && (
                        <button
                          type="button"
                          title="Regenerate using this fix"
                          disabled={continuityFixing.has(shot.shot_number as number)}
                          onClick={async () => {
                            const sn = shot.shot_number as number;
                            setContinuityFixing((prev) => new Set(prev).add(sn));
                            try {
                              const r = await fetch(`/api/storyboard/${state.id}/regen-shot`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ shotNumber: sn, variations: [issue.description] }),
                              });
                              if (r.ok) {
                                const d = await r.json() as { url: string };
                                setShotKeyFrames((prev) => ({ ...prev, [String(sn)]: { status: 'done', url: d.url } }));
                                setContinuityIssues((prev) => prev.filter((i) => i.shot_number !== sn));
                              }
                            } catch { /* ignore */ }
                            setContinuityFixing((prev) => { const s = new Set(prev); s.delete(sn); return s; });
                          }}
                          className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-stone-100 transition-colors disabled:opacity-40"
                        >
                          {continuityFixing.has(shot.shot_number as number)
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-500" />
                            : <Check className="h-3.5 w-3.5 text-green-600" />}
                        </button>
                      )}
                      <button
                        type="button"
                        title="Dismiss"
                        onClick={() => {
                          const sn = shot.shot_number as number;
                          let removed = false;
                          setContinuityIssues((prev) => prev.filter((item) => {
                            if (!removed && item.shot_number === sn && item.description === issue.description) {
                              removed = true;
                              return false;
                            }
                            return true;
                          }));
                        }}
                        className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-stone-100 transition-colors"
                      >
                        <X className="h-3.5 w-3.5 text-stone-400" />
                      </button>
                    </div>
                  ))}
                </div>
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
                  {(shot.dialogue_vo || editingVoShot === (shot.shot_number as number)) && (
                    <div className="pl-8 group/vo flex items-start gap-1.5">
                      {editingVoShot === (shot.shot_number as number) ? (
                        <>
                          <textarea
                            autoFocus
                            rows={2}
                            value={voEditText}
                            onChange={(e) => setVoEditText(e.target.value)}
                            className="flex-1 text-xs rounded border border-stone-300 bg-white px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800"
                          />
                          <div className="flex flex-col gap-1 flex-shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!('id' in state)) return;
                                const sn = shot.shot_number as number;
                                await fetch(`/api/storyboard/${state.id}/patch-shot`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ shotNumber: sn, dialogue_vo: voEditText }),
                                });
                                setState((prev) => {
                                  if (!('parsedJson' in prev)) return prev;
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const updatedShots = (prev.parsedJson as any).shots.map((s: any) =>
                                    s.shot_number === sn ? { ...s, dialogue_vo: voEditText || undefined } : s
                                  );
                                  return { ...prev, parsedJson: { ...(prev.parsedJson as object), shots: updatedShots } };
                                });
                                setEditingVoShot(null);
                              }}
                              className="text-xs px-1.5 py-0.5 rounded bg-stone-900 text-white hover:bg-stone-700 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingVoShot(null)}
                              className="text-xs px-1.5 py-0.5 rounded border border-stone-200 text-stone-500 hover:text-stone-900 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="flex-1 text-xs text-stone-600 italic leading-snug">"{shot.dialogue_vo as string}"</p>
                          <button
                            type="button"
                            title="Edit VO / dialogue"
                            onClick={() => {
                              setVoEditText((shot.dialogue_vo as string) ?? '');
                              setEditingVoShot(shot.shot_number as number);
                            }}
                            className="opacity-0 group-hover/vo:opacity-100 transition-opacity flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-stone-100"
                          >
                            <Pencil className="h-3 w-3 text-stone-400" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* How It Works modal */}
      {showHowItWorks && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setShowHowItWorks(false)}
        >
          <div
            className="bg-[var(--paper)] max-w-lg w-full"
            style={{ border: '1px solid var(--ink)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5" style={{ borderBottom: '1px solid var(--ink)' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                How it works
              </span>
              <button onClick={() => setShowHowItWorks(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-dim)', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            {/* Steps */}
            <div className="px-8 py-6 space-y-6">
              {([
                { icon: '01', title: 'Paste your script', body: 'Drop in a screenplay, treatment, or rough beat list. Loomer reads it as a director would.' },
                { icon: '02', title: 'Review the shot list', body: 'The storyboard skill breaks your story into a precise shot list — scale, lens, movement, and continuity all accounted for.' },
                { icon: '03', title: 'Approve reference stills', body: 'Gemini generates candidate stills for each character, location, and prop. Pick the ones that match your vision, or fine-tune with director\'s notes.' },
                { icon: '04', title: 'Generate key frames', body: 'With references locked in, Loomer renders a cinematic key frame for every shot — ready to download as a ZIP or export as a polished PDF contact sheet.' },
              ] as const).map((step) => (
                <div key={step.icon} className="flex gap-5 items-start">
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--ink-ghost)', flexShrink: 0, paddingTop: 2 }}>{step.icon}</span>
                  <div>
                    <p style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 16, color: 'var(--ink)', marginBottom: 4 }}>{step.title}</p>
                    <p style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 13, lineHeight: 1.55, color: 'var(--ink-dim)' }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-8 pb-6">
              <button
                onClick={() => setShowHowItWorks(false)}
                style={{ background: '#111', color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', border: 'none', padding: '10px 20px', cursor: 'pointer', width: '100%' }}
              >
                Got it — let&apos;s make a storyboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EntitySection ────────────────────────────────────────────────────────────

function EntityCard({
  entity,
  still,
  storyboardId,
  onApprove,
  onUploaded,
  onFineTuned,
}: {
  entity: { id: string; name: string };
  still: ReferenceStills[string] | undefined;
  storyboardId: string;
  onApprove: (entityId: string, url: string) => void;
  onUploaded: (entityId: string, url: string, candidates: string[]) => void;
  onFineTuned: (entityId: string, candidates: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [fineTuneNotes, setFineTuneNotes] = useState('');
  const [fineTuning, setFineTuning] = useState(false);
  const [fineTuneError, setFineTuneError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('entityId', entity.id);
      form.append('file', file);
      const res = await fetch(`/api/storyboard/${storyboardId}/upload-ref`, { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json() as { url: string; candidates: string[] };
        onUploaded(entity.id, data.url, data.candidates);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFineTune() {
    setFineTuning(true);
    setFineTuneError(null);
    try {
      const res = await fetch(`/api/storyboard/${storyboardId}/regen-ref`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: entity.id, notes: fineTuneNotes }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Fine-tune failed');
      }
      const data = await res.json() as { candidates: string[] };
      onFineTuned(entity.id, data.candidates);
      setFineTuneOpen(false);
      setFineTuneNotes('');
    } catch (err) {
      setFineTuneError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setFineTuning(false);
    }
  }

  const isGenerating = still?.status === 'generating';
  const hasError = still?.status === 'error' && still.candidates.length === 0;
  const candidates = still?.candidates ?? [];

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-stone-900">{entity.name}</span>
          <span className="text-xs font-mono text-stone-400 truncate">{entity.id}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {still?.selected && (
            <div className="flex items-center gap-1 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          {!hasError && (
            <>
              <button
                onClick={() => { setFineTuneOpen((v) => !v); setFineTuneError(null); }}
                disabled={fineTuning}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
                title="Fine-tune with director's notes"
              >
                <Pencil className="h-3 w-3" />
                Fine-tune
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
                title="Upload your own reference image"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
                Upload
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fine-tune inline form */}
      {fineTuneOpen && (
        <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 space-y-2">
          <textarea
            rows={2}
            value={fineTuneNotes}
            onChange={(e) => setFineTuneNotes(e.target.value)}
            placeholder="e.g. make the jacket leather, shorter hair, add a beard…"
            className="w-full text-xs rounded-md border border-stone-200 bg-white px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-800 placeholder:text-stone-400"
            disabled={fineTuning}
          />
          {fineTuneError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {fineTuneError}
            </p>
          )}
          <button
            onClick={() => void handleFineTune()}
            disabled={fineTuning || !fineTuneNotes.trim()}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-stone-800 rounded-md px-2.5 py-1.5 hover:bg-stone-900 transition-colors disabled:opacity-50"
          >
            {fineTuning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
            {fineTuning ? 'Regenerating…' : 'Regenerate with notes'}
          </button>
        </div>
      )}

      {!still && (
        <p className="text-xs text-stone-400 flex items-center gap-2 py-1">
          <span className="h-2 w-2 rounded-full bg-stone-200 flex-shrink-0" />
          Pending generation
        </p>
      )}

      {isGenerating && candidates.length === 0 && (
        <p className="text-xs text-stone-500 flex items-center gap-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          Generating…
        </p>
      )}

      {hasError && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-3 space-y-2">
          <div className="text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span>{still.error ?? 'Generation failed'}</span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md px-2.5 py-1.5 hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
            {uploading ? 'Uploading…' : 'Upload your own reference'}
          </button>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {candidates.map((url, i) => {
              const isSelected = still?.selected === url;
              return (
                <button
                  key={url}
                  onClick={() => onApprove(entity.id, url)}
                  className={`relative group rounded-lg overflow-hidden aspect-square border-2 transition-all ${
                    isSelected
                      ? 'border-stone-900 ring-2 ring-stone-900/20'
                      : 'border-transparent hover:border-stone-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`${entity.name} candidate ${i + 1}`} className="w-full h-full object-cover" />
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
            {isGenerating && (
              <div className="aspect-square rounded-lg border-2 border-dashed border-stone-200 flex items-center justify-center">
                <Loader2 className="h-4 w-4 text-stone-300 animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface EntitySectionProps {
  title: string;
  entities: { id: string; name: string }[];
  storyboardId: string;
  refStills: ReferenceStills;
  onApprove: (entityId: string, url: string) => void;
  onUploaded: (entityId: string, url: string, candidates: string[]) => void;
  onFineTuned: (entityId: string, candidates: string[]) => void;
}

function EntitySection({ title, entities, storyboardId, refStills, onApprove, onUploaded, onFineTuned }: EntitySectionProps) {
  if (entities.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{title}</h4>
      <div className="space-y-4">
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            still={refStills[entity.id]}
            storyboardId={storyboardId}
            onApprove={onApprove}
            onUploaded={onUploaded}
            onFineTuned={onFineTuned}
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}
