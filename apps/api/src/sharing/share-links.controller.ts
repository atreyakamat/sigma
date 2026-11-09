import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SceneGraph } from '@sigma/document';
import type { CreateShareLinkInput, ShareLinkDto, SharedDocumentDto } from '@sigma/validation';
import { CreateShareLinkBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser, Public } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import type { ExportQuery } from '../exports/exports.service';
import { ExportsService } from '../exports/exports.service';
import { ShareLinksService } from './share-links.service';

@Controller()
export class ShareLinksController {
  constructor(
    private readonly links: ShareLinksService,
    private readonly exports: ExportsService,
  ) {}

  @Post('documents/:id/share-links')
  create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(CreateShareLinkBody)) body: CreateShareLinkInput,
    @Req() req: Request,
  ): Promise<ShareLinkDto> {
    return this.links.create(user, id, body, req.ip);
  }

  @Get('documents/:id/share-links')
  list(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<ShareLinkDto[]> {
    return this.links.list(user, id);
  }

  @Delete('share-links/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.links.remove(user, id, req.ip);
  }

  /* ---- anonymous access through the token */

  @Public()
  @Get('share/:token')
  shared(@Param('token') token: string): Promise<SharedDocumentDto> {
    return this.links.shared(token);
  }

  @Public()
  @Get('share/:token/export.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  async svg(@Param('token') token: string, @Query() q: ExportQuery): Promise<string> {
    const { content } = await this.links.resolve(token);
    return this.exports.svgOf(SceneGraph.fromJSON(content), q);
  }

  @Public()
  @Get('share/:token/export.png')
  async png(
    @Param('token') token: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { content } = await this.links.resolve(token);
    const buf = await this.exports.pngOf(SceneGraph.fromJSON(content), q, null);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  @Public()
  @Get('share/:token/export.pdf')
  async pdf(
    @Param('token') token: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { content, name } = await this.links.resolve(token);
    const buf = await this.exports.pdfOf(SceneGraph.fromJSON(content), q, null, name);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }
}
