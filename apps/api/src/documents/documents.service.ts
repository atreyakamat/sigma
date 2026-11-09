import { randomUUID } from 'node:crypto';
import type { NodeJSON } from '@sigma/document';
import type { FrameLock } from '@sigma/validation';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { applyDocumentOps, outlineDocument, parseDocumentJSON } from '@sigma/document';
import type { DocumentOp, DocumentOutline } from '@sigma/document';
import type { DocumentOpsResponse } from '@sigma/validation';
import { CollabRoomsService } from '../collaboration/collab-rooms.service';
import { ExportsService } from '../exports/exports.service';
import { SceneGraph, projectInstances } from '@sigma/document';

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
    private readonly rooms: CollabRoomsService,
    private readonly exports: ExportsService,
  ) {
    this.rooms.setPersister((id, content, user) => this.persistRealtime(id, content, user));
  }

  /** Small PNG data URL of the first page, used for file cards when the client sent none. */
  private async thumbnailFor(content: DocumentJSON, user: User): Promise<string | null> {
    try {
      const graph = SceneGraph.fromJSON(content);
      projectInstances(graph);
      const page = graph.pageIds[0];
      if (!page || graph.getChildIds(page).length === 0) return null;
      const b = graph
        .getChildIds(page)
        .map((c) => graph.getWorldBounds(c))
        .reduce(
          (a, r) => ({
            x: Math.min(a.x, r.x),
            y: Math.min(a.y, r.y),
            w: Math.max(a.w, r.x + r.width),
            h: Math.max(a.h, r.y + r.height),
          }),
          { x: Infinity, y: Infinity, w: -Infinity, h: -Infinity },
        );
      const scale = Math.min(1, 320 / Math.max(1, b.w - b.x, b.h - b.y));
      const png = await this.exports.rasterize(graph, [page], user, scale, 8);
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch (e) {
      new Logger('Thumbnails').warn(`Thumbnail generation failed: ${(e as Error).message}`);
      return null;
    }
  }

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

  /** Compact structure of a document for automation (MCP server, assistant). */
  async outline(user: User, id: string): Promise<DocumentOutline> {
    const doc = await this.get(user, id);
    return outlineDocument(doc.content);
  }

  /**
   * Applies high-level edit operations (see `applyDocumentOps`). Pending realtime edits are flushed
   * first so nothing typed in the last second is lost; the result goes through the normal save
   * path, so locks, versions, thumbnails and realtime resync all apply.
   */
  async applyOps(user: User, id: string, ops: readonly DocumentOp[]): Promise<DocumentOpsResponse> {
    const { workspaceId } = await this.perms.workspaceOfDocument(id);
    await this.perms.assert(user, workspaceId, 'document.write');
    for (let attempt = 0; ; attempt++) {
      await this.rooms.flush(id);
      const stored = await this.prisma.document.findFirst({
        where: { id, deletedAt: null },
        select: { content: true, revision: true },
      });
      if (!stored) throw new NotFoundException('Document not found');
      const applied_ = applyDocumentOps(stored.content as DocumentJSON, ops);
      // Belt and braces: never store content the editor's strict parser would refuse to open.
      const content = parseDocumentJSON(applied_.content);
      const results = applied_.results;
      const applied = results.filter((r) => r.ok).length;
      if (applied === 0) return { revision: stored.revision, applied, results };
      try {
        const saved = await this.saveContent(user, id, { content, baseRevision: stored.revision });
        return { revision: saved.revision, applied, results };
      } catch (e) {
        // Someone saved in between: retry once on the fresh content.
        if (
          e instanceof ConflictException &&
          attempt === 0 &&
          !(e.getResponse() as { lockedBy?: unknown }).lockedBy
        )
          continue;
        throw e;
      }
    }
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
        thumbnail:
          input.thumbnail !== undefined && input.thumbnail !== null
            ? input.thumbnail
            : await this.thumbnailFor(content, user),
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
    this.rooms.replace(id, content, d.revision);
    this.presence.notifySaved(id, d.revision, { id: user.id, name: user.name });
    return { revision: d.revision, updatedAt: d.updatedAt.toISOString() };
  }

  /**
   * Realtime persistence: the room's CRDT state is authoritative, so no base revision is checked.
   * Returns the new revision.
   */
  private async persistRealtime(
    id: string,
    content: DocumentJSON,
    user: { id: string; name: string },
  ): Promise<number> {
    const actor = await this.prisma.user.findUnique({ where: { id: user.id } });
    const thumbnail = actor ? await this.thumbnailFor(content, actor) : null;
    const d = await this.prisma.document.update({
      where: { id },
      data: {
        content: content as object,
        revision: { increment: 1 },
        name: content.name,
        nodeCount: countNodes(content),
        ...(thumbnail ? { thumbnail } : {}),
      },
      select: { revision: true },
    });
    await this.versions.maybeAutoSnapshot(user.id, id);
    this.presence.notifySaved(id, d.revision, user);
    return d.revision;
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
