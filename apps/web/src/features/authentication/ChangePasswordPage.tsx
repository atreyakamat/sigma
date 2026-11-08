import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChangePasswordBody } from '@sigma/validation';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import { ApiRequestError, http } from '../../lib/api';
import { useAuth } from './AuthProvider';

export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) return setError('Passwords do not match');
    const parsed = ChangePasswordBody.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check your input');
    setBusy(true);
    setError(null);
    try {
      await http.post('/auth/change-password', parsed.data);
      await refresh();
      toast.success('Password updated');
      void navigate('/', { replace: true });
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
        <h1 className="text-[16px] font-semibold">
          {user?.mustChangePassword ? 'Set a new password' : 'Change password'}
        </h1>
        <p className="mb-5 mt-1 text-[12px] text-ink-400">
          {user?.mustChangePassword
            ? 'Your account was created with a temporary password. Choose your own to continue.'
            : 'Use at least 10 characters.'}
        </p>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">
            {user?.mustChangePassword ? 'Temporary password' : 'Current password'}
          </span>
          <input
            className="field h-9"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">New password</span>
          <input
            className="field h-9"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </label>
        <label className="mb-4 block text-[12px]">
          <span className="mb-1 block text-ink-300">Confirm new password</span>
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
          {busy ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </div>
  );
}
