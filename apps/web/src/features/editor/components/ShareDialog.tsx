import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ShareLinkDto, ShareLinkRole } from '@sigma/validation';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { toast } from '../../../components/ui/toast';
import { http } from '../../../lib/api';
import { shareLinkUrl } from '../../../lib/export-urls';
import { useApiMutation } from '../../../lib/queries';
import { useEditorContext } from '../editor-context';

const EXPIRIES: { value: number | ''; label: string }[] = [
  { value: '', label: 'Never expires' },
  { value: 24, label: '1 day' },
  { value: 24 * 7, label: '7 days' },
  { value: 24 * 30, label: '30 days' },
];

/** Create, copy and revoke share links for the current document. */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { meta } = useEditorContext();
  const key = ['share-links', meta.documentId];
  const links = useQuery({
    queryKey: key,
    queryFn: () => http.get<ShareLinkDto[]>(`/documents/${meta.documentId}/share-links`),
  });
  const [role, setRole] = useState<ShareLinkRole>('VIEWER');
  const [expires, setExpires] = useState<number | ''>('');
  const [created, setCreated] = useState<ShareLinkDto | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useApiMutation(
    () =>
      http.post<ShareLinkDto>(`/documents/${meta.documentId}/share-links`, {
        role,
        ...(expires ? { expiresInHours: expires } : {}),
      }),
    [key],
    (link) => setCreated(link),
  );
  const revoke = useApiMutation(
    (id: string) => http.delete(`/share-links/${id}`),
    [key],
    () => toast.success('Link revoked'),
  );
  const url = created?.token ? shareLinkUrl(created.token) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.info('Select the link and copy it manually');
    }
  };
  return (
    <Modal title="Share this file" onClose={onClose}>
      <p className="mb-3 text-[12px] text-ink-300">
        Anyone with a link can open a read-only view of this file without an account. Revoke a link
        at any time.
      </p>
      <div className="mb-3 flex items-center gap-2">
        <select
          className="field h-8 flex-1"
          value={role}
          onChange={(e) => setRole(e.target.value as ShareLinkRole)}
          aria-label="Link access"
        >
          <option value="VIEWER">Can view</option>
          <option value="COMMENTER">Can view (comments coming later)</option>
        </select>
        <select
          className="field h-8 flex-1"
          value={expires}
          onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : '')}
          aria-label="Link expiry"
        >
          {EXPIRIES.map((e) => (
            <option key={String(e.value)} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={() => create.mutate(undefined as never)}
          disabled={create.isPending}
          data-testid="create-share-link"
        >
          <Link2 size={13} /> Create link
        </Button>
      </div>
      {created?.token && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-ink-800 p-2">
          <input
            readOnly
            className="field h-8 flex-1 font-mono text-[11px]"
            value={url}
            data-testid="share-link-url"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button variant="secondary" onClick={() => void copy()}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        Active links
      </div>
      <ul className="mt-1 divide-y divide-ink-700 text-[12px]">
        {links.data?.length === 0 && <li className="py-2 text-ink-500">No links yet.</li>}
        {links.data?.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between py-2"
            data-testid="share-link-row"
          >
            <span>
              {l.role === 'VIEWER' ? 'Can view' : 'Can comment'} · created{' '}
              {new Date(l.createdAt).toLocaleDateString()}
              {l.expiresAt
                ? ` · expires ${new Date(l.expiresAt).toLocaleDateString()}`
                : ' · never expires'}
            </span>
            <button
              className="icon-btn h-6 w-6 text-red-300"
              title="Revoke"
              onClick={() => revoke.mutate(l.id)}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
