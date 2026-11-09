import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.2fa_enabled'
  | 'auth.2fa_disabled'
  | 'auth.session_revoked'
  | 'auth.token_created'
  | 'auth.token_revoked'
  | 'share.create'
  | 'share.revoke'
  | 'user.create'
  | 'user.update'
  | 'user.reset_password'
  | 'user.delete'
  | 'workspace.create'
  | 'workspace.delete'
  | 'member.add'
  | 'member.update'
  | 'member.remove'
  | 'document.delete'
  | 'version.restore'
  | 'asset.upload'
  | 'asset.delete';

export interface AuditEntryDto {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: unknown;
  createdAt: string;
}

/** Append-only log of sensitive actions. Never throws into the calling request. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    action: AuditAction,
    opts: {
      actorId?: string | null;
      targetType?: string;
      targetId?: string | null;
      ip?: string | null;
      metadata?: Record<string, unknown>;
      req?: Request;
    } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          actorId: opts.actorId ?? null,
          targetType: opts.targetType ?? null,
          targetId: opts.targetId ?? null,
          ip: opts.ip ?? opts.req?.ip ?? null,
          metadata: (opts.metadata ?? undefined) as object | undefined,
        },
      });
    } catch {
      /* auditing must not break the request */
    }
  }

  async list(limit = 100, before?: string): Promise<AuditEntryDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: before ? { createdAt: { lt: new Date(before) } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: r.ip,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
