import type { Page, APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Test helpers.
 *
 * Storyboards are seeded straight into the database rather than created through
 * the UI: creating one for real calls Claude and costs money, and none of these
 * tests are about the parser.
 */

let prisma: PrismaClient | null = null;
export function db(): PrismaClient {
  if (prisma) return prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — see tests/README.md');
  }
  // Same driver-adapter setup as src/lib/db.ts: prisma.config.ts means the
  // schema carries no url, so a bare `new PrismaClient()` cannot connect.
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });
  return prisma;
}

/** Unique per run so repeated runs don't collide on the email unique index. */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export const PASSWORD = 'test-password-123';

/** Signs up through the real API so password hashing and cookies are exercised. */
export async function signUp(page: Page, email: string): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`signup failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

export async function logIn(page: Page, email: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
}

export async function logOut(request: APIRequestContext): Promise<void> {
  await request.post('/api/auth/logout');
}

/** A minimal parsed board — enough shape for the routes under test. */
export function minimalParsedJson(title = 'Seeded board') {
  return {
    title,
    format: 'Short film',
    duration: '30s',
    aspect_ratio: '16:9',
    total_shots: 1,
    style_lock: {
      dp: 'Test DP',
      film_stock: 'Test stock',
      colour_palette: 'Muted',
      lighting: 'Natural',
      lens_default: '35mm',
    },
    // One of each so reference generation has real work to cost credits for —
    // an empty board plans zero images and is never charged.
    characters: [{
      id: 'CHAR-TEST', name: 'Test Character',
      full_description: 'A person.',
      reference_still_prompt: 'A person, neutral lighting, plain background.',
      wardrobe: null, distinguishing_features: null, casting_note: null,
    }],
    locations: [{
      id: 'LOC-TEST', name: 'Test Location',
      full_description: 'A room.',
      reference_still_prompt: 'An empty room, wide establishing shot.',
      time_of_day: 'Day', lighting: 'Natural',
    }],
    props: [],
    shots: [{
      shot_number: 1,
      descriptor: 'Seeded shot',
      function: 'Test fixture',
      grammar: {
        scale: 'MS', angle: 'Eye-level', triangle_position: 'External reverse',
        camera_move: 'Static', lens: '35mm', line_of_interest: 'n/a',
        screen_direction: 'Neutral', thirty_degree_check: 'n/a',
        cut_in: 'Hard cut', cut_out: 'Hard cut',
      },
      continuity: {
        characters: ['CHAR-TEST'], location_id: 'LOC-TEST', props_persisting: [],
        props_introduced: [], light_direction: 'Front', time_of_day: 'Day',
      },
      action_beat: 'Nothing happens.',
      dialogue_vo: null,
      sound_design: { sfx: null, ambient: null, music: null },
      key_frame_prompt: 'A seeded test frame.',
    }],
    audit: { withholdings: [], visual_rhymes: [], flags_for_review: [] },
  };
}

/** Creates a storyboard owned by the given email, bypassing the parser. */
export async function seedStoryboard(email: string, title = 'Seeded board') {
  const user = await db().user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`seedStoryboard: no user ${email}`);
  return db().storyboard.create({
    data: {
      title,
      user_id: user.id,
      source_input: 'seed',
      source_markdown: '# Seed',
      status: 'PARSED',
      shot_count: 1,
      // Prisma's Json input type doesn't accept a plain object without a cast.
      parsed_json: minimalParsedJson(title) as unknown as object,
    },
    select: { id: true },
  });
}

/** Drives a user's balance to exactly zero, whatever it currently is. */
export async function drainCredits(email: string): Promise<void> {
  const user = await db().user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`drainCredits: no user ${email}`);
  const sum = await db().creditLedger.aggregate({
    where: { user_id: user.id },
    _sum: { delta: true },
  });
  const balance = sum._sum.delta ?? 0;
  if (balance !== 0) {
    await db().creditLedger.create({
      data: { user_id: user.id, delta: -balance, reason: 'debit', note: 'e2e drain' },
    });
  }
}

export async function balanceOf(email: string): Promise<number> {
  const user = await db().user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`balanceOf: no user ${email}`);
  const sum = await db().creditLedger.aggregate({
    where: { user_id: user.id },
    _sum: { delta: true },
  });
  return sum._sum.delta ?? 0;
}
