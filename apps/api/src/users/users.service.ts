import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateUserInput,
  CreatedUserResponse,
  UpdateUserInput,
  UserDto,
} from '@sigma/validation';
import type { User } from '../../prisma/generated/client';
import { toUserDto } from '../common/dto';
import { generatePassword, hashPassword } from '../common/password';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(toUserDto);
  }

  async get(id: string): Promise<UserDto> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return toUserDto(u);
  }

  /** Creates a user with a supplied or generated temporary password (returned once). */
  async create(input: CreateUserInput, actor?: User): Promise<CreatedUserResponse> {
    if (await this.prisma.user.findUnique({ where: { email: input.email } }))
      throw new ConflictException('A user with this email already exists');
    const temporaryPassword = input.password ?? generatePassword();
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        systemRole: input.systemRole,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await this.audit.record('user.create', {
      actorId: actor?.id ?? null,
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, systemRole: user.systemRole },
    });
    return { user: toUserDto(user), temporaryPassword };
  }

  async update(actor: User, id: string, input: UpdateUserInput): Promise<UserDto> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const demoting = input.systemRole === 'MEMBER' && target.systemRole === 'ADMIN';
    const deactivating = input.active === false && target.active;
    if ((demoting || deactivating) && (await this.isLastActiveAdmin(id)))
      throw new BadRequestException('Cannot remove the last active administrator');
    if (actor.id === id && (demoting || deactivating))
      throw new BadRequestException('You cannot demote or deactivate yourself');
    const data: UpdateUserInput = { ...input };
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data });
      if (input.active === false) await tx.session.deleteMany({ where: { userId: id } });
      return u;
    });
    void this.audit.record('user.update', {
      actorId: actor.id,
      targetType: 'user',
      targetId: id,
      metadata: input as Record<string, unknown>,
    });
    return toUserDto(updated);
  }

  async resetPassword(id: string, actor?: User): Promise<CreatedUserResponse> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    const temporaryPassword = generatePassword();
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      return u;
    });
    await this.audit.record('user.reset_password', {
      actorId: actor?.id ?? null,
      targetType: 'user',
      targetId: id,
    });
    return { user: toUserDto(user), temporaryPassword };
  }

  /** Deletes a user; owned workspaces go to their oldest ADMIN member or are deleted. */
  async remove(actor: User, id: string): Promise<void> {
    if (actor.id === id) throw new BadRequestException('You cannot delete yourself');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('User not found');
    if (target.systemRole === 'ADMIN' && (await this.isLastActiveAdmin(id)))
      throw new BadRequestException('Cannot delete the last administrator');
    await this.prisma.$transaction(async (tx) => {
      const owned = await tx.workspace.findMany({ where: { ownerId: id } });
      for (const ws of owned) {
        const heir = await tx.workspaceMember.findFirst({
          where: { workspaceId: ws.id, role: 'ADMIN', userId: { not: id } },
          orderBy: { joinedAt: 'asc' },
        });
        if (heir) {
          await tx.workspace.update({ where: { id: ws.id }, data: { ownerId: heir.userId } });
          await tx.workspaceMember.update({ where: { id: heir.id }, data: { role: 'OWNER' } });
        } else {
          await tx.workspace.delete({ where: { id: ws.id } });
        }
      }
      // Reassign authored rows that must keep a creator.
      const heirAdmin = actor;
      await tx.project.updateMany({
        where: { createdById: id },
        data: { createdById: heirAdmin.id },
      });
      await tx.document.updateMany({
        where: { createdById: id },
        data: { createdById: heirAdmin.id },
      });
      await tx.user.delete({ where: { id } });
    });
    void this.audit.record('user.delete', {
      actorId: actor.id,
      targetType: 'user',
      targetId: id,
      metadata: { email: target.email },
    });
  }

  private async isLastActiveAdmin(id: string): Promise<boolean> {
    const others = await this.prisma.user.count({
      where: { systemRole: 'ADMIN', active: true, id: { not: id } },
    });
    return others === 0;
  }
}
