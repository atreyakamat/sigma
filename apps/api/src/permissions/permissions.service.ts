import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission, WorkspaceRole } from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/** Resolves a user's role in a workspace and asserts permissions from the shared matrix. */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async roleIn(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return m?.role ?? null;
  }

  /** Non-members get 404 (resource is invisible), members lacking the permission get 403. */
  async assert(user: User, workspaceId: string, permission: Permission): Promise<WorkspaceRole> {
    const role = await this.roleIn(user.id, workspaceId);
    if (!role) {
      if (
        user.systemRole === 'ADMIN' &&
        (permission === 'workspace.read' || permission === 'workspace.delete')
      )
        return 'OWNER';
      throw new NotFoundException('Workspace not found');
    }
    if (!roleHas(role, permission))
      throw new ForbiddenException(`Your role (${role.toLowerCase()}) cannot do this`);
    return role;
  }

  /** Workspace id for a project (404 when missing). */
  async workspaceOfProject(projectId: string): Promise<string> {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!p) throw new NotFoundException('Project not found');
    return p.workspaceId;
  }

  /** Workspace + project ids for a live document (404 when missing or deleted). */
  async workspaceOfDocument(
    documentId: string,
  ): Promise<{ workspaceId: string; projectId: string }> {
    const d = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: { projectId: true, project: { select: { workspaceId: true } } },
    });
    if (!d) throw new NotFoundException('Document not found');
    return { workspaceId: d.project.workspaceId, projectId: d.projectId };
  }
}
