/**
 * Voice-over synthesis via ElevenLabs.
 *
 * Four curated voices — male and female, US and UK — rather than the full
 * library. A director picking a scratch VO for a pitch board wants a fast
 * choice between recognisable registers, not a casting session.
 *
 * Called over plain REST. The official SDK would add a dependency for what is
 * one POST returning audio bytes.
 */

const API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * Voice IDs are ElevenLabs' stock library. They can be overridden per slot by
 * env var, because a stock voice can be renamed or retired upstream and the
 * fix should not require a deploy — check /api/voices to see which resolve.
 */
export const VOICES = [
  {
    slot: 'male-us',
    label: 'Male — US',
    description: 'Warm, mid-range American read. Good default for narration.',
    voiceId: process.env.ELEVENLABS_VOICE_MALE_US ?? 'pNInz6obpgDQGcFmaJgB',
  },
  {
    slot: 'female-us',
    label: 'Female — US',
    description: 'Clear, even American read with a natural conversational lift.',
    voiceId: process.env.ELEVENLABS_VOICE_FEMALE_US ?? 'EXAVITQu4vr4xnSDxMaL',
  },
  {
    slot: 'male-uk',
    label: 'Male — UK',
    description: 'Measured British read. Suits documentary and premium brand work.',
    voiceId: process.env.ELEVENLABS_VOICE_MALE_UK ?? 'JBFqnCBsd6RMkjVDRZzb',
  },
  {
    slot: 'female-uk',
    label: 'Female — UK',
    description: 'Bright British read, light and unhurried.',
    voiceId: process.env.ELEVENLABS_VOICE_FEMALE_UK ?? 'pFZP5JQG7iQjIQuC4Bku',
  },
] as const;

export type VoiceSlot = (typeof VOICES)[number]['slot'];

export const DEFAULT_VOICE_SLOT: VoiceSlot = 'male-uk';

export function isVoiceSlot(value: string): value is VoiceSlot {
  return VOICES.some((v) => v.slot === value);
}

export function voiceBySlot(slot: string) {
  return VOICES.find((v) => v.slot === slot) ?? VOICES.find((v) => v.slot === DEFAULT_VOICE_SLOT)!;
}

export function isConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export class VoiceOverError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'VoiceOverError';
  }
}

/**
 * Renders one line to MP3 bytes.
 *
 * `eleven_multilingual_v2` is the quality-oriented model; these are short
 * lines, so latency is dominated by the round trip either way.
 */
export async function synthesize(
  text: string,
  slot: string,
): Promise<{ audio: Buffer; contentType: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new VoiceOverError('ELEVENLABS_API_KEY is not set', 503);
  }

  const voice = voiceBySlot(slot);
  const res = await fetch(`${API_BASE}/text-to-speech/${voice.voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 401 is a bad key; 404 means the voice id no longer resolves on this
    // account, which is exactly what the env overrides exist to fix.
    const hint = res.status === 404
      ? ` — voice "${voice.label}" (${voice.voiceId}) not found on this ElevenLabs account. Override it with ELEVENLABS_VOICE_${voice.slot.toUpperCase().replace('-', '_')}.`
      : '';
    throw new VoiceOverError(
      `ElevenLabs returned ${res.status}${hint} ${detail.slice(0, 300)}`.trim(),
      res.status === 401 ? 503 : 502,
    );
  }

  return {
    audio: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'audio/mpeg',
  };
}

/** Checks which configured voice IDs actually resolve on the account. */
export async function verifyVoices(): Promise<
  { slot: string; label: string; voiceId: string; ok: boolean; name?: string }[]
> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return VOICES.map((v) => ({ ...v, ok: false }));

  return Promise.all(VOICES.map(async (v) => {
    try {
      const res = await fetch(`${API_BASE}/voices/${v.voiceId}`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (!res.ok) return { slot: v.slot, label: v.label, voiceId: v.voiceId, ok: false };
      const data = await res.json() as { name?: string };
      return { slot: v.slot, label: v.label, voiceId: v.voiceId, ok: true, name: data.name };
    } catch {
      return { slot: v.slot, label: v.label, voiceId: v.voiceId, ok: false };
    }
  }));
}
