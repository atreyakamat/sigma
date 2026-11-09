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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AiChatBody, CreateAiProviderBody, UpdateAiProviderBody } from '@sigma/validation';
import type {
  AiChatInput,
  AiChatResponse,
  AiProviderDto,
  AiProviderSummaryDto,
  CreateAiProviderInput,
  UpdateAiProviderInput,
} from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser, SystemAdmin } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { AiService } from './ai.service';

@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Providers a member can choose from (no secrets, no endpoints). */
  @Get('ai/providers')
  enabled(): Promise<AiProviderSummaryDto[]> {
    return this.ai.listEnabled();
  }

  @SystemAdmin()
  @Get('admin/ai/providers')
  list(): Promise<AiProviderDto[]> {
    return this.ai.listAll();
  }

  @SystemAdmin()
  @Post('admin/ai/providers')
  create(
    @CurrentUser() user: User,
    @Body(zod(CreateAiProviderBody)) body: CreateAiProviderInput,
  ): Promise<AiProviderDto> {
    return this.ai.create(user, body);
  }

  @SystemAdmin()
  @Patch('admin/ai/providers/:id')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateAiProviderBody)) body: UpdateAiProviderInput,
  ): Promise<AiProviderDto> {
    return this.ai.update(user, id, body);
  }

  @SystemAdmin()
  @Delete('admin/ai/providers/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.ai.remove(user, id);
  }

  @SystemAdmin()
  @Post('admin/ai/providers/:id/test')
  @HttpCode(200)
  test(@Param('id', ParseUUIDPipe) id: string): Promise<{ ok: boolean; message: string }> {
    return this.ai.test(id);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('documents/:id/ai/chat')
  @HttpCode(200)
  chat(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(AiChatBody)) body: AiChatInput,
    @Req() req: Request,
  ): Promise<AiChatResponse> {
    return this.ai.chat(user, id, body, req.ip);
  }
}
