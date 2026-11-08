import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentJSON } from '@sigma/document';
import type { VersionContentDto, VersionDto } from '@sigma/validation';
import type { DocumentVersion, User } from '../../prisma/generated/client';
import { countNodes } from '../common/dto';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const AUTO_VERSION_INTERVAL_MS = 60 * 60 * 1000;

type Row = DocumentVersion & {
  createdBy: { name: string };
  snapshot: { revision: bigint; content: unknown };
};

function toDto(v: Row): VersionDto {
  const content = v.snapshot.content as DocumentJSON | null;
  return {
    id: v.id,
    documentId: v.documentId,
    label: v.label,
    automatic: v.label === null,
    revision: Number(v.snapshot.revision),
    nodeCount: content ? countNodes(content) : 0,
    createdById: v.createdById,
    createdByName: v.createdBy.name,
    createdAt: v.createdAt.toISOString(),
  };
}

/** Named checkpoints (versions) backed by document snapshots stored in PostgreSQL. */
@Injectable()
export class VersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async list(user: User, documentId: string): Promise<VersionDto[]> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const rows = await this.prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        createdBy: { select: { name: true } },
        snapshot: { select: { revision: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async get(user: User, documentId: string, versionId: string): Promise<VersionContentDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const row = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        createdBy: { select: { name: true } },
        snapshot: { select: { revision: true, content: true } },
      },
    });
    if (!row || !row.snapshot.content) throw new NotFoundException('Version not found');
    return { ...toDto(row), content: row.snapshot.content as DocumentJSON };
  }

  /** Creates a checkpoint of the current content. `label === null` marks an automatic version. */
  async create(user: User, documentId: string, label: string | null): Promise<VersionDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(
      user,
      workspaceId,
      label === null ? 'document.write' : 'document.write',
    );
    return this.snapshot(user.id, documentId, label);
  }

  async snapshot(userId: string, documentId: string, label: string | null): Promise<VersionDto> {
    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.documentSnapshot.create({
        data: {
          id: randomUUID(),
          documentId,
          revision: BigInt(doc.revision),
          schemaVersion: (doc.content as DocumentJSON).schemaVersion,
          content: doc.content as object,
          contentHash: String(doc.revision),
        },
      });
      return tx.documentVersion.create({
        data: { documentId, label, createdById: userId, snapshotId: snapshot.id },
        include: {
          createdBy: { select: { name: true } },
          snapshot: { select: { revision: true, content: true } },
        },
      });
    });
    return toDto(row);
  }

  /** Called after every content save: keeps an automatic checkpoint at most once per hour. */
  async maybeAutoSnapshot(userId: string, documentId: string): Promise<void> {
    const last = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && Date.now() - last.createdAt.getTime() < AUTO_VERSION_INTERVAL_MS) return;
    await this.snapshot(userId, documentId, null);
  }

  /** Restores a version: snapshots the current state first ("Before restore"), then replaces content. */
  async restore(user: User, documentId: string, versionId: string): Promise<{ revision: number }> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.write');
    const version = await this.get(user, documentId, versionId);
    await this.snapshot(
      user.id,
      documentId,
      `Before restoring "${version.label ?? 'automatic version'}"`,
    );
    const current = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
    });
    const content = { ...version.content, id: documentId, name: current.name };
    const d = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        content: content as object,
        revision: current.revision + 1,
        nodeCount: countNodes(content),
      },
    });
    return { revision: d.revision };
  }
}
