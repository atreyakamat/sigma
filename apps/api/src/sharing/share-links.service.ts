import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { DocumentJSON } from '@sigma/document';
import type {
  CreateShareLinkInput,
  ShareLinkDto,
  ShareLinkRole,
  SharedDocumentDto,
} from '@sigma/validation';
import type { ShareToken, User } from '../../prisma/generated/client';
import { AuditService } from '../audit/audit.service';
import type { AppConfig } from '../config/configuration';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

function toDto(row: ShareToken): ShareLinkDto {
  return {
    id: row.id,
    documentId: row.documentId,
    role: row.role as ShareLinkRole,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Share links: unguessable tokens granting read (or comment) access to one document without an account. */
@Injectable()
export class ShareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async create(
    user: User,
    documentId: string,
    input: CreateShareLinkInput,
    ip?: string,
  ): Promise<ShareLinkDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.write');
    const token = randomBytes(24).toString('base64url');
    const row = await this.prisma.shareToken.create({
      data: {
        documentId,
        token,
        role: input.role,
        expiresAt: input.expiresInHours
          ? new Date(Date.now() + input.expiresInHours * 3_600_000)
          : null,
      },
    });
    await this.audit.record('share.create', {
      actorId: user.id,
      targetType: 'document',
      targetId: documentId,
      ip,
      metadata: { role: input.role, expiresAt: row.expiresAt },
    });
    return {
      ...toDto(row),
      token,
      url: `${this.config.get('corsOrigin', { infer: true })}/share/${token}`,
    };
  }

  async list(user: User, documentId: string): Promise<ShareLinkDto[]> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const rows = await this.prisma.shareToken.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async remove(user: User, id: string, ip?: string): Promise<void> {
    const row = await this.prisma.shareToken.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Share link not found');
    const { workspaceId } = await this.perms.workspaceOfDocument(row.documentId);
    await this.perms.assert(user, workspaceId, 'document.write');
    await this.prisma.shareToken.delete({ where: { id } });
    await this.audit.record('share.revoke', {
      actorId: user.id,
      targetType: 'document',
      targetId: row.documentId,
      ip,
    });
  }

  /** Resolves a token to its live document; unknown, expired and deleted documents all read as 404. */
  async resolve(token: string): Promise<{
    documentId: string;
    role: ShareLinkRole;
    content: DocumentJSON;
    name: string;
    revision: number;
    updatedAt: Date;
  }> {
    const row = await this.prisma.shareToken.findUnique({
      where: { token },
      include: { document: true },
    });
    if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now()) || row.document.deletedAt)
      throw new NotFoundException('This link is not valid any more');
    return {
      documentId: row.documentId,
      role: row.role as ShareLinkRole,
      content: row.document.content as DocumentJSON,
      name: row.document.name,
      revision: row.document.revision,
      updatedAt: row.document.updatedAt,
    };
  }

  async shared(token: string): Promise<SharedDocumentDto> {
    const r = await this.resolve(token);
    return {
      id: r.documentId,
      name: r.name,
      revision: r.revision,
      updatedAt: r.updatedAt.toISOString(),
      role: r.role,
      content: r.content,
    };
  }
}
