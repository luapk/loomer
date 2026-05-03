import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
}

// These are verified to work with the generateImages endpoint.
// Always shown — the API discovery only adds *newer* models on top.
const STABLE_MODELS: ImageModel[] = [
  { id: 'imagen-3.0-generate-001',      label: 'Imagen 3',      description: 'Best quality' },
  { id: 'imagen-3.0-fast-generate-001', label: 'Imagen 3 Fast', description: 'Faster, lower cost' },
];

function formatLabel(id: string): string {
  if (id.includes('imagen-4') && id.includes('preview')) return 'Imagen 4 Preview';
  if (id.includes('imagen-4')) return 'Imagen 4';
  return id;
}

function formatDescription(id: string): string {
  if (id.includes('preview')) return 'Preview — may change';
  if (id.includes('fast')) return 'Faster, lower cost';
  if (id.includes('imagen-4')) return 'Latest generation';
  return 'Best quality';
}

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ models: STABLE_MODELS, source: 'static' });
  }

  // Try to discover newer models (Imagen 4+) from the API.
  // If discovery fails for any reason, fall back to the stable list.
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) {
      return NextResponse.json({ models: STABLE_MODELS, source: 'static' });
    }

    const data = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };

    // Only surface Imagen 4+ models from the API — Imagen 3 is covered by STABLE_MODELS
    const newerModels: ImageModel[] = (data.models ?? [])
      .filter(
        (m) =>
          m.name.includes('imagen-4') &&
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateImages'),
      )
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return { id, label: formatLabel(id), description: formatDescription(id) };
      })
      .sort((a, b) => {
        // Non-preview before preview
        const preview = (id: string) => (id.includes('preview') ? 1 : 0);
        return preview(a.id) - preview(b.id);
      });

    return NextResponse.json({
      models: [...newerModels, ...STABLE_MODELS],
      source: newerModels.length > 0 ? 'api' : 'static',
    });
  } catch {
    return NextResponse.json({ models: STABLE_MODELS, source: 'static' });
  }
}
