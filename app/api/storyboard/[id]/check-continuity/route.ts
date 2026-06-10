import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { getDb } from '@/src/lib/db';
import type { ParsedStoryboard } from '@/src/schema/storyboard';
import type { ShotKeyFrames } from '@/app/api/storyboard/[id]/generate-shots/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export interface ContinuityIssue {
  shot_number: number;
  related_shots?: number[];
  type: 'screen_direction' | 'eyeline' | 'spatial' | 'prop' | 'other';
  description: string;
  severity: 'warning' | 'error';
}

export interface ContinuityCheckResult {
  issues: ContinuityIssue[];
  checked_shots: number;
  summary: string;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: 'image/jpeg' | 'image/png' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const rawMime = contentType.split(';')[0]?.trim() ?? 'image/jpeg';
    const mimeType: 'image/jpeg' | 'image/png' = rawMime === 'image/png' ? 'image/png' : 'image/jpeg';
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { data, mimeType };
  } catch {
    return null;
  }
}

// Group consecutive shots that share the same location — continuity only applies within a scene.
function groupByScene(
  shots: ParsedStoryboard['shots'],
): Array<ParsedStoryboard['shots']> {
  const scenes: Array<ParsedStoryboard['shots']> = [];
  let current: ParsedStoryboard['shots'] = [];
  for (const shot of shots) {
    if (current.length === 0 || current[current.length - 1]!.continuity.location_id === shot.continuity.location_id) {
      current.push(shot);
    } else {
      scenes.push(current);
      current = [shot];
    }
  }
  if (current.length > 0) scenes.push(current);
  return scenes;
}

const SYSTEM_PROMPT = `You are a professional film continuity supervisor with deep knowledge of the 180-degree rule, eyeline matching, screen direction, and spatial geography.

You will be shown a sequence of storyboard frames from a single scene (same location), along with their shot metadata. Your job is to identify continuity violations — specifically cases where the visual execution breaks spatial logic the viewer would track.

Check for:
1. **180-degree rule violations** — characters swapping screen sides (left↔right) between cuts, without an axis-crossing shot
2. **Eyeline mismatches** — in dialogue, if A looks screen-right toward B, then B should look screen-left toward A; flag reversals
3. **Spatial geography** — a character or object placed near one part of the room in one shot appearing in an inconsistent position in the next
4. **Screen direction** — a character moving left-to-right should continue left-to-right in the next shot (unless cut away)

Do NOT flag:
- Differences that are intentional cut-aways or inserts
- Changes between different scenes or locations
- POV or subjective shots that naturally break the axis
- Style inconsistencies (those are a separate concern)

Be precise: name which characters are affected and which shot numbers are in conflict.
Description must be ≤8 words — terse, specific, no filler. E.g. "Leo swaps to screen-right vs shot 3."

Respond with JSON only — no prose outside the JSON block:
{
  "issues": [
    {
      "shot_number": <the shot with the violation>,
      "related_shots": [<other shot numbers involved>],
      "type": "screen_direction" | "eyeline" | "spatial" | "prop" | "other",
      "description": "<clear, specific description referencing character names and shot numbers>",
      "severity": "error" | "warning"
    }
  ],
  "summary": "<one sentence: total issues found or clean>"
}`;

async function checkScene(
  anthropic: Anthropic,
  scene: ParsedStoryboard['shots'],
  parsed: ParsedStoryboard,
  shotKeyFrames: ShotKeyFrames,
): Promise<ContinuityIssue[]> {
  // Fetch images for all done shots in this scene
  const withImages = (
    await Promise.all(
      scene.map(async (shot) => {
        const frame = shotKeyFrames[String(shot.shot_number)];
        if (frame?.status !== 'done' || !frame.url) return null;
        const img = await fetchImageAsBase64(frame.url);
        if (!img) return null;
        return { shot, img };
      }),
    )
  ).filter((x): x is { shot: ParsedStoryboard['shots'][0]; img: { data: string; mimeType: 'image/jpeg' | 'image/png' } } => x !== null);

  if (withImages.length < 2) return [];

  const locationName = parsed.locations.find((l) => l.id === scene[0]!.continuity.location_id)?.name
    ?? scene[0]!.continuity.location_id;

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: `Scene location: ${locationName}\nAnalyse the following ${withImages.length} shots for continuity violations:\n` },
  ];

  for (const { shot, img } of withImages) {
    const charNames = shot.continuity.characters
      .map((cid) => parsed.characters.find((c) => c.id === cid)?.name ?? cid)
      .join(', ');
    content.push({
      type: 'text',
      text: `\nShot ${shot.shot_number} — ${shot.descriptor}\nScale: ${shot.grammar.scale} | Angle: ${shot.grammar.angle} | Move: ${shot.grammar.camera_move} | Screen direction: ${shot.grammar.screen_direction}\nCharacters: ${charNames || 'none'}\nDescription: ${shot.key_frame_prompt.slice(0, 300)}`,
    });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.data } });
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed2 = JSON.parse(jsonMatch[0]) as { issues?: ContinuityIssue[] };
    return parsed2.issues ?? [];
  } catch {
    return [];
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const storyboard = await getDb().storyboard.findUnique({ where: { id } });
  if (!storyboard?.parsed_json) {
    return NextResponse.json({ error: 'Storyboard not parsed' }, { status: 422 });
  }
  if (!storyboard.shot_key_frames) {
    return NextResponse.json({ error: 'No boards generated yet' }, { status: 422 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 });
  }

  const parsed = storyboard.parsed_json as unknown as ParsedStoryboard;
  const shotKeyFrames = storyboard.shot_key_frames as unknown as ShotKeyFrames;

  const doneCount = Object.values(shotKeyFrames).filter((f) => f.status === 'done').length;
  if (doneCount < 2) {
    return NextResponse.json({
      issues: [],
      checked_shots: doneCount,
      summary: 'Need at least 2 generated boards to check continuity.',
    } satisfies ContinuityCheckResult);
  }

  const anthropic = new Anthropic({ apiKey });
  const scenes = groupByScene(parsed.shots);

  // Check each multi-shot scene in parallel
  const sceneResults = await Promise.all(
    scenes
      .filter((s) => s.length >= 2)
      .map((scene) => checkScene(anthropic, scene, parsed, shotKeyFrames)),
  );

  const allIssues = sceneResults.flat();
  const checkedShots = scenes.filter((s) => s.length >= 2).reduce((acc, s) => acc + s.length, 0);

  const summary = allIssues.length === 0
    ? `No continuity issues detected across ${checkedShots} shots.`
    : `${allIssues.filter((i) => i.severity === 'error').length} error(s), ${allIssues.filter((i) => i.severity === 'warning').length} warning(s) found across ${checkedShots} shots.`;

  const result: ContinuityCheckResult = { issues: allIssues, checked_shots: checkedShots, summary };

  // Persist so restored sessions show the report instead of silently never
  // having checked. checked_at lets the client tell a stored report from none.
  await getDb().storyboard.update({
    where: { id },
    data: {
      continuity_report: { ...result, checked_at: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(result);
}
