import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../prisma/generated/client';

export const IS_PUBLIC = 'isPublic';
export const SYSTEM_ADMIN = 'systemAdmin';

/** Skips authentication (login, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
/** Requires `systemRole === 'ADMIN'`. */
export const SystemAdmin = (): MethodDecorator & ClassDecorator => SetMetadata(SYSTEM_ADMIN, true);

export type AuthenticatedRequest = Request & { user: User; sessionId: string };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  return (ctx.switchToHttp().getRequest() as AuthenticatedRequest).user;
});
