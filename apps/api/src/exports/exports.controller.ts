import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import type { ExportQuery } from './exports.service';
import { ExportsService } from './exports.service';

@Controller('documents/:id')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('export.svg')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  svg(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ExportQuery,
  ): Promise<string> {
    return this.exports.svg(user, id, q);
  }

  @Get('export.png')
  async png(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.exports.png(user, id, q);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  @Get('tokens.json')
  async tokensJson(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ExportQuery,
  ) {
    return (await this.exports.tokens(user, id, q)).json;
  }

  @Get('tokens.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  async tokensCss(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ExportQuery,
  ): Promise<string> {
    return (await this.exports.tokens(user, id, q)).css;
  }

  @Get('frames')
  frames(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ExportQuery,
  ) {
    return this.exports.frames(user, id, q);
  }
}
