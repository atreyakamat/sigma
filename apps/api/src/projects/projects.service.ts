import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProjectInputV1, ProjectDto, UpdateProjectInput } from '@sigma/validation';
import type { Project, User } from '../../prisma/generated/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

export function toProjectDto(p: Project): ProjectDto {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    description: p.description,
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async list(user: User, workspaceId: string): Promise<ProjectDto[]> {
    await this.perms.assert(user, workspaceId, 'workspace.read');
    const rows = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toProjectDto);
  }

  async create(user: User, workspaceId: string, input: CreateProjectInputV1): Promise<ProjectDto> {
    await this.perms.assert(user, workspaceId, 'project.create');
    const p = await this.prisma.project.create({
      data: {
        workspaceId,
        name: input.name,
        description: input.description ?? null,
        createdById: user.id,
      },
    });
    return toProjectDto(p);
  }

  async get(user: User, id: string): Promise<ProjectDto> {
    const workspaceId = await this.perms.workspaceOfProject(id);
    await this.perms.assert(user, workspaceId, 'workspace.read');
    const p = await this.prisma.project.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Project not found');
    return toProjectDto(p);
  }

  async update(user: User, id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    await this.perms.assert(user, await this.perms.workspaceOfProject(id), 'project.update');
    return toProjectDto(await this.prisma.project.update({ where: { id }, data: input }));
  }

  async remove(user: User, id: string): Promise<void> {
    await this.perms.assert(user, await this.perms.workspaceOfProject(id), 'project.delete');
    await this.prisma.project.delete({ where: { id } });
  }
}
