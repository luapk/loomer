'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';

type AccountRow = {
  id: string;
  email: string;
  role: string;
  balance: number;
  spent: number;
};

/** Admin-only: list every account and hand out credits by hand. */
export function AdminGrantPanel() {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/credits');
    if (!res.ok) {
      setError('Could not load accounts');
      setRows([]);
      return;
    }
    const data = await res.json() as { users: AccountRow[] };
    setRows(data.users);
  }

  useEffect(() => { void load(); }, []);

  async function handleGrant(userId: string) {
    const amount = Number(amounts[userId]);
    if (!Number.isInteger(amount) || amount < 1) {
      setError('Enter a whole number of credits');
      return;
    }
    setError(null);
    setBusy(userId);
    try {
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? 'Grant failed');
      } else {
        setAmounts((prev) => ({ ...prev, [userId]: '' }));
        setDone(userId);
        setTimeout(() => setDone(null), 2000);
        await load();
      }
    } catch {
      setError('Network error');
    }
    setBusy(null);
  }

  if (rows === null) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-2 text-xs text-stone-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading accounts…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="glass rounded-2xl divide-y divide-stone-100">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-stone-800 truncate">{row.email}</p>
              <p className="text-xs text-stone-400 tabular-nums">
                {row.role === 'ADMIN'
                  ? 'Admin — not charged'
                  : `${row.balance} credits · ${row.spent} spent`}
              </p>
            </div>
            {row.role !== 'ADMIN' && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={1}
                  placeholder="150"
                  value={amounts[row.id] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-xs tabular-nums focus:outline-none focus:border-stone-400"
                />
                <button
                  type="button"
                  onClick={() => { void handleGrant(row.id); }}
                  disabled={busy === row.id}
                  className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {busy === row.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : done === row.id
                      ? <Check className="h-3 w-3" />
                      : 'Add'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
