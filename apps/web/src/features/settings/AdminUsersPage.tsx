import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CreatedUserResponse, UserDto } from '@sigma/validation';
import { CreateUserBody } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { http } from '../../lib/api';
import { keys, useApiMutation, useUsers } from '../../lib/queries';
import { useAuth } from '../authentication/AuthProvider';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const users = useUsers();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<CreatedUserResponse | null>(null);
  const inv = [keys.users];
  const create = useApiMutation(
    (body: unknown) => http.post<CreatedUserResponse>('/users', body),
    inv,
    (r) => {
      setAdding(false);
      setSecret(r);
    },
  );
  const reset = useApiMutation(
    (id: string) => http.post<CreatedUserResponse>(`/users/${id}/reset-password`),
    inv,
    (r) => setSecret(r),
  );
  const update = useApiMutation(
    ({ id, body }: { id: string; body: Partial<UserDto> }) =>
      http.patch<UserDto>(`/users/${id}`, body),
    inv,
  );
  const remove = useApiMutation(
    (id: string) => http.delete(`/users/${id}`),
    inv,
    () => toast.success('User deleted'),
  );

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader
        crumbs={[{ label: 'Users' }]}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add user
          </Button>
        }
      />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mb-6 mt-1 text-[12px] text-ink-400">
          Create accounts and hand out the generated password. People must change it on first
          sign-in.
        </p>
        <table className="w-full text-left text-[12px]">
          <thead className="text-[11px] uppercase text-ink-400">
            <tr>
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr
                  key={u.id}
                  className="border-t border-ink-700"
                  data-testid={`user-row-${u.email}`}
                >
                  <td className="py-2">
                    {u.name}
                    {self && <span className="ml-1 text-ink-500">(you)</span>}
                  </td>
                  <td className="text-ink-300">{u.email}</td>
                  <td>
                    <select
                      className="field h-7 w-28"
                      value={u.systemRole}
                      disabled={self}
                      aria-label={`Role for ${u.email}`}
                      onChange={(e) =>
                        update.mutate({
                          id: u.id,
                          body: { systemRole: e.target.value as UserDto['systemRole'] },
                        })
                      }
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      className={`rounded px-2 py-0.5 text-[11px] ${u.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-ink-700 text-ink-300'}`}
                      disabled={self}
                      title={self ? '' : u.active ? 'Deactivate' : 'Activate'}
                      onClick={() => update.mutate({ id: u.id, body: { active: !u.active } })}
                    >
                      {u.active ? 'Active' : 'Inactive'}
                    </button>
                    {u.mustChangePassword && (
                      <span className="ml-1 text-[10px] text-amber-300">temp password</span>
                    )}
                  </td>
                  <td className="text-ink-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="text-right">
                    <button
                      className="icon-btn h-7 w-7"
                      title="Reset password"
                      onClick={() =>
                        confirm(`Reset ${u.name}'s password? Their sessions will end.`) &&
                        reset.mutate(u.id)
                      }
                    >
                      <KeyRound size={13} />
                    </button>
                    <button
                      className="icon-btn h-7 w-7"
                      title="Delete user"
                      disabled={self}
                      onClick={() =>
                        confirm(
                          `Delete ${u.name}? Workspaces they own go to their admins or are deleted.`,
                        ) && remove.mutate(u.id)
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onSubmit={(b) => create.mutate(b)}
          busy={create.isPending}
        />
      )}
      {secret && <SecretModal result={secret} onClose={() => setSecret(null)} />}
    </div>
  );
}

function AddUserModal({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (body: unknown) => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [systemRole, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Add user" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = CreateUserBody.safeParse({
            name,
            email,
            systemRole,
            ...(password ? { password } : {}),
          });
          if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
          onSubmit(parsed.data);
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
        <Field label="Email">
          <input
            className="field h-9"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="System role">
          <select
            className="field h-9"
            value={systemRole}
            onChange={(e) => setRole(e.target.value as 'MEMBER' | 'ADMIN')}
          >
            <option value="MEMBER">Member — can be added to workspaces</option>
            <option value="ADMIN">Admin — manages users and all workspaces</option>
          </select>
        </Field>
        <Field label="Initial password (optional, generated if empty)">
          <input
            className="field h-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave empty to generate"
          />
        </Field>
        {error && (
          <div role="alert" className="mb-3 text-[12px] text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Create user
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SecretModal({ result, onClose }: { result: CreatedUserResponse; onClose: () => void }) {
  const copy = () =>
    navigator.clipboard
      ?.writeText(result.temporaryPassword)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Clipboard unavailable'));
  return (
    <Modal title={`Temporary password for ${result.user.name}`} onClose={onClose}>
      <p className="mb-3 text-[12px] text-ink-300">
        Share this with <strong>{result.user.email}</strong> through a secure channel. It is shown
        only once; they must change it at first sign-in.
      </p>
      <div
        className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-[14px] tracking-wider text-amber-100"
        data-testid="temporary-password"
      >
        <span className="flex-1 select-all">{result.temporaryPassword}</span>
        <button className="icon-btn h-7 w-7" title="Copy" onClick={copy}>
          <Copy size={13} />
        </button>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
