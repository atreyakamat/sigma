import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { SetupBody } from '@sigma/validation';
import type { SetupResponse, SetupStatusDto } from '@sigma/validation';
import { Button } from '../../components/ui/Button';
import { ApiRequestError, http } from '../../lib/api';

export const setupStatusKey = ['setup-status'];
export function useSetupStatus() {
  return useQuery({
    queryKey: setupStatusKey,
    queryFn: () => http.get<SetupStatusDto>('/setup/status'),
    staleTime: 60_000,
    retry: 1,
  });
}

/** First-run screen of the desktop app: create the owner account, then land in a starter file. */
export function SetupPage() {
  const status = useSetupStatus();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createdFile, setCreatedFile] = useState<string | null>(null);

  // After a successful setup go straight to the starter file (this wins over the redirect below).
  if (createdFile) return <Navigate to={`/file/${createdFile}`} replace />;
  if (status.data && !status.data.needsSetup) return <Navigate to="/login" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = SetupBody.safeParse({ name, email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<SetupResponse>('/setup', parsed.data);
      setCreatedFile(res.documentId);
      qc.setQueryData(['me'], res.user);
      qc.setQueryData(setupStatusKey, { desktop: true, needsSetup: false });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach SIGMA');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-900 p-6 text-ink-100">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 p-8"
        data-testid="setup-form"
      >
        <img src="/favicon.svg" alt="" className="mb-4 h-10 w-10" />
        <h1 className="text-[18px] font-semibold">Welcome to SIGMA</h1>
        <p className="mb-5 mt-1 text-[12px] text-ink-400">
          Create your account to get started. Everything stays on this computer.
        </p>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">Your name</span>
          <input
            className="field h-9"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="mb-3 block text-[12px]">
          <span className="mb-1 block text-ink-300">Email</span>
          <input
            className="field h-9"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="mb-4 block text-[12px]">
          <span className="mb-1 block text-ink-300">Password</span>
          <input
            className="field h-9"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-ink-500">At least 10 characters.</span>
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
          {busy ? 'Setting up…' : 'Start designing'}
        </Button>
      </form>
    </div>
  );
}
