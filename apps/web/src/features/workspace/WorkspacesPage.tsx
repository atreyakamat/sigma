import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { WorkspaceDto } from '@sigma/validation';
import { CreateWorkspaceBody } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { http } from '../../lib/api';
import { keys, useApiMutation, useWorkspaces } from '../../lib/queries';
import { useAuth } from '../authentication/AuthProvider';

export function WorkspacesPage() {
  const { user } = useAuth();
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const workspaces = useWorkspaces(all);
  const create = useApiMutation(
    (n: string) => http.post<WorkspaceDto>('/workspaces', CreateWorkspaceBody.parse({ name: n })),
    [keys.workspaces(false), keys.workspaces(true)],
    () => {
      setCreating(false);
      setName('');
    },
  );

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New workspace
          </Button>
        }
      />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold">Workspaces</h1>
            <p className="mt-1 text-[12px] text-ink-400">
              A workspace holds projects and the people who can work on them.
            </p>
          </div>
          {user?.systemRole === 'ADMIN' && (
            <label className="flex items-center gap-2 text-[12px] text-ink-300">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
              Show all workspaces
            </label>
          )}
        </div>
        {workspaces.isLoading ? (
          <p className="text-ink-400">Loading…</p>
        ) : workspaces.data?.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {workspaces.data.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/w/${w.id}`}
                  className="block rounded-xl border border-ink-700 bg-ink-850 p-4 transition-colors hover:border-ink-500"
                >
                  <div className="text-[14px] font-medium">{w.name}</div>
                  <div className="mt-1 text-[11px] text-ink-400">
                    /{w.slug} · <span className="uppercase">{w.role.toLowerCase()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-600 py-16 text-center text-ink-400">
            No workspaces yet. Create one, or ask a workspace owner to add you.
          </div>
        )}
      </main>
      {creating && (
        <Modal title="New workspace" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate(name.trim());
            }}
          >
            <Field label="Name">
              <input
                className="field h-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={create.isPending || !name.trim()}>
                Create
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
