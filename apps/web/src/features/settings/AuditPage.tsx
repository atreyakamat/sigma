import { useQuery } from '@tanstack/react-query';
import { AppHeader } from '../../components/AppHeader';
import { http } from '../../lib/api';

interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

export function AuditPage() {
  const log = useQuery({
    queryKey: ['audit'],
    queryFn: () => http.get<AuditEntry[]>('/audit?limit=200'),
    refetchInterval: 15_000,
  });
  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader crumbs={[{ label: 'Audit log' }]} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="mb-6 mt-1 text-[12px] text-ink-400">
          Sign-ins, account changes, membership changes, deletions and token activity. Newest first.
        </p>
        <table className="w-full text-left text-[12px]" data-testid="audit-table">
          <thead className="text-[11px] uppercase text-ink-400">
            <tr>
              <th className="py-2">When</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Target</th>
              <th>IP</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.map((e) => (
              <tr key={e.id} className="border-t border-ink-700 align-top">
                <td className="py-2 whitespace-nowrap text-ink-400">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td>
                  <code className="rounded bg-ink-800 px-1 py-0.5 text-[11px]">{e.action}</code>
                </td>
                <td className="font-mono text-[11px] text-ink-400">
                  {e.actorId?.slice(0, 8) ?? '—'}
                </td>
                <td className="font-mono text-[11px] text-ink-400">
                  {e.targetType ? `${e.targetType} ${e.targetId?.slice(0, 8) ?? ''}` : '—'}
                </td>
                <td className="text-ink-400">{e.ip ?? '—'}</td>
                <td className="max-w-xs truncate font-mono text-[11px] text-ink-500">
                  {e.metadata ? JSON.stringify(e.metadata) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
