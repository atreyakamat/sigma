import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AssetDto } from '@sigma/validation';
import { SignedUrlBody } from '@sigma/validation';
import type { Request, Response } from 'express';
import type { User } from '../../prisma/generated/client';
import type { AuthenticatedRequest } from '../common/auth.decorators';
import { CurrentUser, Public } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import type { AppConfig } from '../config/configuration';
import { AuthService } from '../auth/auth.service';
import { SESSION_COOKIE } from '../config/configuration';
import { AssetsService } from './assets.service';

@Controller()
export class AssetsController {
  private readonly maxBytes: number;
  constructor(
    private readonly assets: AssetsService,
    private readonly auth: AuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.maxBytes = config.get('maxUploadBytes', { infer: true });
  }

  @Get('workspaces/:id/assets') list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetDto[]> {
    return this.assets.list(user, id);
  }

  @Post('workspaces/:id/assets')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  upload(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<AssetDto> {
    if (!file) throw new BadRequestException('Send the image as multipart field "file"');
    if (file.size > this.maxBytes)
      throw new PayloadTooLargeException(
        `Files are limited to ${Math.round(this.maxBytes / 1024 / 1024)} MB`,
      );
    return this.assets.upload(user, id, file, req.ip);
  }

  /** Public route: authenticates via session/bearer when present, otherwise via the signature. */
  @Public()
  @Get('assets/:id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    let user: User | null = (req as AuthenticatedRequest).user ?? null;
    if (!user) {
      const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (bearer) user = await this.auth.resolveBearer(bearer);
      else if (token) user = (await this.auth.resolve(token))?.user ?? null;
    }
    const { data, mimeType, filename } = await this.assets.content(id, user, exp, sig);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', user ? 'private, max-age=3600' : 'public, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }

  @Post('assets/:id/signed-url') signedUrl(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(SignedUrlBody)) body: { expiresInSeconds: number },
  ): Promise<{ url: string; expiresAt: string }> {
    return this.assets.signedUrl(user, id, body.expiresInSeconds);
  }

  @Delete('assets/:id') @HttpCode(204) remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.assets.remove(user, id, req.ip);
  }
}
