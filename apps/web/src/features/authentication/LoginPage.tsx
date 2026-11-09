import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { MeResponse } from '@sigma/validation';
import { LoginBody } from '@sigma/validation';
import { Button } from '../../components/ui/Button';
import { ApiRequestError, http } from '../../lib/api';
import { useAuth } from './AuthProvider';
import { useT } from '../../lib/i18n';
import { useSetupStatus } from '../setup/SetupPage';

export function LoginPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [code, setCode] = useState('');
  const t = useT();
  const next = params.get('next') ?? '/';
  const setup = useSetupStatus();
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : next} replace />;
  if (setup.data?.needsSetup) return <Navigate to="/setup" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = LoginBody.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your input');
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<MeResponse | { requiresTwoFactor: true }>(
        '/auth/login',
        parsed.data,
      );
      if ('requiresTwoFactor' in res) {
        setTwoFactor(true);
        setBusy(false);
        return;
      }
      qc.setQueryData(['me'], res.user);
      void navigate(res.user.mustChangePassword ? '/change-password' : next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<MeResponse>('/auth/login/2fa', { code });
      qc.setQueryData(['me'], res.user);
      void navigate(res.user.mustChangePassword ? '/change-password' : next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  if (twoFactor) {
    return (
      <div className="flex min-h-full items-center justify-center bg-ink-900 p-6">
        <form
          onSubmit={submitCode}
          className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 p-8"
          data-testid="two-factor-form"
        >
          <h1 className="text-[16px] font-semibold">{t('auth.twoFactorTitle')}</h1>
          <p className="mb-4 mt-1 text-[12px] text-ink-400">{t('auth.twoFactorHint')}</p>
          <label className="mb-4 block text-[12px]">
            <span className="mb-1 block text-ink-300">{t('auth.code')}</span>
            <input
              className="field h-9"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
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
          <Button
            type="submit"
            variant="primary"
            className="h-9 w-full"
            disabled={busy || code.length < 6}
          >
            {t('auth.verify')}
          </Button>
        </form>
      </div>
    );
  }

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
            <div className="text-[11px] text-ink-400">{t('auth.signInSubtitle')}</div>
          </div>
        </div>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">{t('auth.email')}</span>
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
          <span className="mb-1 block text-ink-300">{t('auth.password')}</span>
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
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        <p className="mt-4 text-[11px] text-ink-500">{t('auth.accountsByAdmin')}</p>
      </form>
    </div>
  );
}
