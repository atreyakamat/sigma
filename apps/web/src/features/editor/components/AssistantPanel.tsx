import { useQuery } from '@tanstack/react-query';
import { Bot, Send, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { AiChatResponse, AiProviderSummaryDto } from '@sigma/validation';
import { http } from '../../../lib/api';
import { errorText } from '../../../lib/queries';
import { useAuth } from '../../authentication/AuthProvider';
import { useEditorContext } from '../editor-context';
import { useEditorUi } from '../store';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  steps?: AiChatResponse['steps'];
  applied?: number;
  error?: boolean;
}

const SUGGESTIONS = [
  'Add a blue rectangle named Hero 320x200',
  'Create a frame called Home',
  'List layers',
];

/** Chat with the configured AI provider; it reads and edits the open file through tools on the server. */
export function AssistantPanel() {
  const { meta, readOnly } = useEditorContext();
  const { user } = useAuth();
  const providers = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => http.get<AiProviderSummaryDto[]>('/ai/providers'),
  });
  const [providerId, setProviderId] = useState<string>('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: scrollIntoView may return a Promise, which must not become the effect's cleanup.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    try {
      const res = await http.post<AiChatResponse>(`/documents/${meta.documentId}/ai/chat`, {
        ...(providerId ? { providerId } : {}),
        messages: next.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content })),
      });
      setTurns([
        ...next,
        {
          role: 'assistant',
          content: res.reply || '(no reply)',
          steps: res.steps,
          applied: res.applied,
        },
      ]);
      // Realtime sessions receive the change through the room; otherwise reload the file.
      if (res.applied > 0 && !useEditorUi.getState().realtime)
        window.dispatchEvent(new CustomEvent('sigma:reload-document'));
    } catch (e) {
      setTurns([...next, { role: 'assistant', content: errorText(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (providers.data && providers.data.length === 0)
    return (
      <div className="p-4 text-[12px] text-ink-300" data-testid="assistant-empty">
        <Sparkles size={16} className="mb-2 text-accent-300" />
        <p className="mb-2 font-medium text-ink-100">No AI provider yet</p>
        <p className="mb-3 text-ink-400">
          Connect Claude, OpenAI, a local model (Ollama, LM Studio) or the built-in demo to chat
          with an assistant that can edit this file.
        </p>
        {user?.systemRole === 'ADMIN' ? (
          <Link
            to="/admin/ai"
            className="rounded-md bg-accent-500 px-3 py-1.5 font-medium text-white hover:bg-accent-400"
          >
            Add a provider
          </Link>
        ) : (
          <p className="text-ink-500">
            Ask an administrator to add one under Admin → AI providers.
          </p>
        )}
      </div>
    );

  return (
    <div className="flex h-full flex-col" data-testid="assistant-panel">
      <div className="flex items-center gap-2 border-b border-ink-700 px-2 py-1.5">
        <Bot size={13} className="text-accent-300" />
        <select
          className="field h-6 flex-1 text-[11px]"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          aria-label="AI provider"
        >
          <option value="">Default provider</option>
          {providers.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.model}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 scrollbar-thin">
        {turns.length === 0 && (
          <div className="text-[11px] text-ink-400">
            <p className="mb-2">
              Ask for changes in plain language.{' '}
              {readOnly
                ? 'You have view-only access, so the assistant can describe the file but not change it.'
                : 'Edits appear on the canvas for everyone in the file and can be undone from Version history.'}
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="mb-1 block w-full rounded-md bg-ink-800 px-2 py-1.5 text-left text-ink-200 hover:bg-ink-700"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div
            key={i}
            className={`rounded-md px-2 py-1.5 text-[12px] ${t.role === 'user' ? 'ml-6 bg-accent-500/20 text-ink-100' : t.error ? 'mr-4 border border-red-500/40 bg-red-500/10 text-red-200' : 'mr-4 bg-ink-800 text-ink-200'}`}
            data-testid={`assistant-${t.role}`}
          >
            <div className="whitespace-pre-wrap break-words">{t.content}</div>
            {t.steps && t.steps.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-ink-400">
                {t.steps.map((s, j) => (
                  <span
                    key={j}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${s.isError ? 'bg-red-500/20 text-red-200' : 'bg-ink-700'}`}
                  >
                    <Wrench size={9} />{' '}
                    {s.tool === 'apply_document_ops' ? `edited: ${s.summary}` : s.summary}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-4 animate-pulse rounded-md bg-ink-800 px-2 py-1.5 text-[12px] text-ink-400">
            Working…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-1 border-t border-ink-700 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          className="field min-h-[34px] flex-1 resize-none py-1.5 text-[12px]"
          rows={2}
          placeholder="Describe a change…"
          value={draft}
          data-testid="assistant-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button
          type="submit"
          className="icon-btn h-8 w-8 bg-accent-500 text-white hover:bg-accent-400 disabled:opacity-40"
          disabled={busy || !draft.trim()}
          title="Send"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}
