import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
}

// Static fallback — used when the API key is absent or model listing fails.
// Ordered best-first.
const FALLBACK_MODELS: ImageModel[] = [
  {
    id: 'imagen-3.0-generate-001',
    label: 'Imagen 3',
    description: 'Best quality',
  },
  {
    id: 'imagen-3.0-fast-generate-001',
    label: 'Imagen 3 Fast',
    description: 'Faster, lower cost',
  },
];

// Pretty-print the raw model name returned by the API.
// e.g. "imagen-3.0-generate-002" → "Imagen 3.0 002"
// e.g. "imagen-4.0-generate-preview-05-20" → "Imagen 4.0 Preview"
function formatLabel(name: string): string {
  if (name.includes('imagen-4')) {
    return name.includes('preview') ? 'Imagen 4 Preview' : 'Imagen 4';
  }
  if (name.includes('imagen-3.0-fast')) return 'Imagen 3 Fast';
  if (name.includes('imagen-3.0')) return 'Imagen 3';
  if (name.includes('imagen-3')) return 'Imagen 3';
  // Fallback: capitalise and strip hyphens
  return name.replace(/(^|-)(\w)/g, (_, __, c: string) => ' ' + c.toUpperCase()).trim();
}

function formatDescription(name: string): string {
  if (name.includes('preview')) return 'Preview — may change';
  if (name.includes('fast')) return 'Faster, lower cost';
  if (name.includes('imagen-4')) return 'Latest generation';
  return 'Best quality';
}

export async function GET() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
      { next: { revalidate: 300 } }, // cache for 5 min — model list rarely changes
    );

    if (!res.ok) {
      return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
    }

    const data = (await res.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[]; displayName?: string }[];
    };

    const imagenModels: ImageModel[] = (data.models ?? [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateImages'),
      )
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          label: formatLabel(id),
          description: formatDescription(id),
        };
      })
      // Best models first: Imagen 4 > Imagen 3 > fast > everything else
      .sort((a, b) => {
        const rank = (id: string) => {
          if (id.includes('imagen-4') && !id.includes('fast') && !id.includes('preview')) return 0;
          if (id.includes('imagen-4') && id.includes('preview')) return 1;
          if (id.includes('imagen-3') && !id.includes('fast')) return 2;
          if (id.includes('imagen-3') && id.includes('fast')) return 3;
          return 4;
        };
        return rank(a.id) - rank(b.id);
      });

    if (imagenModels.length === 0) {
      return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
    }

    return NextResponse.json({ models: imagenModels, source: 'api' });
  } catch {
    return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback' });
  }
}
