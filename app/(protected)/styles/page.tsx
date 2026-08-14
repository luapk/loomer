import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/src/lib/auth';
import { MAX_STYLES_PER_USER, MAX_STYLE_IMAGES } from '@/src/lib/styles';
import { StylesManager } from './StylesManager';

export const dynamic = 'force-dynamic';

export default async function StylesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Styles</h1>
        <p className="mt-1 text-stone-500 text-sm">
          Save a look from up to {MAX_STYLE_IMAGES} reference frames, then pick it when
          generating a board. Every reference still and key frame is rendered to match.
        </p>
      </div>

      <StylesManager maxStyles={MAX_STYLES_PER_USER} maxImages={MAX_STYLE_IMAGES} />

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs text-stone-500">
          Pick frames that agree with each other — same palette, same light, same grain.
          Four frames from one sequence teach the model more than four from four films.
        </p>
      </div>

      <div className="pt-2">
        <Link href="/list" className="text-xs text-stone-400 hover:text-stone-700 transition-colors">
          ← Back to projects
        </Link>
      </div>
    </div>
  );
}
