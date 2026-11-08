import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ApiTokenDto, CreatedTokenResponse } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { http } from '../../lib/api';
import { useApiMutation } from '../../lib/queries';
import { useQuery } from '@tanstack/react-query';

export function TokensPage() {
  const key = ['api-tokens'];
  const tokens = useQuery({
    queryKey: key,
    queryFn: () => http.get<ApiTokenDto[]>('/auth/tokens'),
  });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [secret, setSecret] = useState<CreatedTokenResponse | null>(null);
  const create = useApiMutation(
    (body: { name: string; expiresInDays?: number }) =>
      http.post<CreatedTokenResponse>('/auth/tokens', body),
    [key],
    (r) => {
      setAdding(false);
      setName('');
      setSecret(r);
    },
  );
  const revoke = useApiMutation((id: string) => http.delete(`/auth/tokens/${id}`), [key]);
  const origin = window.location.origin;

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader
        crumbs={[{ label: 'API tokens' }]}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> New token
          </Button>
        }
      />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold">API tokens</h1>
        <p className="mb-6 mt-1 text-[12px] text-ink-400">
          Tokens act as you with your workspace roles. Use them from CI, scripts, or the{' '}
          <code>sigma</code> CLI to export frames and design tokens.
        </p>
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase text-ink-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Token</th>
              <th>Last used</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.data?.map((t) => (
              <tr key={t.id} className="border-t border-ink-700">
                <td className="py-2">{t.name}</td>
                <td className="font-mono text-ink-300">{t.prefix}…</td>
                <td className="text-ink-400">
                  {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'never'}
                </td>
                <td className="text-ink-400">
                  {t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'never'}
                </td>
                <td className="text-right">
                  <button
                    className="icon-btn h-7 w-7"
                    title="Revoke"
                    onClick={() => confirm(`Revoke "${t.name}"?`) && revoke.mutate(t.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {tokens.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-ink-500">
                  No tokens yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <section className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-4 text-[12px]">
          <h2 className="mb-2 font-semibold">Using a token</h2>
          <pre className="overflow-x-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] text-ink-300">{`# Render a frame as PNG at 2x
curl -H "Authorization: Bearer sgm_…" "${origin}/api/v1/documents/<documentId>/export.png?frame=<frameId>&scale=2" -o home.png

# Design tokens as CSS variables (approved frames only)
curl -H "Authorization: Bearer sgm_…" "${origin}/api/v1/documents/<documentId>/tokens.css?approved=true"

# CLI: SIGMA_URL=${origin} SIGMA_TOKEN=sgm_… sigma export-all <documentId> ./frames --format png --scale 2`}</pre>
        </section>
      </main>
      {adding && (
        <Modal title="New API token" onClose={() => setAdding(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim())
                create.mutate({
                  name: name.trim(),
                  expiresInDays: days ? Number(days) : undefined,
                });
            }}
          >
            <Field label="Name (what it is for)">
              <input
                className="field h-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Expires in days (empty = never)">
              <input
                className="field h-9"
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
                Create
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal title={`Token "${secret.token.name}"`} onClose={() => setSecret(null)}>
          <p className="mb-3 text-[12px] text-ink-300">Copy it now; it will not be shown again.</p>
          <div
            className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-[12px] text-amber-100"
            data-testid="api-token-secret"
          >
            <span className="flex-1 select-all break-all">{secret.secret}</span>
            <button
              className="icon-btn h-7 w-7"
              onClick={() =>
                navigator.clipboard?.writeText(secret.secret).then(() => toast.success('Copied'))
              }
            >
              <Copy size={13} />
            </button>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setSecret(null)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
