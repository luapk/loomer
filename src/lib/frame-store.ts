/**
 * Normalized store for shot key frames and reference stills.
 *
 * Both used to live as whole-object Json columns on the Storyboard row;
 * every writer did a full-column read-modify-write, so concurrent writers
 * (a board run + a single-shot regen, ref generation + an approval) silently
 * lost each other's updates. Each shot / entity is now its own row and every
 * write touches exactly one row.
 *
 * Legacy storyboards are backfilled lazily: the first read that finds no
 * rows but a populated legacy Json column copies the legacy state into rows.
 * The legacy columns are never written again.
 *
 * The assembled record shapes returned here are identical to the old Json
 * column shapes, so API responses and the client are unchanged.
 */

import type { PrismaClient } from '@prisma/client';
import type { EntityStillState, ReferenceStills } from '@/src/lib/reference-stills';

export type ShotFrameState = {
  status: 'pending' | 'generating' | 'done' | 'error';
  url: string | null;
  history?: string[];
  error?: string;
};

export type ShotKeyFrames = Record<string, ShotFrameState>;

// ─── Shot frames ─────────────────────────────────────────────────────────────

/** Read all shot frames as the legacy record shape, lazily backfilling rows. */
export async function getShotFrames(
  db: PrismaClient,
  storyboardId: string,
): Promise<ShotKeyFrames> {
  let rows = await db.shotFrame.findMany({ where: { storyboard_id: storyboardId } });

  if (rows.length === 0) {
    const legacy = await db.storyboard.findUnique({
      where: { id: storyboardId },
      select: { shot_key_frames: true },
    });
    const legacyFrames = legacy?.shot_key_frames as ShotKeyFrames | null;
    if (legacyFrames && Object.keys(legacyFrames).length > 0) {
      await db.shotFrame.createMany({
        data: Object.entries(legacyFrames).map(([key, f]) => ({
          storyboard_id: storyboardId,
          shot_number: Number(key),
          status: f.status,
          url: f.url,
          history: f.history ?? [],
          error: f.error ?? null,
        })),
        skipDuplicates: true,
      });
      rows = await db.shotFrame.findMany({ where: { storyboard_id: storyboardId } });
    }
  }

  const out: ShotKeyFrames = {};
  for (const row of rows) {
    out[String(row.shot_number)] = {
      status: row.status as ShotFrameState['status'],
      url: row.url,
      ...(row.history.length > 0 ? { history: row.history } : {}),
      ...(row.error ? { error: row.error } : {}),
    };
  }
  return out;
}

/** Atomically write one shot's frame state. */
export async function upsertShotFrame(
  db: PrismaClient,
  storyboardId: string,
  shotNumber: number,
  state: ShotFrameState,
): Promise<void> {
  await db.shotFrame.upsert({
    where: { storyboard_id_shot_number: { storyboard_id: storyboardId, shot_number: shotNumber } },
    create: {
      storyboard_id: storyboardId,
      shot_number: shotNumber,
      status: state.status,
      url: state.url,
      history: state.history ?? [],
      error: state.error ?? null,
    },
    update: {
      status: state.status,
      url: state.url,
      history: state.history ?? [],
      error: state.error ?? null,
    },
  });
}

/** Ensure a pending row exists for every shot (start of a board run). */
export async function ensurePendingShotFrames(
  db: PrismaClient,
  storyboardId: string,
  shotNumbers: number[],
): Promise<void> {
  await db.shotFrame.createMany({
    data: shotNumbers.map((n) => ({ storyboard_id: storyboardId, shot_number: n })),
    skipDuplicates: true,
  });
}

// ─── Reference stills ────────────────────────────────────────────────────────

/** Read all reference stills as the legacy record shape, lazily backfilling rows. */
export async function getReferenceStills(
  db: PrismaClient,
  storyboardId: string,
): Promise<ReferenceStills> {
  let rows = await db.referenceStill.findMany({ where: { storyboard_id: storyboardId } });

  if (rows.length === 0) {
    const legacy = await db.storyboard.findUnique({
      where: { id: storyboardId },
      select: { reference_stills: true },
    });
    const legacyRefs = legacy?.reference_stills as ReferenceStills | null;
    if (legacyRefs && Object.keys(legacyRefs).length > 0) {
      await db.referenceStill.createMany({
        data: Object.entries(legacyRefs).map(([entityId, s]) => ({
          storyboard_id: storyboardId,
          entity_id: entityId,
          status: s.status,
          candidates: s.candidates ?? [],
          selected: s.selected,
          synced_url: s.synced_url ?? null,
          error: s.error ?? null,
        })),
        skipDuplicates: true,
      });
      rows = await db.referenceStill.findMany({ where: { storyboard_id: storyboardId } });
    }
  }

  const out: ReferenceStills = {};
  for (const row of rows) {
    const state: EntityStillState = {
      status: row.status as EntityStillState['status'],
      candidates: row.candidates,
      selected: row.selected,
    };
    if (row.synced_url !== null) state.synced_url = row.synced_url;
    if (row.error) state.error = row.error;
    out[row.entity_id] = state;
  }
  return out;
}

/** Atomically write one entity's reference still state. */
export async function upsertReferenceStill(
  db: PrismaClient,
  storyboardId: string,
  entityId: string,
  state: EntityStillState,
): Promise<void> {
  await db.referenceStill.upsert({
    where: { storyboard_id_entity_id: { storyboard_id: storyboardId, entity_id: entityId } },
    create: {
      storyboard_id: storyboardId,
      entity_id: entityId,
      status: state.status,
      candidates: state.candidates,
      selected: state.selected,
      synced_url: state.synced_url ?? null,
      error: state.error ?? null,
    },
    update: {
      status: state.status,
      candidates: state.candidates,
      selected: state.selected,
      synced_url: state.synced_url ?? null,
      error: state.error ?? null,
    },
  });
}

/** Update only the selected URL for one entity (approval) — never touches candidates. */
export async function setReferenceSelected(
  db: PrismaClient,
  storyboardId: string,
  entityId: string,
  selectedUrl: string,
): Promise<void> {
  await db.referenceStill.upsert({
    where: { storyboard_id_entity_id: { storyboard_id: storyboardId, entity_id: entityId } },
    create: {
      storyboard_id: storyboardId,
      entity_id: entityId,
      status: 'done',
      candidates: [selectedUrl],
      selected: selectedUrl,
    },
    update: { selected: selectedUrl },
  });
}

/** Mark entities as synced (synced_url ← selected) after a prompt sync. */
export async function markReferencesSynced(
  db: PrismaClient,
  storyboardId: string,
  entityIds: string[],
): Promise<void> {
  const rows = await db.referenceStill.findMany({
    where: { storyboard_id: storyboardId, entity_id: { in: entityIds } },
    select: { entity_id: true, selected: true },
  });
  await Promise.all(
    rows.map((row) =>
      db.referenceStill.update({
        where: { storyboard_id_entity_id: { storyboard_id: storyboardId, entity_id: row.entity_id } },
        data: { synced_url: row.selected },
      }),
    ),
  );
}
