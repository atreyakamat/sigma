import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { MemberDto, WorkspaceRole } from '@sigma/validation';

vi.mock('../../authentication/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u-viewer', name: 'Vera', email: 'vera@sigma.local', systemRole: 'MEMBER' },
    loading: false,
  }),
}));

const members: MemberDto[] = [
  {
    userId: 'u-owner',
    name: 'Owen',
    email: 'owen@sigma.local',
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    userId: 'u-viewer',
    name: 'Vera',
    email: 'vera@sigma.local',
    role: 'VIEWER',
    joinedAt: '2026-01-02T00:00:00Z',
  },
];
vi.mock('../../../lib/queries', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    useMembers: () => ({ data: members, isLoading: false }),
    useProjects: () => ({
      data: [
        {
          id: 'p1',
          workspaceId: 'w1',
          name: 'Alpha',
          description: null,
          createdById: 'u-owner',
          createdAt: '',
          updatedAt: '',
        },
      ],
      isLoading: false,
    }),
  };
});

import { MembersTab, ProjectsTab } from '../WorkspacePage';

function renderWith(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('permission-driven rendering', () => {
  it.each<[WorkspaceRole, boolean]>([
    ['VIEWER', false],
    ['EDITOR', true],
    ['ADMIN', true],
    ['OWNER', true],
  ])('%s sees the New project button: %s', (role, visible) => {
    renderWith(<ProjectsTab workspaceId="w1" role={role} />);
    expect(screen.queryByRole('button', { name: /new project/i }) !== null).toBe(visible);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('viewers cannot manage members but can leave', () => {
    renderWith(<MembersTab workspaceId="w1" role="VIEWER" />);
    expect(screen.queryByText(/add a member/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('owners get the add-member form and the Admin role option', () => {
    renderWith(<MembersTab workspaceId="w1" role="OWNER" />);
    expect(screen.getByText(/add a member/i)).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Admin' }).length).toBeGreaterThan(0);
  });

  it('workspace admins cannot grant the Admin role', () => {
    renderWith(<MembersTab workspaceId="w1" role="ADMIN" />);
    expect(screen.getByText(/add a member/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
  });
});
