import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
}

// Models confirmed present in the API as of May 2026.
// All use generateContent + responseModalities:['IMAGE'] — requires a paid Google AI key.
const GEMINI_IMAGE_MODELS: ImageModel[] = [
  {
    id: 'nano-banana-pro-preview',
    label: 'Nano Banana Pro',
    description: 'Best quality + multi-ref conditioning (recommended)',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image',
    description: 'High quality, strong character consistency',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash Image',
    description: 'Fast, good quality',
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
    description: 'Fastest, lowest cost',
  },
];

export async function GET() {
  return NextResponse.json({ models: GEMINI_IMAGE_MODELS, source: 'static' });
}
