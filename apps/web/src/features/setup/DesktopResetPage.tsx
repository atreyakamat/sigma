import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { PasswordSchema } from '@sigma/validation';
import { Button } from '../../components/ui/Button';

interface DesktopBridge {
  resetPassword(password: string, email?: string): Promise<{ email: string }>;
}

/**
 * Password reset inside the desktop app (menu → Reset password…). It works only in the SIGMA
 * window on the computer that runs SIGMA; in a browser there is no bridge and the page says so.
 */
export function DesktopResetPage() {
  const bridge = (window as unknown as { sigmaDesktop?: DesktopBridge }).sigmaDesktop;
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = PasswordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    if (password !== confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError(null);
    try {
      const res = await bridge!.resetPassword(password, email.trim() || undefined);
      qc.setQueryData(['me'], null);
      setDone(res.email);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : 'The password could not be reset',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-900 p-6 text-ink-100">
      <div
        className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 p-8"
        data-testid="desktop-reset"
      >
        <h1 className="text-[18px] font-semibold">Reset password</h1>
        {!bridge ? (
          <p className="mt-2 text-[12px] text-ink-300">
            Passwords can only be reset from the SIGMA app on the computer that runs it (menu SIGMA
            → Reset password…). If someone else hosts SIGMA for you, ask them or an administrator to
            reset yours.
          </p>
        ) : done ? (
          <>
            <p className="mt-2 text-[12px] text-ink-300" data-testid="reset-done">
              The password for <b>{done}</b> was changed and that account was signed out everywhere.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block rounded-md bg-accent-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-400"
            >
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="mb-4 mt-1 text-[12px] text-ink-400">
              Choose a new password. Leave the email empty to reset the owner account.
            </p>
            <label className="mb-3 block text-[12px]">
              <span className="mb-1 block text-ink-300">Email (optional)</span>
              <input
                className="field h-9"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="mb-3 block text-[12px]">
              <span className="mb-1 block text-ink-300">New password</span>
              <input
                className="field h-9"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="mb-4 block text-[12px]">
              <span className="mb-1 block text-ink-300">Repeat new password</span>
              <input
                className="field h-9"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              {busy ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
