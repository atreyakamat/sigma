import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { MeResponse } from '@sigma/validation';
import { LoginBody } from '@sigma/validation';
import { Button } from '../../components/ui/Button';
import { ApiRequestError, http } from '../../lib/api';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next') ?? '/';
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : next} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = LoginBody.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your input');
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<MeResponse>('/auth/login', parsed.data);
      qc.setQueryData(['me'], res.user);
      void navigate(res.user.mustChangePassword ? '/change-password' : next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-900 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <div className="text-[16px] font-semibold tracking-tight">SIGMA</div>
            <div className="text-[11px] text-ink-400">Sign in to your workspace</div>
          </div>
        </div>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">Email</span>
          <input
            className="field h-9"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mb-4 block text-[12px]">
          <span className="mb-1 block text-ink-300">Password</span>
          <input
            className="field h-9"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200"
          >
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" className="h-9 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="mt-4 text-[11px] text-ink-500">
          Accounts are created by an administrator. Ask yours for an invitation password.
        </p>
      </form>
    </div>
  );
}
