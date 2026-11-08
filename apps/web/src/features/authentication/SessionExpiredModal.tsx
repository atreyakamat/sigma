import { useState } from 'react';
import { create } from 'zustand';
import type { MeResponse } from '@sigma/validation';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ApiRequestError, http } from '../../lib/api';
import { useAuth } from './AuthProvider';

interface SessionState {
  expired: boolean;
  setExpired(v: boolean): void;
}
/** Set by the API client on 401 while an editor is open, so unsaved work is never lost to a redirect. */
export const useSessionState = create<SessionState>((set) => ({
  expired: false,
  setExpired: (expired) => set({ expired }),
}));

export function SessionExpiredModal({ onSignedIn }: { onSignedIn: () => void }) {
  const { user } = useAuth();
  const { expired, setExpired } = useSessionState();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!expired) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await http.post<MeResponse>('/auth/login', { email: user?.email ?? '', password });
      setExpired(false);
      setPassword('');
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Your session expired" onClose={() => undefined}>
      <p className="mb-3 text-[12px] text-ink-300">
        Your edits are kept in this tab. Sign in again to keep saving as{' '}
        <strong>{user?.email}</strong>.
      </p>
      <form onSubmit={submit}>
        <input
          className="field mb-3 h-9"
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {error && (
          <div role="alert" className="mb-3 text-[12px] text-red-300">
            {error}
          </div>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !password}>
          Sign in and resume
        </Button>
      </form>
    </Modal>
  );
}
