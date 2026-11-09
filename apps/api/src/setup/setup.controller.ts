import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SetupBody } from '@sigma/validation';
import type { SetupInput, SetupResponse, SetupStatusDto } from '@sigma/validation';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { Public } from '../common/auth.decorators';
import { toUserDto } from '../common/dto';
import { hashPassword } from '../common/password';
import { zod } from '../common/zod.pipe';
import type { AppConfig } from '../config/configuration';
import { SESSION_COOKIE } from '../config/configuration';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * First-run setup for the desktop app: while no account exists, one request creates the owner,
 * a workspace, a project and a starter file, and signs the owner in. Disabled on servers, where
 * the bootstrap administrator is created at start instead.
 */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get('status')
  async status(): Promise<SetupStatusDto> {
    const desktop = this.config.get('desktop', { infer: true });
    return { desktop, needsSetup: desktop && (await this.prisma.user.count()) === 0 };
  }

  @Public()
  @Post()
  async setup(
    @Body(zod(SetupBody)) body: SetupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SetupResponse> {
    if (!this.config.get('desktop', { infer: true })) throw new NotFoundException();
    // Serialise concurrent first-run requests so only one owner can ever be created.
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(736461)');
      if ((await tx.user.count()) > 0)
        throw new ConflictException('SIGMA is already set up. Sign in instead.');
      return tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          systemRole: 'ADMIN',
          passwordHash: await hashPassword(body.password),
          mustChangePassword: false,
        },
      });
    });
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${body.name.split(' ')[0]}'s workspace`,
        slug: 'workspace',
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
    const project = await this.prisma.project.create({
      data: { workspaceId: workspace.id, name: 'My designs', createdById: user.id },
    });
    const doc = await this.documents.create(user, project.id, { name: 'My first design' });
    const token = await this.auth.openSession(user, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('cookieSecure', { infer: true }),
      path: '/',
      maxAge: this.auth.ttlMs,
    });
    await this.audit.record('user.create', {
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      ip: req.ip,
      metadata: { setup: true },
    });
    return {
      user: toUserDto(user),
      workspaceId: workspace.id,
      projectId: project.id,
      documentId: doc.id,
    };
  }
}
