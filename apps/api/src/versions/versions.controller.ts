import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { CreateVersionInput, VersionContentDto, VersionDto } from '@sigma/validation';
import { CreateVersionBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { VersionsService } from './versions.service';

@Controller('documents/:id/versions')
export class VersionsController {
  constructor(private readonly versions: VersionsService) {}

  @Get() list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VersionDto[]> {
    return this.versions.list(user, id);
  }
  @Post() create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(CreateVersionBody)) body: CreateVersionInput,
  ): Promise<VersionDto> {
    return this.versions.create(user, id, body.label);
  }
  @Get(':versionId') get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<VersionContentDto> {
    return this.versions.get(user, id, versionId);
  }
  @Post(':versionId/restore') restore(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ): Promise<{ revision: number }> {
    return this.versions.restore(user, id, versionId);
  }
}
