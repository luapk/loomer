'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, FilmIcon, HelpCircle, CreditCard, Palette, LogOut } from 'lucide-react';

const ITEMS = [
  { href: '/list', label: 'Projects', icon: FilmIcon },
  { href: '/?how=1', label: 'How it works', icon: HelpCircle },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/styles', label: 'Styles', icon: Palette },
] as const;

export function NavMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Balance is fetched when the menu opens, so it's current each time rather
  // than stale from page load.
  useEffect(() => {
    if (!open || isAdmin) return;
    fetch('/api/credits')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { balance?: number } | null) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
      })
      .catch(() => { /* the menu still works without it */ });
  }, [open, isAdmin]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed top-4 right-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-stone-200 flex items-center justify-center text-stone-700 hover:text-stone-900 hover:border-stone-300 transition-colors"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-lg border border-stone-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100">
            <p className="text-xs text-stone-500 truncate">{email}</p>
            <p className="text-xs text-stone-400 mt-0.5 tabular-nums">
              {isAdmin
                ? 'Admin — generation not charged'
                : balance === null ? 'Checking credits…' : `${balance} credits`}
            </p>
          </div>

          <nav className="py-1">
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <Icon className="h-4 w-4 text-stone-400" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-stone-100 py-1">
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                setOpen(false);
                router.push('/login');
                router.refresh();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-800 transition-colors"
            >
              <LogOut className="h-4 w-4 text-stone-400" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
