import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../common/auth.decorators';
import { IS_PUBLIC, SYSTEM_ADMIN } from '../common/auth.decorators';
import type { AppConfig } from '../config/configuration';
import { SESSION_COOKIE } from '../config/configuration';
import { AuthService } from './auth.service';

/**
 * Global guard: resolves the session cookie, enforces @SystemAdmin, and applies a CSRF origin check
 * to every state-changing request (Origin/Referer must match the configured client origin or the
 * request host).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    // Cookie sessions need the CSRF origin check; bearer tokens are never attached automatically.
    if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) this.assertSameOrigin(req);
    if (isPublic) return true;

    if (bearer) {
      const user = await this.auth.resolveBearer(bearer);
      if (!user) throw new UnauthorizedException('Invalid or expired API token');
      (req as AuthenticatedRequest).user = user;
      (req as AuthenticatedRequest).sessionId = '';
    } else {
      const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
      if (!token) throw new UnauthorizedException('Not signed in');
      const resolved = await this.auth.resolve(token);
      if (!resolved) throw new UnauthorizedException('Session expired');
      (req as AuthenticatedRequest).user = resolved.user;
      (req as AuthenticatedRequest).sessionId = resolved.session.id;
    }

    const needsAdmin = this.reflector.getAllAndOverride<boolean>(SYSTEM_ADMIN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (needsAdmin && (req as AuthenticatedRequest).user.systemRole !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    return true;
  }

  private assertSameOrigin(req: Request): void {
    const origin =
      req.headers.origin ?? (req.headers.referer ? safeOrigin(req.headers.referer) : undefined);
    if (!origin) throw new ForbiddenException('Missing Origin header');
    const allowed = new Set([
      this.config.get('corsOrigin', { infer: true }),
      `${req.protocol}://${req.get('host')}`,
    ]);
    if (!allowed.has(origin)) throw new ForbiddenException('Cross-origin request rejected');
  }
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
