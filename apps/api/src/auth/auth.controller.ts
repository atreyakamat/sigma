import {
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
  ApiTokenDto,
  ChangePasswordInput,
  CreateTokenInput,
  CreatedTokenResponse,
  LoginInput,
  MeResponse,
} from '@sigma/validation';
import { ChangePasswordBody, CreateTokenBody, LoginBody } from '@sigma/validation';
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
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(zod(LoginBody)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { user, token } = await this.auth.login(body.email, body.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('cookieSecure', { infer: true }),
      path: '/',
      maxAge: this.auth.ttlMs,
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
}
