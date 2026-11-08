import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CommentAnchor,
  CommentDto,
  CommentThreadDto,
  CreateCommentInputV1,
  UpdateCommentInput,
} from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import type { Comment, User } from '../../prisma/generated/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

type Row = Comment & { user: { name: string } };
function toDto(c: Row): CommentDto {
  return {
    id: c.id,
    documentId: c.documentId,
    parentId: c.parentId,
    userId: c.userId,
    userName: c.user.name,
    content: c.content,
    anchor: (c.anchorData as CommentAnchor | null) ?? null,
    resolved: c.resolved,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async list(user: User, documentId: string): Promise<CommentThreadDto[]> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const rows = await this.prisma.comment.findMany({
      where: { documentId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const threads = new Map<string, CommentThreadDto>();
    for (const r of rows) if (!r.parentId) threads.set(r.id, { ...toDto(r), replies: [] });
    for (const r of rows) if (r.parentId) threads.get(r.parentId)?.replies.push(toDto(r));
    return [...threads.values()];
  }

  async create(user: User, documentId: string, input: CreateCommentInputV1): Promise<CommentDto> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'comment.create');
    if (input.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: input.parentId, documentId, parentId: null },
      });
      if (!parent) throw new NotFoundException('Thread not found');
    }
    const row = await this.prisma.comment.create({
      data: {
        documentId,
        userId: user.id,
        parentId: input.parentId ?? null,
        content: input.content,
        anchorData: input.parentId ? undefined : (input.anchor as object | undefined),
      },
      include: { user: { select: { name: true } } },
    });
    return toDto(row);
  }

  async update(user: User, commentId: string, input: UpdateCommentInput): Promise<CommentDto> {
    const row = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { user: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Comment not found');
    const { workspaceId } = await this.perms.workspaceOfDocument(row.documentId);
    const role = await this.perms.assert(user, workspaceId, 'document.read');
    const author = row.userId === user.id;
    if (input.content !== undefined && !author)
      throw new ForbiddenException('Only the author can edit a comment');
    if (input.resolved !== undefined && !author && !roleHas(role, 'comment.moderate'))
      throw new ForbiddenException('Only editors can resolve comments');
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: input,
      include: { user: { select: { name: true } } },
    });
    return toDto(updated);
  }

  async remove(user: User, commentId: string): Promise<void> {
    const row = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!row) throw new NotFoundException('Comment not found');
    const { workspaceId } = await this.perms.workspaceOfDocument(row.documentId);
    const role = await this.perms.assert(user, workspaceId, 'document.read');
    if (row.userId !== user.id && !roleHas(role, 'comment.moderate'))
      throw new ForbiddenException('Only the author or an editor can delete a comment');
    await this.prisma.comment.deleteMany({
      where: { OR: [{ id: commentId }, { parentId: commentId }] },
    });
  }
}
