import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/src/lib/auth';
import { getDb } from '@/src/lib/db';
import { ensureStarterCredits, getBalance, IMAGE_CREDIT_COST, PARSE_CREDIT_COST } from '@/src/lib/credits';
import { Badge } from '@/src/components/ui/badge';
import { AdminGrantPanel } from './AdminGrantPanel';
import { BuyCredits } from './BuyCredits';
import { PACKS, isConfigured as stripeConfigured } from '@/src/lib/stripe';

export const dynamic = 'force-dynamic';

const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-flash-image': 'Flash — fastest, best value',
  'gemini-3.1-flash-image-preview': 'Flash 3.1 — sharper detail',
  'gemini-3-pro-image-preview': 'Pro — highest fidelity',
};

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'signup_bonus': return 'Welcome credits';
    case 'purchase': return 'Purchase';
    case 'grant': return 'Added by admin';
    case 'refund': return 'Refund';
    case 'debit': return 'Generation';
    default: return reason;
  }
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const db = getDb();
  const isAdmin = session.role === 'ADMIN';
  if (!isAdmin) await ensureStarterCredits(db, session.uid);

  const [balance, entries] = await Promise.all([
    getBalance(db, session.uid),
    db.creditLedger.findMany({
      where: { user_id: session.uid },
      orderBy: { created_at: 'desc' },
      take: 30,
      select: { id: true, delta: true, reason: true, note: true, created_at: true },
    }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Billing</h1>
        <p className="mt-1 text-stone-500 text-sm">Credits pay for image generation and script parsing.</p>
      </div>

      {/* Balance */}
      <div className="glass rounded-2xl p-6">
        {isAdmin ? (
          <>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Balance</p>
            <p className="text-3xl font-semibold text-stone-900 mt-1">Unlimited</p>
            <p className="text-sm text-stone-500 mt-2">
              You&rsquo;re an admin — generation runs on the house keys and isn&rsquo;t charged.
              Your usage is still recorded below.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Balance</p>
            <p className="text-3xl font-semibold text-stone-900 mt-1 tabular-nums">
              {balance} <span className="text-base font-normal text-stone-400">credits</span>
            </p>
            {balance <= 20 && (
              <p className="text-sm text-amber-700 mt-2">
                Running low — roughly {Math.max(0, Math.floor(balance / 42))} more storyboards at this level.
              </p>
            )}
          </>
        )}
      </div>

      {/* Packs */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900">Top up</h2>
        <BuyCredits
          configured={stripeConfigured()}
          packs={PACKS.map((p) => ({
            id: p.id,
            label: p.label,
            credits: p.credits,
            note: p.note,
            highlight: p.id === 'medium',
          }))}
        />
      </div>

      {/* What things cost */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900">What things cost</h2>
        <div className="glass rounded-2xl divide-y divide-stone-100">
          {Object.entries(IMAGE_CREDIT_COST).map(([model, cost]) => (
            <div key={model} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-stone-700">{MODEL_LABELS[model] ?? model}</span>
              <span className="text-sm text-stone-500 tabular-nums">
                {cost} {cost === 1 ? 'credit' : 'credits'} / image
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-stone-700">Script parse</span>
            <span className="text-sm text-stone-500 tabular-nums">{PARSE_CREDIT_COST} credits</span>
          </div>
        </div>
        <p className="text-xs text-stone-400">
          A typical 24-shot storyboard uses about 42 credits on Flash — reference stills included.
          Anything that fails to render is refunded automatically.
        </p>
      </div>

      {/* History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-900">History</h2>
        {entries.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-stone-400">Nothing yet.</p>
          </div>
        ) : (
          <div className="glass rounded-2xl divide-y divide-stone-100">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-stone-700">{reasonLabel(entry.reason)}</p>
                  {entry.note && <p className="text-xs text-stone-400 truncate">{entry.note}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-stone-400">
                    {entry.created_at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <span
                    className={`text-sm tabular-nums font-medium ${entry.delta > 0 ? 'text-green-700' : 'text-stone-600'}`}
                  >
                    {entry.delta > 0 ? '+' : ''}{entry.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-900">Accounts</h2>
            <Badge variant="outline">Admin</Badge>
          </div>
          <AdminGrantPanel />
        </div>
      )}

      <div className="pt-2">
        <Link href="/list" className="text-xs text-stone-400 hover:text-stone-700 transition-colors">
          ← Back to projects
        </Link>
      </div>
    </div>
  );
}
