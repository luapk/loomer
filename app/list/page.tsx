import { getDb } from '@/src/lib/db';

export const dynamic = 'force-dynamic';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import Link from 'next/link';
import { FilmIcon, Plus } from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'outline' | 'success' | 'warning' | 'error' }> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  PARSED: { label: 'Parsed', variant: 'success' },
  REFS_PENDING: { label: 'Refs pending', variant: 'warning' },
  REFS_APPROVED: { label: 'Refs approved', variant: 'warning' },
  SHOTS_GENERATING: { label: 'Generating shots', variant: 'warning' },
  COMPLETE: { label: 'Complete', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'error' },
};

export default async function ListPage() {
  const storyboards = await getDb().storyboard.findMany({
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      created_at: true,
      parsed_json: true,
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Storyboards</h1>
          <p className="mt-1 text-stone-500 text-sm">{storyboards.length} total</p>
        </div>
        <Button asChild>
          <Link href="/">
            <Plus className="h-4 w-4" />
            New
          </Link>
        </Button>
      </div>

      {storyboards.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <FilmIcon className="h-8 w-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">No storyboards yet.</p>
          <Button asChild className="mt-4" variant="secondary">
            <Link href="/">Create your first storyboard</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {storyboards.map((sb) => {
            const statusInfo = STATUS_LABELS[sb.status] ?? { label: sb.status, variant: 'default' as const };
            // parsed_json is an opaque blob from Prisma — we just want the shot count for display
            const parsed = sb.parsed_json as Record<string, unknown> | null;
            const shots = parsed && Array.isArray(parsed['shots']) ? parsed['shots'] : null;
            const shotCount = shots !== null ? shots.length : null;

            return (
              <div key={sb.id} className="glass rounded-2xl p-5 flex items-center justify-between gap-4 hover:bg-white/70 transition-colors">
                <div className="min-w-0">
                  <h3 className="font-medium text-stone-900 truncate">{sb.title}</h3>
                  <p className="text-xs text-stone-400 font-mono mt-0.5">
                    {sb.created_at.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {shotCount !== null && ` · ${shotCount} shots`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
