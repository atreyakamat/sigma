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
} from '@nestjs/common';
import type { CreateProjectInputV1, ProjectDto, UpdateProjectInput } from '@sigma/validation';
import { CreateProjectBody, UpdateProjectBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('workspaces/:id/projects') list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectDto[]> {
    return this.projects.list(user, id);
  }
  @Post('workspaces/:id/projects') create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(CreateProjectBody)) body: CreateProjectInputV1,
  ): Promise<ProjectDto> {
    return this.projects.create(user, id, body);
  }
  @Get('projects/:id') get(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectDto> {
    return this.projects.get(user, id);
  }
  @Patch('projects/:id') update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateProjectBody)) body: UpdateProjectInput,
  ): Promise<ProjectDto> {
    return this.projects.update(user, id, body);
  }
  @Delete('projects/:id') @HttpCode(204) remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.projects.remove(user, id);
  }
}
