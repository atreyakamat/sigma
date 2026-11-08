import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type {
  LibraryComponentContentDto,
  LibraryComponentDto,
  PublishComponentsInput,
} from '@sigma/validation';
import { PublishComponentsBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { LibrariesService } from './libraries.service';

@Controller()
export class LibrariesController {
  constructor(private readonly libraries: LibrariesService) {}

  @Get('workspaces/:id/library') list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LibraryComponentDto[]> {
    return this.libraries.list(user, id);
  }
  @Get('library/:id') get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LibraryComponentContentDto> {
    return this.libraries.get(user, id);
  }
  @Post('documents/:id/library/publish') publish(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(PublishComponentsBody)) body: PublishComponentsInput,
  ): Promise<LibraryComponentDto[]> {
    return this.libraries.publish(user, id, body.componentIds);
  }
  @Delete('library/:id') @HttpCode(204) unpublish(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.libraries.unpublish(user, id);
  }
}
