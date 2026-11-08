import {
  UnauthorizedException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  LoginChallengeResponse,
  SessionDto,
  TwoFactorEnableResponse,
  TwoFactorSetupResponse,
  ApiTokenDto,
  ChangePasswordInput,
  CreateTokenInput,
  CreatedTokenResponse,
  LoginInput,
  MeResponse,
} from '@sigma/validation';
import {
  ChangePasswordBody,
  CreateTokenBody,
  LoginBody,
  TwoFactorCodeBody,
} from '@sigma/validation';
import { AuditService } from '../audit/audit.service';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../common/auth.decorators';
import { CurrentUser, Public } from '../common/auth.decorators';
import { toUserDto } from '../common/dto';
import { zod } from '../common/zod.pipe';
import type { AppConfig } from '../config/configuration';
import { SESSION_COOKIE } from '../config/configuration';
import type { User } from '../../prisma/generated/client';
import { AuthService } from './auth.service';

/** Login attempts per IP per minute (env LOGIN_RATE_LIMIT, default 20). */
const LOGIN_RATE_LIMIT = Number(process.env['LOGIN_RATE_LIMIT'] ?? 20);

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly audit: AuditService,
  ) {}

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('cookieSecure', { infer: true }),
      path: '/',
      maxAge: this.auth.ttlMs,
    });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(zod(LoginBody)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse | LoginChallengeResponse> {
    let user: User;
    try {
      user = await this.auth.verifyCredentials(body.email, body.password);
    } catch (e) {
      await this.audit.record('auth.login_failed', { ip: req.ip, metadata: { email: body.email } });
      throw e;
    }
    if (user.twoFactorEnabled) {
      res.cookie('sigma_2fa', this.auth.issueChallenge(user.id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.get('cookieSecure', { infer: true }),
        path: '/api/v1/auth',
        maxAge: 5 * 60_000,
      });
      return { requiresTwoFactor: true };
    }
    const token = await this.auth.openSession(user, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setSessionCookie(res, token);
    await this.audit.record('auth.login', { actorId: user.id, ip: req.ip });
    return { user: toUserDto(user) };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login/2fa')
  @HttpCode(200)
  async loginSecondFactor(
    @Body(zod(TwoFactorCodeBody)) body: { code: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const challenge = (req.cookies as Record<string, string> | undefined)?.['sigma_2fa'];
    const user = challenge ? await this.auth.resolveChallenge(challenge) : null;
    if (!user) throw new UnauthorizedException('Sign in again');
    if (!(await this.auth.checkSecondFactor(user, body.code))) {
      await this.audit.record('auth.login_failed', {
        actorId: user.id,
        ip: req.ip,
        metadata: { reason: '2fa' },
      });
      throw new UnauthorizedException('Invalid code');
    }
    res.clearCookie('sigma_2fa', { path: '/api/v1/auth' });
    const token = await this.auth.openSession(user, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this.setSessionCookie(res, token);
    await this.audit.record('auth.login', {
      actorId: user.id,
      ip: req.ip,
      metadata: { secondFactor: true },
    });
    return { user: toUserDto(user) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout((req as AuthenticatedRequest).sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: User): MeResponse {
    return { user: toUserDto(user) };
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body(zod(ChangePasswordBody)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(
      user,
      body.currentPassword,
      body.newPassword,
      (req as AuthenticatedRequest).sessionId,
    );
  }

  @Get('tokens')
  listTokens(@CurrentUser() user: User): Promise<ApiTokenDto[]> {
    return this.auth.listTokens(user.id);
  }

  @Post('tokens')
  createToken(
    @CurrentUser() user: User,
    @Body(zod(CreateTokenBody)) body: CreateTokenInput,
  ): Promise<CreatedTokenResponse> {
    return this.auth.createToken(user.id, body.name, body.expiresInDays);
  }

  @Delete('tokens/:id')
  @HttpCode(204)
  async revokeToken(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.auth.revokeToken(user.id, id))) throw new NotFoundException('Token not found');
  }

  @Get('sessions')
  sessions(@CurrentUser() user: User, @Req() req: Request): Promise<SessionDto[]> {
    return this.auth.listSessions(user.id, (req as AuthenticatedRequest).sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    if (!(await this.auth.revokeSession(user.id, id)))
      throw new NotFoundException('Session not found');
    void this.audit.record('auth.session_revoked', {
      actorId: user.id,
      targetType: 'session',
      targetId: id,
      ip: req.ip,
    });
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  async revokeOthers(@CurrentUser() user: User, @Req() req: Request): Promise<void> {
    const n = await this.auth.revokeOtherSessions(user.id, (req as AuthenticatedRequest).sessionId);
    void this.audit.record('auth.session_revoked', {
      actorId: user.id,
      ip: req.ip,
      metadata: { count: n },
    });
  }

  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() user: User): TwoFactorSetupResponse {
    return this.auth.setupTwoFactor(user);
  }

  @Post('2fa/enable')
  async enableTwoFactor(
    @CurrentUser() user: User,
    @Body(zod(TwoFactorCodeBody)) body: { code: string },
    @Req() req: Request,
  ): Promise<TwoFactorEnableResponse> {
    const r = await this.auth.enableTwoFactor(user, body.code);
    void this.audit.record('auth.2fa_enabled', { actorId: user.id, ip: req.ip });
    return r;
  }

  @Post('2fa/disable')
  @HttpCode(204)
  async disableTwoFactor(
    @CurrentUser() user: User,
    @Body(zod(TwoFactorCodeBody)) body: { code: string },
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.disableTwoFactor(user, body.code);
    void this.audit.record('auth.2fa_disabled', { actorId: user.id, ip: req.ip });
  }
}
