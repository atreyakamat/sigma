import { randomUUID } from 'node:crypto';
import type { NodeJSON } from '@sigma/document';
import type { FrameLock } from '@sigma/validation';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentJSON } from '@sigma/document';
import type {
  CreateDocumentInputV1,
  DocumentDto,
  DocumentSummaryDto,
  SaveContentInput,
  SaveContentResponse,
  WorkspaceRole,
} from '@sigma/validation';
import type { Document, User } from '../../prisma/generated/client';
import { countNodes, emptyDocumentJSON } from '../common/dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { VersionsService } from '../versions/versions.service';
import { PresenceGateway } from '../collaboration/presence.gateway';

function toSummary(d: Document, workspaceId: string): DocumentSummaryDto {
  return {
    id: d.id,
    projectId: d.projectId,
    workspaceId,
    name: d.name,
    revision: d.revision,
    thumbnailUrl: d.thumbnail ?? d.thumbnailUrl,
    nodeCount: d.nodeCount,
    createdById: d.createdById,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly versions: VersionsService,
    private readonly presence: PresenceGateway,
  ) {}

  async list(user: User, projectId: string): Promise<DocumentSummaryDto[]> {
    const workspaceId = await this.perms.workspaceOfProject(projectId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const rows = await this.prisma.document.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((d) => toSummary(d, workspaceId));
  }

  async create(user: User, projectId: string, input: CreateDocumentInputV1): Promise<DocumentDto> {
    const workspaceId = await this.perms.workspaceOfProject(projectId);
    const role = await this.perms.assert(user, workspaceId, 'document.create');
    const id = randomUUID();
    const content = input.content
      ? { ...input.content, id, name: input.name }
      : emptyDocumentJSON(input.name, id, randomUUID());
    const d = await this.prisma.document.create({
      data: {
        id,
        projectId,
        name: input.name,
        createdById: user.id,
        content: content as object,
        nodeCount: countNodes(content as DocumentJSON),
      },
    });
    return { ...toSummary(d, workspaceId), content: d.content as DocumentJSON, role };
  }

  async get(user: User, id: string): Promise<DocumentDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(id);
    const role = await this.perms.assert(user, workspaceId, 'document.read');
    const d = await this.prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!d) throw new NotFoundException('Document not found');
    return { ...toSummary(d, workspaceId), content: d.content as DocumentJSON, role };
  }

  async update(user: User, id: string, input: { name?: string }): Promise<DocumentSummaryDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(id);
    await this.perms.assert(user, workspaceId, 'document.write');
    const current = await this.prisma.document.findFirstOrThrow({ where: { id, deletedAt: null } });
    const content = input.name
      ? { ...(current.content as DocumentJSON), name: input.name }
      : (current.content as DocumentJSON);
    const d = await this.prisma.document.update({
      where: { id },
      data: { ...input, content: content as object },
    });
    return toSummary(d, workspaceId);
  }

  /** Optimistic concurrency: the client must send the revision it loaded. */
  async saveContent(user: User, id: string, input: SaveContentInput): Promise<SaveContentResponse> {
    const { workspaceId } = await this.perms.workspaceOfDocument(id);
    await this.perms.assert(user, workspaceId, 'document.write');
    const content = { ...input.content, id };
    const stored = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { content: true, revision: true },
    });
    if (!stored) throw new NotFoundException('Document not found');
    const violation = findLockViolation(stored.content as DocumentJSON, content, user.id);
    if (violation)
      throw new ConflictException({
        statusCode: 409,
        message: `"${violation.name}" is locked by ${violation.lock.name} until ${new Date(violation.lock.until).toLocaleString()}`,
        revision: stored.revision,
        lockedBy: violation.lock,
      });
    const result = await this.prisma.document.updateMany({
      where: { id, deletedAt: null, revision: input.baseRevision },
      data: {
        content: content as object,
        revision: input.baseRevision + 1,
        name: content.name,
        nodeCount: countNodes(content),
        ...(input.thumbnail !== undefined ? { thumbnail: input.thumbnail } : {}),
      },
    });
    if (result.count === 0) {
      const current = await this.prisma.document.findFirst({
        where: { id, deletedAt: null },
        select: { revision: true },
      });
      if (!current) throw new NotFoundException('Document not found');
      throw new ConflictException({
        statusCode: 409,
        message: 'The document was modified by someone else',
        revision: current.revision,
      });
    }
    const d = await this.prisma.document.findUniqueOrThrow({
      where: { id },
      select: { revision: true, updatedAt: true },
    });
    await this.versions.maybeAutoSnapshot(user.id, id);
    this.presence.notifySaved(id, d.revision, { id: user.id, name: user.name });
    return { revision: d.revision, updatedAt: d.updatedAt.toISOString() };
  }

  async remove(user: User, id: string): Promise<void> {
    const { workspaceId } = await this.perms.workspaceOfDocument(id);
    await this.perms.assert(user, workspaceId, 'document.delete');
    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  roleOf(user: User, workspaceId: string): Promise<WorkspaceRole | null> {
    return this.perms.roleIn(user.id, workspaceId);
  }
}

/**
 * Frames carry an advisory lock in `metadata.lock` ({ userId, name, until }). While a lock held by
 * another user is current, that frame's subtree must be saved unchanged — including the lock itself.
 */
export function findLockViolation(
  before: DocumentJSON,
  after: DocumentJSON,
  userId: string,
): { name: string; lock: FrameLock } | null {
  const index = (doc: DocumentJSON): Map<string, NodeJSON> => {
    const m = new Map<string, NodeJSON>();
    const visit = (n: NodeJSON): void => {
      m.set(n.id, n);
      n.children?.forEach(visit);
    };
    doc.pages.forEach(visit);
    return m;
  };
  const a = index(before);
  const b = index(after);
  const now = Date.now();
  for (const [nodeId, node] of a) {
    const lock = (node.metadata as { lock?: FrameLock } | undefined)?.lock;
    if (!lock || lock.userId === userId || new Date(lock.until).getTime() < now) continue;
    const next = b.get(nodeId);
    if (!next || canonical(next) !== canonical(node)) return { name: node.name, lock };
  }
  return null;
}

/** JSON with recursively sorted keys (JSONB does not preserve key order). */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  return JSON.stringify(sort(value));
}
