import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { MemberDto, ProjectDto, WorkspaceRole } from '@sigma/validation';
import { AddMemberBody, CreateProjectBody, roleHas } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { http } from '../../lib/api';
import { keys, useApiMutation, useMembers, useProjects, useWorkspace } from '../../lib/queries';
import { useAuth } from '../authentication/AuthProvider';

type Tab = 'projects' | 'members' | 'settings';

export function WorkspacePage() {
  const { workspaceId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'projects';
  const ws = useWorkspace(workspaceId);
  if (ws.isLoading) return <div className="p-8 text-ink-400">Loading…</div>;
  if (!ws.data) return <div className="p-8 text-ink-400">Workspace not found.</div>;
  const role = ws.data.role;
  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader crumbs={[{ label: ws.data.name }]} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold">{ws.data.name}</h1>
        <div className="mb-6 mt-4 flex gap-1 border-b border-ink-700">
          {(['projects', 'members', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setParams({ tab: t })}
              className={`-mb-px border-b-2 px-3 py-2 text-[12px] capitalize ${tab === t ? 'border-accent-500 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'projects' && <ProjectsTab workspaceId={workspaceId} role={role} />}
        {tab === 'members' && <MembersTab workspaceId={workspaceId} role={role} />}
        {tab === 'settings' && (
          <SettingsTab workspaceId={workspaceId} role={role} name={ws.data.name} />
        )}
      </main>
    </div>
  );
}

export function ProjectsTab({ workspaceId, role }: { workspaceId: string; role: WorkspaceRole }) {
  const projects = useProjects(workspaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const create = useApiMutation(
    (n: string) =>
      http.post<ProjectDto>(
        `/workspaces/${workspaceId}/projects`,
        CreateProjectBody.parse({ name: n }),
      ),
    [keys.projects(workspaceId)],
    () => {
      setCreating(false);
      setName('');
    },
  );
  const remove = useApiMutation(
    (id: string) => http.delete(`/projects/${id}`),
    [keys.projects(workspaceId)],
  );
  const rename = useApiMutation(
    ({ id, name: n }: { id: string; name: string }) => http.patch(`/projects/${id}`, { name: n }),
    [keys.projects(workspaceId)],
  );
  return (
    <div>
      <div className="mb-4 flex justify-end">
        {roleHas(role, 'project.create') && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> New project
          </Button>
        )}
      </div>
      {projects.data?.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {projects.data.map((p) => (
            <li
              key={p.id}
              className="group relative rounded-xl border border-ink-700 bg-ink-850 transition-colors hover:border-ink-500"
            >
              <Link to={`/w/${workspaceId}/p/${p.id}`} className="block p-4">
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="mt-1 text-[11px] text-ink-400">
                  {p.description || 'No description'}
                </div>
              </Link>
              {roleHas(role, 'project.update') && (
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    className="icon-btn h-6 w-6 text-[10px]"
                    title="Rename"
                    onClick={() => {
                      const n = prompt('Rename project', p.name);
                      if (n && n.trim() && n !== p.name)
                        rename.mutate({ id: p.id, name: n.trim() });
                    }}
                  >
                    ✎
                  </button>
                  {roleHas(role, 'project.delete') && (
                    <button
                      className="icon-btn h-6 w-6"
                      title="Delete"
                      onClick={() =>
                        confirm(`Delete project "${p.name}" and all its files?`) &&
                        remove.mutate(p.id)
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-ink-600 py-16 text-center text-ink-400">
          {projects.isLoading ? 'Loading…' : 'No projects yet.'}
        </div>
      )}
      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)}>
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

export function MembersTab({ workspaceId, role }: { workspaceId: string; role: WorkspaceRole }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const members = useMembers(workspaceId);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'VIEWER' | 'EDITOR' | 'ADMIN'>('EDITOR');
  const canManage = roleHas(role, 'members.manage');
  const add = useApiMutation(
    (body: { email: string; role: typeof newRole }) =>
      http.post<MemberDto>(`/workspaces/${workspaceId}/members`, body),
    [keys.members(workspaceId)],
    () => {
      setEmail('');
      toast.success('Member added');
    },
  );
  const update = useApiMutation(
    ({ userId, role: r }: { userId: string; role: string }) =>
      http.patch(`/workspaces/${workspaceId}/members/${userId}`, { role: r }),
    [keys.members(workspaceId)],
  );
  const remove = useApiMutation(
    (userId: string) => http.delete(`/workspaces/${workspaceId}/members/${userId}`),
    [keys.members(workspaceId), keys.workspaces(false)],
  );
  return (
    <div>
      {canManage && (
        <form
          className="mb-5 flex items-end gap-2 rounded-xl border border-ink-700 bg-ink-850 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = AddMemberBody.safeParse({ email, role: newRole });
            if (!parsed.success)
              return toast.error(parsed.error.issues[0]?.message ?? 'Invalid input');
            add.mutate(parsed.data);
          }}
        >
          <label className="flex-1 text-[12px]">
            <span className="mb-1 block text-ink-300">
              Add a member by email (they must already have an account)
            </span>
            <input
              className="field h-9"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
            />
          </label>
          <label className="text-[12px]">
            <span className="mb-1 block text-ink-300">Role</span>
            <select
              className="field h-9 w-32"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as typeof newRole)}
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
              {role === 'OWNER' && <option value="ADMIN">Admin</option>}
            </select>
          </label>
          <Button type="submit" variant="primary" className="h-9" disabled={add.isPending}>
            Add
          </Button>
        </form>
      )}
      <table className="w-full text-left text-[12px]">
        <thead className="text-[11px] uppercase text-ink-400">
          <tr>
            <th className="py-2">Name</th>
            <th>Email</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.data?.map((m) => {
            const isSelf = m.userId === user?.id;
            const editable =
              canManage && m.role !== 'OWNER' && (m.role !== 'ADMIN' || role === 'OWNER');
            return (
              <tr key={m.userId} className="border-t border-ink-700">
                <td className="py-2">
                  {m.name}
                  {isSelf && <span className="ml-1 text-ink-500">(you)</span>}
                </td>
                <td className="text-ink-300">{m.email}</td>
                <td>
                  {editable ? (
                    <select
                      className="field h-7 w-28"
                      value={m.role}
                      onChange={(e) => update.mutate({ userId: m.userId, role: e.target.value })}
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                      {role === 'OWNER' && <option value="ADMIN">Admin</option>}
                    </select>
                  ) : (
                    <span className="capitalize">{m.role.toLowerCase()}</span>
                  )}
                </td>
                <td className="text-right">
                  {m.role !== 'OWNER' && (editable || isSelf) && (
                    <button
                      className="rounded px-2 py-1 text-red-300 hover:bg-ink-700"
                      onClick={() => {
                        if (!confirm(isSelf ? 'Leave this workspace?' : `Remove ${m.name}?`))
                          return;
                        remove.mutate(m.userId, { onSuccess: () => isSelf && navigate('/') });
                      }}
                    >
                      {isSelf ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SettingsTab({
  workspaceId,
  role,
  name,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  name: string;
}) {
  const navigate = useNavigate();
  const [n, setN] = useState(name);
  const rename = useApiMutation(
    (v: string) => http.patch(`/workspaces/${workspaceId}`, { name: v }),
    [keys.workspace(workspaceId), keys.workspaces(false), keys.workspaces(true)],
    () => toast.success('Workspace renamed'),
  );
  const remove = useApiMutation(
    () => http.delete(`/workspaces/${workspaceId}`),
    [keys.workspaces(false), keys.workspaces(true)],
    () => navigate('/'),
  );
  return (
    <div className="max-w-md">
      <Field label="Workspace name">
        <input
          className="field h-9"
          value={n}
          onChange={(e) => setN(e.target.value)}
          disabled={!roleHas(role, 'workspace.update')}
        />
      </Field>
      {roleHas(role, 'workspace.update') && (
        <Button
          variant="primary"
          onClick={() => n.trim() && rename.mutate(n.trim())}
          disabled={rename.isPending || n.trim() === name}
        >
          Save
        </Button>
      )}
      {roleHas(role, 'workspace.delete') && (
        <div className="mt-8 rounded-xl border border-red-500/30 p-4">
          <div className="mb-2 text-[12px] text-ink-300">
            Deleting a workspace removes all of its projects and files for everyone.
          </div>
          <Button
            variant="danger"
            onClick={() =>
              confirm(`Delete workspace "${name}"? This cannot be undone.`) && remove.mutate()
            }
          >
            Delete workspace
          </Button>
        </div>
      )}
    </div>
  );
}
