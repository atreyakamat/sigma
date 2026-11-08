import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentJSON, NodeJSON } from '@sigma/document';
import type { LibraryComponentContentDto, LibraryComponentDto } from '@sigma/validation';
import type { LibraryComponent, User } from '../../prisma/generated/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

function toDto(r: LibraryComponent): LibraryComponentDto {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    documentId: r.documentId,
    componentId: r.componentId,
    name: r.name,
    description: r.description,
    thumbnail: r.thumbnail,
    version: r.version,
    publishedById: r.publishedById,
    publishedAt: r.publishedAt.toISOString(),
  };
}

function findNode(doc: DocumentJSON, id: string): NodeJSON | null {
  const visit = (n: NodeJSON): NodeJSON | null => {
    if (n.id === id) return n;
    for (const c of n.children ?? []) {
      const f = visit(c);
      if (f) return f;
    }
    return null;
  };
  for (const p of doc.pages) {
    const f = visit(p);
    if (f) return f;
  }
  return null;
}

/** Workspace component libraries: publish COMPONENT nodes from a document, list and fetch them. */
@Injectable()
export class LibrariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async list(user: User, workspaceId: string): Promise<LibraryComponentDto[]> {
    await this.perms.assert(user, workspaceId, 'workspace.read');
    const rows = await this.prisma.libraryComponent.findMany({
      where: { workspaceId },
      orderBy: [{ name: 'asc' }, { publishedAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async get(user: User, id: string): Promise<LibraryComponentContentDto> {
    const row = await this.prisma.libraryComponent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Library component not found');
    await this.perms.assert(user, row.workspaceId, 'workspace.read');
    return { ...toDto(row), content: row.content as NodeJSON };
  }

  /** Publishes (or re-publishes, bumping the version) components from a document. */
  async publish(
    user: User,
    documentId: string,
    componentIds: string[],
  ): Promise<LibraryComponentDto[]> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.write');
    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
      select: { content: true },
    });
    const json = doc.content as DocumentJSON;
    const out: LibraryComponentDto[] = [];
    for (const componentId of componentIds) {
      const node = findNode(json, componentId);
      if (!node || node.type !== 'COMPONENT')
        throw new BadRequestException(`"${componentId}" is not a component in this document`);
      const existing = await this.prisma.libraryComponent.findUnique({
        where: { workspaceId_documentId_componentId: { workspaceId, documentId, componentId } },
      });
      const data = {
        name: node.name,
        description: node.description,
        content: node as object,
        publishedById: user.id,
        publishedAt: new Date(),
      };
      const row = existing
        ? await this.prisma.libraryComponent.update({
            where: { id: existing.id },
            data: { ...data, version: existing.version + 1 },
          })
        : await this.prisma.libraryComponent.create({
            data: { ...data, workspaceId, documentId, componentId },
          });
      out.push(toDto(row));
    }
    return out;
  }

  async unpublish(user: User, id: string): Promise<void> {
    const row = await this.prisma.libraryComponent.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Library component not found');
    await this.perms.assert(user, row.workspaceId, 'document.write');
    await this.prisma.libraryComponent.delete({ where: { id } });
  }
}
