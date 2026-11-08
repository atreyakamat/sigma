/**
 * @sigma/validation — request/response contracts shared by the web client and the API.
 * The API validates incoming bodies with these schemas; the client uses the inferred types.
 */
import { z } from 'zod';
import { DocumentJSONSchema } from '@sigma/document';
import { EmailSchema, NameSchema, PasswordSchema, SlugSchema } from './base';

export * from './base';

export const RegisterSchema = z
  .object({ name: NameSchema, email: EmailSchema, password: PasswordSchema })
  .strict();
export const LoginSchema = z
  .object({ email: EmailSchema, password: z.string().min(1).max(128) })
  .strict();

export const CreateWorkspaceSchema = z
  .object({ name: NameSchema, slug: SlugSchema.optional() })
  .strict();
export const CreateProjectSchema = z
  .object({
    workspaceId: z.string().uuid(),
    name: NameSchema,
    description: z.string().max(2000).optional(),
  })
  .strict();
export const CreateFolderSchema = z
  .object({
    projectId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    name: NameSchema,
  })
  .strict();

export const CreateDocumentSchema = z
  .object({
    projectId: z.string().uuid(),
    folderId: z.string().uuid().nullable().optional(),
    name: NameSchema,
    content: DocumentJSONSchema.optional(),
  })
  .strict();
export const UpdateDocumentSchema = z
  .object({ name: NameSchema.optional(), folderId: z.string().uuid().nullable().optional() })
  .strict();
export const SaveDocumentContentSchema = z
  .object({ content: DocumentJSONSchema, baseRevision: z.number().int().nonnegative().optional() })
  .strict();

export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
export const DocumentRoleSchema = z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']);
export const ShareDocumentSchema = z
  .object({ email: EmailSchema, role: DocumentRoleSchema })
  .strict();

export const CreateCommentSchema = z
  .object({
    content: z.string().trim().min(1).max(5000),
    parentId: z.string().uuid().nullable().optional(),
    anchor: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type CreateFolderInput = z.infer<typeof CreateFolderSchema>;
export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;
export type SaveDocumentContentInput = z.infer<typeof SaveDocumentContentSchema>;
export type ShareDocumentInput = z.infer<typeof ShareDocumentSchema>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export * from './api';
