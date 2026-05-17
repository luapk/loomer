import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
  available: boolean;
}

const GEMINI_IMAGE_MODELS: Omit<ImageModel, 'available'>[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    description: 'Fast, high quality (recommended)',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    description: 'Fast, good quality',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    description: 'Highest quality, strong character consistency',
  },
];

// In-memory cache so we don't re-probe on every settings panel open.
// Keyed by model ID, value is { available, expiresAt }.
const probeCache = new Map<string, { available: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function probeModel(ai: GoogleGenAI, modelId: string): Promise<boolean> {
  const cached = probeCache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) return cached.available;

  let available = true;
  try {
    // Text-only call — doesn't burn image quota, just checks API access.
    // Image-only models will throw "unsupported modality", not a quota error.
    await ai.models.generateContent({ model: modelId, contents: 'hi' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('billing');
    if (isQuota) available = false;
    // Any other error (wrong modality, model exists but text not supported) → still available
  }

  probeCache.set(modelId, { available, expiresAt: Date.now() + CACHE_TTL_MS });
  return available;
}

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    // No key — return all models marked unavailable
    return NextResponse.json({
      models: GEMINI_IMAGE_MODELS.map((m) => ({ ...m, available: false })),
    });
  }

  const ai = new GoogleGenAI({ apiKey });
  const models = await Promise.all(
    GEMINI_IMAGE_MODELS.map(async (m) => ({
      ...m,
      available: await probeModel(ai, m.id),
    })),
  );

  return NextResponse.json({ models });
}
