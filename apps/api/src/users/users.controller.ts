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
  CreateUserInput,
  CreatedUserResponse,
  UpdateUserInput,
  UserDto,
} from '@sigma/validation';
import { CreateUserBody, UpdateUserBody } from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { CurrentUser, SystemAdmin } from '../common/auth.decorators';
import { zod } from '../common/zod.pipe';
import { UsersService } from './users.service';

@SystemAdmin()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() list(): Promise<UserDto[]> {
    return this.users.list();
  }
  @Post() create(@Body(zod(CreateUserBody)) body: CreateUserInput): Promise<CreatedUserResponse> {
    return this.users.create(body);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string): Promise<UserDto> {
    return this.users.get(id);
  }
  @Patch(':id') update(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(UpdateUserBody)) body: UpdateUserInput,
  ): Promise<UserDto> {
    return this.users.update(actor, id, body);
  }
  @Post(':id/reset-password') reset(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreatedUserResponse> {
    return this.users.resetPassword(id);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.users.remove(actor, id);
  }
}
