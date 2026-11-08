import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AddMemberInput,
  CreateWorkspaceInputV1,
  MemberDto,
  UpdateMemberInput,
  WorkspaceDto,
} from '@sigma/validation';
import {
  AddMemberBody,
  CreateWorkspaceBody,
  UpdateMemberBody,
  UpdateWorkspaceBody,
} from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get() list(@CurrentUser() user: User, @Query('all') all?: string): Promise<WorkspaceDto[]> {
    return this.workspaces.listMine(user, all === 'true');
  }
  @Post() create(
    @CurrentUser() user: User,
    @Body(zod(CreateWorkspaceBody)) body: CreateWorkspaceInputV1,
  ): Promise<WorkspaceDto> {
    return this.workspaces.create(user, body);
  }
  @Get(':id') get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceDto> {
    return this.workspaces.get(user, id);
  }
  @Patch(':id') update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateWorkspaceBody)) body: { name?: string },
  ): Promise<WorkspaceDto> {
    return this.workspaces.update(user, id, body);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.workspaces.remove(user, id);
  }
  @Get(':id/members') members(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MemberDto[]> {
    return this.workspaces.members(user, id);
  }
  @Post(':id/members') addMember(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(AddMemberBody)) body: AddMemberInput,
  ): Promise<MemberDto> {
    return this.workspaces.addMember(user, id, body);
  }
  @Patch(':id/members/:userId') updateMember(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(zod(UpdateMemberBody)) body: UpdateMemberInput,
  ): Promise<MemberDto> {
    return this.workspaces.updateMember(user, id, userId, body);
  }
  @Delete(':id/members/:userId') @HttpCode(204) removeMember(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.workspaces.removeMember(user, id, userId);
  }
}
