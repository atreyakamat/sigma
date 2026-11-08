import type { UserDto, WorkspaceRole } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    systemRole: u.systemRole,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  };
}

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export function countNodes(content: { pages: { children?: unknown[] }[] }): number {
  let n = 0;
  const visit = (node: { children?: unknown[] }): void => {
    n++;
    (node.children as { children?: unknown[] }[] | undefined)?.forEach(visit);
  };
  content.pages.forEach(visit);
  return n;
}

export function emptyDocumentJSON(
  name: string,
  id: string,
  pageId: string,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name,
    metadata: {},
    pages: [{ id: pageId, type: 'PAGE', name: 'Page 1', children: [] }],
  };
}
