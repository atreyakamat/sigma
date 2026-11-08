import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddMemberInput,
  CreateWorkspaceInputV1,
  MemberDto,
  UpdateMemberInput,
  WorkspaceDto,
  WorkspaceRole,
} from '@sigma/validation';
import type { User, Workspace } from '../../prisma/generated/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

function toDto(w: Workspace, role: WorkspaceRole): WorkspaceDto {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    ownerId: w.ownerId,
    role,
    createdAt: w.createdAt.toISOString(),
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace'
  );
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async listMine(user: User, all: boolean): Promise<WorkspaceDto[]> {
    if (all && user.systemRole === 'ADMIN') {
      const ws = await this.prisma.workspace.findMany({
        orderBy: { createdAt: 'asc' },
        include: { members: { where: { userId: user.id } } },
      });
      return ws.map((w) => toDto(w, w.members[0]?.role ?? 'OWNER'));
    }
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => toDto(m.workspace, m.role));
  }

  async create(user: User, input: CreateWorkspaceInputV1): Promise<WorkspaceDto> {
    const base = input.slug ?? slugify(input.name);
    let slug = base;
    for (let i = 2; await this.prisma.workspace.findUnique({ where: { slug } }); i++) {
      if (input.slug) throw new ConflictException('Slug is already taken');
      slug = `${base}-${i}`;
    }
    const ws = await this.prisma.workspace.create({
      data: {
        name: input.name,
        slug,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    return toDto(ws, 'OWNER');
  }

  async get(user: User, id: string): Promise<WorkspaceDto> {
    const role = await this.perms.assert(user, id, 'workspace.read');
    const ws = await this.prisma.workspace.findUnique({ where: { id } });
    if (!ws) throw new NotFoundException('Workspace not found');
    return toDto(ws, role);
  }

  async update(user: User, id: string, data: { name?: string }): Promise<WorkspaceDto> {
    const role = await this.perms.assert(user, id, 'workspace.update');
    const ws = await this.prisma.workspace.update({ where: { id }, data });
    return toDto(ws, role);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.perms.assert(user, id, 'workspace.delete');
    await this.prisma.workspace.delete({ where: { id } });
  }

  async members(user: User, id: string): Promise<MemberDto[]> {
    await this.perms.assert(user, id, 'workspace.read');
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
    return rows.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  async addMember(user: User, id: string, input: AddMemberInput): Promise<MemberDto> {
    const actorRole = await this.perms.assert(user, id, 'members.manage');
    if (input.role === 'ADMIN' && actorRole !== 'OWNER')
      throw new ForbiddenException('Only the owner can add administrators');
    const target = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!target || !target.active) throw new NotFoundException('No active user with that email');
    if (
      await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId: target.id } },
      })
    ) {
      throw new ConflictException('Already a member');
    }
    const m = await this.prisma.workspaceMember.create({
      data: { workspaceId: id, userId: target.id, role: input.role },
    });
    return {
      userId: target.id,
      name: target.name,
      email: target.email,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    };
  }

  async updateMember(
    user: User,
    id: string,
    userId: string,
    input: UpdateMemberInput,
  ): Promise<MemberDto> {
    const actorRole = await this.perms.assert(user, id, 'members.manage');
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId } },
      include: { user: true },
    });
    if (!m) throw new NotFoundException('Member not found');
    if (m.role === 'OWNER') throw new BadRequestException('The owner role cannot be changed');
    if ((input.role === 'ADMIN' || m.role === 'ADMIN') && actorRole !== 'OWNER')
      throw new ForbiddenException('Only the owner can change administrator roles');
    const updated = await this.prisma.workspaceMember.update({
      where: { id: m.id },
      data: { role: input.role },
    });
    return {
      userId,
      name: m.user.name,
      email: m.user.email,
      role: updated.role,
      joinedAt: updated.joinedAt.toISOString(),
    };
  }

  async removeMember(user: User, id: string, userId: string): Promise<void> {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId } },
    });
    if (!m) throw new NotFoundException('Member not found');
    if (m.role === 'OWNER') throw new BadRequestException('The owner cannot be removed');
    if (userId !== user.id) {
      const actorRole = await this.perms.assert(user, id, 'members.manage');
      if (m.role === 'ADMIN' && actorRole !== 'OWNER')
        throw new ForbiddenException('Only the owner can remove administrators');
    }
    await this.prisma.workspaceMember.delete({ where: { id: m.id } });
  }
}
