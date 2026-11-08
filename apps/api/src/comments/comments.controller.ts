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
import type {
  CommentDto,
  CommentThreadDto,
  CreateCommentInputV1,
  UpdateCommentInput,
} from '@sigma/validation';
import { CreateCommentBody, UpdateCommentBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { CommentsService } from './comments.service';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('documents/:id/comments') list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommentThreadDto[]> {
    return this.comments.list(user, id);
  }
  @Post('documents/:id/comments') create(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(CreateCommentBody)) body: CreateCommentInputV1,
  ): Promise<CommentDto> {
    return this.comments.create(user, id, body);
  }
  @Patch('comments/:id') update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateCommentBody)) body: UpdateCommentInput,
  ): Promise<CommentDto> {
    return this.comments.update(user, id, body);
  }
  @Delete('comments/:id') @HttpCode(204) remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.comments.remove(user, id);
  }
}
