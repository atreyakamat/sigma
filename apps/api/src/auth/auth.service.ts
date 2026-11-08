import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiToken, Session, User } from '../../prisma/generated/client';
import type { ApiTokenDto, CreatedTokenResponse } from '@sigma/validation';
import { hashPassword, verifyPassword } from '../common/password';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  get ttlMs(): number {
    return this.config.get('sessionTtlDays', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Verifies credentials and opens a session. Returns the raw token for the cookie. */
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const ok = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (!user.active) throw new ForbiddenException('This account is deactivated');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });
    return { user, token };
  }

  /** Resolves a cookie token to its user; slides expiry at most hourly. */
  async resolve(token: string): Promise<{ user: User; session: Session } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session)
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    if (!session.user.active) return null;
    if (Date.now() - session.lastSeenAt.getTime() > REFRESH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + this.ttlMs) },
      });
    }
    return { user: session.user, session };
  }

  /* ----------------------------------------------------------- personal API tokens */

  private toTokenDto(t: ApiToken): ApiTokenDto {
    return {
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async listTokens(userId: string): Promise<ApiTokenDto[]> {
    const rows = await this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((t) => this.toTokenDto(t));
  }

  /** Creates a bearer token `sgm_<random>`; the secret is returned once. */
  async createToken(
    userId: string,
    name: string,
    expiresInDays?: number,
  ): Promise<CreatedTokenResponse> {
    const secret = `sgm_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.apiToken.create({
      data: {
        userId,
        name,
        tokenHash: this.hashToken(secret),
        prefix: secret.slice(0, 10),
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
      },
    });
    return { token: this.toTokenDto(row), secret };
  }

  async revokeToken(userId: string, id: string): Promise<boolean> {
    const r = await this.prisma.apiToken.deleteMany({ where: { id, userId } });
    return r.count > 0;
  }

  /** Resolves `Authorization: Bearer sgm_…` to a user (updates lastUsedAt at most every 5 minutes). */
  async resolveBearer(secret: string): Promise<User | null> {
    if (!secret.startsWith('sgm_')) return null;
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: this.hashToken(secret) },
      include: { user: true },
    });
    if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now()) || !row.user.active)
      return null;
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
      await this.prisma.apiToken
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }
    return row.user;
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<void> {
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    if (currentPassword === newPassword)
      throw new ForbiddenException('New password must differ from the current one');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      }),
      this.prisma.session.deleteMany({ where: { userId: user.id, NOT: { id: keepSessionId } } }),
    ]);
  }
}

/** Constant-time-ish login: always run scrypt even when the email is unknown. */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
