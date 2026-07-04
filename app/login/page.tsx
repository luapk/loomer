'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [needsInvite, setNeedsInvite] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/signup';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'signup'
          ? { email, password, inviteCode: inviteCode || undefined }
          : { email, password },
      ),
    });

    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (data.code === 'INVITE_REQUIRED') setNeedsInvite(true);
      setError(data.error ?? (mode === 'signin' ? 'Sign in failed.' : 'Sign up failed.'));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-stone-900 mb-1">Loomer</h1>
          <p className="text-sm text-stone-500 mb-8">
            {mode === 'signin' ? 'Sign in to continue.' : 'Create your account.'}
          </p>

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
              autoFocus
              autoComplete="email"
              required
            />
            <input
              type="password"
              placeholder={mode === 'signup' ? 'Password (min 8 characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
            {mode === 'signup' && needsInvite && (
              <input
                type="text"
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-colors"
                required
              />
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => { setMode((m) => (m === 'signin' ? 'signup' : 'signin')); setError(''); }}
            className="mt-6 w-full text-center text-xs text-stone-500 hover:text-stone-900 transition-colors"
          >
            {mode === 'signin'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
