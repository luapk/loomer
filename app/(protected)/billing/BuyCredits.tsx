'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Check } from 'lucide-react';

type Pack = { id: string; label: string; credits: number; note: string; highlight?: boolean };

/**
 * Credit purchase and auto-reload.
 *
 * Buying redirects to Stripe's hosted Checkout — no card details ever reach
 * this app. Credits are granted by the webhook when Stripe confirms payment,
 * not on return, so closing the tab mid-payment still credits the account.
 */
export function BuyCredits({ packs, configured }: { packs: Pack[]; configured: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(true);

  const [autoPack, setAutoPack] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(25);
  const [autoFailed, setAutoFailed] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  useEffect(() => {
    // Stripe sends the user back here; the credit itself arrives by webhook,
    // which can land a moment later.
    const params = new URLSearchParams(window.location.search);
    if (params.get('purchase') === 'success') {
      setNotice('Payment received — your credits will appear within a few seconds.');
    } else if (params.get('purchase') === 'cancelled') {
      setNotice('Checkout cancelled — nothing was charged.');
    }
    if (params.has('purchase')) {
      window.history.replaceState(null, '', '/billing');
    }

    fetch('/api/billing/auto-reload')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { pack: string | null; threshold: number; failedAt: string | null } | null) => {
        if (!data) return;
        setAutoPack(data.pack);
        setThreshold(data.threshold);
        setAutoFailed(Boolean(data.failedAt));
      })
      .catch(() => { /* settings just stay at defaults */ });
  }, []);

  async function buy(packId: string) {
    setBusy(packId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: packId, saveCard }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout.');
        setBusy(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error.');
      setBusy(null);
    }
  }

  async function saveAutoReload(pack: string | null, newThreshold = threshold) {
    setSavingAuto(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/auto-reload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack, threshold: newThreshold }),
      });
      if (res.ok) {
        setAutoPack(pack);
        setAutoFailed(false);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Could not save auto top-up.');
      }
    } catch {
      setError('Network error.');
    }
    setSavingAuto(false);
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 flex items-start gap-2">
          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-stone-700">{notice}</p>
        </div>
      )}

      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            Card payment isn&rsquo;t configured on this deployment yet. Ask Paul to add credits
            manually in the meantime.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => { void buy(pack.id); }}
            disabled={!configured || busy !== null}
            className={`rounded-xl border p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-stone-400 ${
              pack.highlight ? 'border-stone-900' : 'border-stone-200'
            }`}
          >
            <p className="text-xl font-semibold text-stone-900 flex items-center gap-2">
              {pack.label}
              {busy === pack.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </p>
            <p className="text-sm text-stone-600 mt-0.5 tabular-nums">{pack.credits} credits</p>
            <p className="text-xs text-stone-400 mt-1">{pack.note}</p>
          </button>
        ))}
      </div>

      {configured && (
        <label className="flex items-center gap-2 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(e) => setSaveCard(e.target.checked)}
            className="rounded border-stone-300"
          />
          Save my card so I can turn on automatic top-ups
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Auto top-up */}
      <div className="rounded-xl border border-stone-200 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-stone-900">Automatic top-up</p>
            <p className="text-xs text-stone-500 mt-0.5">
              {autoPack
                ? `Buys the ${packs.find((p) => p.id === autoPack)?.label ?? autoPack} pack whenever your balance drops below ${threshold} credits.`
                : 'Off — generation stops when you run out.'}
            </p>
          </div>
          {savingAuto && <Loader2 className="h-4 w-4 animate-spin text-stone-400 flex-shrink-0" />}
        </div>

        {autoFailed && (
          <p className="text-xs text-amber-700">
            The last automatic charge was declined — check your card, then re-enable it below.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={autoPack ?? ''}
            onChange={(e) => { void saveAutoReload(e.target.value || null); }}
            disabled={!configured || savingAuto}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Off</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                Top up with {pack.label}
              </option>
            ))}
          </select>

          {autoPack && (
            <label className="text-xs text-stone-500 flex items-center gap-2">
              when below
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onBlur={() => { void saveAutoReload(autoPack, threshold); }}
                className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-xs tabular-nums"
              />
              credits
            </label>
          )}
        </div>

        <p className="text-xs text-stone-400">
          Requires a saved card — tick the box above when you buy, and it charges in the
          background without interrupting a render.
        </p>
      </div>
    </div>
  );
}
