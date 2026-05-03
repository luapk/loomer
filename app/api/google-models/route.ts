import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImageModel {
  id: string;
  label: string;
  description: string;
}

// These use generateContent + responseModalities:['IMAGE'] — works with
// any Gemini Developer API key, no Vertex AI required.
const GEMINI_IMAGE_MODELS: ImageModel[] = [
  {
    id: 'gemini-2.0-flash-preview-image-generation',
    label: 'Gemini 2.0 Flash',
    description: 'Fast image generation',
  },
  {
    id: 'gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Flash Exp',
    description: 'Experimental variant',
  },
];

export async function GET() {
  return NextResponse.json({ models: GEMINI_IMAGE_MODELS, source: 'static' });
}
