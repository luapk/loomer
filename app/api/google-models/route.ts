import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
}

// Models confirmed working as of May 2026.
// All use generateContent + responseModalities:['IMAGE'] — requires a paid Google AI key.
const GEMINI_IMAGE_MODELS: ImageModel[] = [
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
];

export async function GET() {
  return NextResponse.json({ models: GEMINI_IMAGE_MODELS, source: 'static' });
}
