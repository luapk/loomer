import { NextResponse } from 'next/server';
import { requireSession } from '@/src/lib/auth';
import { VOICES, isConfigured, verifyVoices } from '@/src/lib/elevenlabs';

export const dynamic = 'force-dynamic';

/**
 * The voice shortlist for the picker. `?verify=1` (admin only) additionally
 * checks each voice id against the ElevenLabs account — the quickest way to
 * find out a stock voice has been retired upstream.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (auth instanceof NextResponse) return auth;

  const configured = isConfigured();

  if (new URL(request.url).searchParams.get('verify') === '1' && auth.role === 'ADMIN') {
    return NextResponse.json({ configured, voices: await verifyVoices() });
  }

  return NextResponse.json({
    configured,
    voices: VOICES.map((v) => ({ slot: v.slot, label: v.label, description: v.description })),
  });
}
