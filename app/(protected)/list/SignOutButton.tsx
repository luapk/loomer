'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export function SignOutButton({ email }: { email: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      title={`Signed in as ${email}`}
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
        router.refresh();
      }}
      className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{email}</span>
    </button>
  );
}
