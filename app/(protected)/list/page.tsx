import { getDb } from '@/src/lib/db';

export const dynamic = 'force-dynamic';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import Link from 'next/link';
import { FilmIcon, Plus, ExternalLink } from 'lucide-react';
import { StoryboardRowActions } from './StoryboardRowActions';

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
          <h1 className="display-serif" style={{ fontSize: 40, lineHeight: 0.95, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Archive
          </h1>
          <p
            className="mt-2"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-dim)' }}
          >
            {storyboards.length} storyboard{storyboards.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild style={{ borderRadius: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          <Link href="/">
            <Plus className="h-4 w-4" />
            New
          </Link>
        </Button>
      </div>

      {storyboards.length === 0 ? (
        <div className="glass p-12 text-center">
          <FilmIcon className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--ink-ghost)' }} />
          <p style={{ color: 'var(--ink-dim)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            No storyboards yet.
          </p>
          <Button asChild className="mt-4" variant="secondary" style={{ borderRadius: 0 }}>
            <Link href="/">Create your first storyboard</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-px" style={{ borderTop: '1px solid var(--ink)' }}>
          {storyboards.map((sb) => {
            const statusInfo = STATUS_LABELS[sb.status] ?? { label: sb.status, variant: 'default' as const };
            const parsed = sb.parsed_json as Record<string, unknown> | null;
            const shots = parsed && Array.isArray(parsed['shots']) ? parsed['shots'] : null;
            const shotCount = shots !== null ? shots.length : null;

            return (
              <div
                key={sb.id}
                className="bg-[var(--paper)] px-5 py-4 flex items-center justify-between gap-4 hover:bg-[var(--paper-warm)] transition-colors"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="display-serif truncate" style={{ fontSize: 17, color: 'var(--ink)' }}>{sb.title}</h3>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginTop: 3 }}>
                    {sb.created_at.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {shotCount !== null && ` · ${shotCount} shots`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs gap-1" style={{ borderRadius: 0 }}>
                    <Link href={`/?sb=${sb.id}`}>
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Link>
                  </Button>
                  <StoryboardRowActions id={sb.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
