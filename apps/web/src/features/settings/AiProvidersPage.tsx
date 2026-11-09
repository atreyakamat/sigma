import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { AiProviderDto, AiProviderKind } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { http } from '../../lib/api';
import { errorText, useApiMutation } from '../../lib/queries';

const KINDS: {
  value: AiProviderKind;
  label: string;
  hint: string;
  model: string;
  needsKey: boolean;
  needsUrl: boolean;
}[] = [
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    hint: 'Claude models through the Anthropic API.',
    model: 'claude-opus-5-5',
    needsKey: true,
    needsUrl: false,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    hint: 'OpenAI models through the Chat Completions API.',
    model: 'gpt-5',
    needsKey: true,
    needsUrl: false,
  },
  {
    value: 'openai_compatible',
    label: 'OpenAI-compatible endpoint',
    hint: 'Ollama, LM Studio, vLLM, OpenRouter, Groq, Mistral and others. The model must support tool calling.',
    model: 'llama3.1',
    needsKey: false,
    needsUrl: true,
  },
  {
    value: 'demo',
    label: 'Demo (no AI, rule-based)',
    hint: 'Understands a few plain commands. Useful to try the assistant without any account.',
    model: 'demo',
    needsKey: false,
    needsUrl: false,
  },
];

export function AiProvidersPage() {
  const key = ['admin-ai-providers'];
  const list = useQuery({
    queryKey: key,
    queryFn: () => http.get<AiProviderDto[]>('/admin/ai/providers'),
  });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AiProviderKind>('anthropic');
  const [name, setName] = useState('');
  const [model, setModel] = useState('claude-opus-5-5');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string } | 'running'>>(
    {},
  );
  const meta = KINDS.find((k) => k.value === kind)!;
  const invalidate = [key, ['ai-providers']];
  const remove = useApiMutation(
    (id: string) => http.delete(`/admin/ai/providers/${id}`),
    invalidate,
    () => toast.success('Provider removed'),
  );
  const patch = useApiMutation(
    (v: { id: string; body: Record<string, unknown> }) =>
      http.patch(`/admin/ai/providers/${v.id}`, v.body),
    invalidate,
  );
  const create = useApiMutation(
    () =>
      http.post<AiProviderDto>('/admin/ai/providers', {
        name: name.trim() || meta.label,
        kind,
        ...(kind === 'demo' ? {} : { model: model.trim() || meta.model }),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    invalidate,
    () => {
      setOpen(false);
      setName('');
      setApiKey('');
      setBaseUrl('');
      setError(null);
      toast.success('Provider added');
    },
  );
  const pickKind = (k: AiProviderKind) => {
    setKind(k);
    setModel(KINDS.find((x) => x.value === k)!.model);
  };
  const runTest = async (id: string) => {
    setTests((t) => ({ ...t, [id]: 'running' }));
    try {
      const res = await http.post<{ ok: boolean; message: string }>(
        `/admin/ai/providers/${id}/test`,
      );
      setTests((t) => ({ ...t, [id]: res }));
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { ok: false, message: errorText(e) } }));
    }
  };

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader crumbs={[{ label: 'AI providers' }]} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">AI providers</h1>
            <p className="mt-1 text-[12px] text-ink-400">
              Models the in-editor assistant can use. Keys are stored encrypted and never shown
              again. The assistant only sees files the person chatting can see.
            </p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)} data-testid="add-ai-provider">
            <Plus size={14} /> Add provider
          </Button>
        </div>
        <table className="mt-6 w-full text-left text-[12px]" data-testid="ai-providers-table">
          <thead className="text-[11px] uppercase text-ink-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Type</th>
              <th>Model</th>
              <th>Endpoint</th>
              <th>Key</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink-500">
                  No providers yet. Add Claude, OpenAI, a local model, or the demo provider to try
                  the assistant.
                </td>
              </tr>
            )}
            {list.data?.map((p) => {
              const t = tests[p.id];
              return (
                <tr
                  key={p.id}
                  className="border-t border-ink-700 align-middle"
                  data-testid="ai-provider-row"
                >
                  <td className="py-2 font-medium">
                    {p.name}
                    {p.isDefault && (
                      <span className="ml-1 rounded bg-accent-500/20 px-1 text-[10px] text-accent-300">
                        default
                      </span>
                    )}
                  </td>
                  <td className="text-ink-300">
                    {KINDS.find((k) => k.value === p.kind)?.label ?? p.kind}
                  </td>
                  <td className="font-mono text-[11px]">{p.model}</td>
                  <td className="max-w-[12rem] truncate font-mono text-[11px] text-ink-400">
                    {p.baseUrl ?? 'default'}
                  </td>
                  <td className="text-ink-400">{p.hasKey ? 'stored' : '—'}</td>
                  <td>
                    <label className="flex items-center gap-1 text-ink-300">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) =>
                          patch.mutate({ id: p.id, body: { enabled: e.target.checked } })
                        }
                      />{' '}
                      enabled
                    </label>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {t && t !== 'running' && (
                      <span
                        className={`mr-2 inline-flex items-center gap-1 ${t.ok ? 'text-emerald-300' : 'text-red-300'}`}
                        title={t.message}
                        data-testid="ai-test-result"
                      >
                        {t.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{' '}
                        {t.ok ? 'works' : 'failed'}
                      </span>
                    )}
                    <button
                      className="rounded px-2 py-1 hover:bg-ink-700"
                      onClick={() => void runTest(p.id)}
                      disabled={t === 'running'}
                    >
                      {t === 'running' ? 'Testing…' : 'Test'}
                    </button>
                    {!p.isDefault && (
                      <button
                        className="rounded px-2 py-1 hover:bg-ink-700"
                        onClick={() => patch.mutate({ id: p.id, body: { isDefault: true } })}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      className="icon-btn ml-1 inline-flex h-6 w-6 text-red-300"
                      title="Remove"
                      onClick={() => remove.mutate(p.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <section className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-5 text-[12px] text-ink-300">
          <h2 className="mb-1 text-[13px] font-semibold text-ink-100">
            Connect Claude Code or Claude Desktop (MCP)
          </h2>
          <p className="mb-2 text-ink-400">
            SIGMA ships a Model Context Protocol server, so Claude can list files, build screens and
            export images directly. Create a token under Account → API tokens, then:
          </p>
          <pre className="overflow-x-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] text-ink-200">{`claude mcp add sigma \\
  --env SIGMA_URL=${window.location.origin} --env SIGMA_TOKEN=sgm_… \\
  -- node packages/mcp/bin/sigma-mcp.mjs`}</pre>
        </section>
      </main>
      {open && (
        <Modal title="Add AI provider" onClose={() => setOpen(false)}>
          <Field label="Type">
            <select
              className="field h-9"
              value={kind}
              onChange={(e) => pickKind(e.target.value as AiProviderKind)}
              aria-label="Provider type"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="-mt-2 mb-3 text-[11px] text-ink-400">{meta.hint}</p>
          <Field label="Name">
            <input
              className="field h-9"
              value={name}
              placeholder={meta.label}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {kind !== 'demo' && (
            <Field label="Model">
              <input
                className="field h-9 font-mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>
          )}
          {kind !== 'demo' && (
            <Field label={meta.needsUrl ? 'Base URL' : 'Base URL (optional)'}>
              <input
                className="field h-9 font-mono"
                value={baseUrl}
                placeholder={
                  kind === 'openai_compatible'
                    ? 'http://localhost:11434/v1'
                    : 'leave empty for the official endpoint'
                }
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </Field>
          )}
          {kind !== 'demo' && (
            <Field label={meta.needsKey ? 'API key' : 'API key (if the endpoint needs one)'}>
              <input
                className="field h-9 font-mono"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
          )}
          {(error ?? create.error) && (
            <div role="alert" className="mb-3 text-[12px] text-red-300">
              {error ?? errorText(create.error)}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-testid="save-ai-provider"
              disabled={create.isPending}
              onClick={() => {
                if (meta.needsUrl && !baseUrl.trim())
                  return setError('Enter the base URL of the endpoint');
                if (meta.needsKey && !apiKey.trim()) return setError('Enter an API key');
                setError(null);
                create.mutate(undefined as never);
              }}
            >
              Add
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
