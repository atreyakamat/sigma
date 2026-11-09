/**
 * HTTP API contract (prefix /api/v1). Request bodies are zod schemas (validated by the API,
 * typed on the client); response shapes are plain interfaces. Session cookie: `sigma_session`.
 */
import { z } from 'zod';
import type { DocumentJSON } from '@sigma/document';
import { DocumentJSONSchema } from '@sigma/document';
import { EmailSchema, NameSchema, PasswordSchema, SlugSchema } from './base';

export const SystemRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export type SystemRole = z.infer<typeof SystemRoleSchema>;
export const WorkspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

/* ---------------- auth */
export const LoginBody = z
  .object({ email: EmailSchema, password: z.string().min(1).max(128) })
  .strict();
export const ChangePasswordBody = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema })
  .strict();
export interface UserDto {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  active: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}
export interface MeResponse {
  user: UserDto;
}

/* ---------------- users (system admin only) */
export const CreateUserBody = z
  .object({
    name: NameSchema,
    email: EmailSchema,
    systemRole: SystemRoleSchema.default('MEMBER'),
    password: PasswordSchema.optional(),
  })
  .strict();
export const UpdateUserBody = z
  .object({
    name: NameSchema.optional(),
    systemRole: SystemRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();
/** Returned once, when an admin creates a user or resets a password. */
export interface CreatedUserResponse {
  user: UserDto;
  /** Generated (or supplied) initial password; shown once, user must change it on first login. */
  temporaryPassword: string;
}

/* ---------------- workspaces & members */
export const CreateWorkspaceBody = z
  .object({ name: NameSchema, slug: SlugSchema.optional() })
  .strict();
export const UpdateWorkspaceBody = z.object({ name: NameSchema.optional() }).strict();
export const AddMemberBody = z
  .object({ email: EmailSchema, role: WorkspaceRoleSchema.exclude(['OWNER']) })
  .strict();
export const UpdateMemberBody = z.object({ role: WorkspaceRoleSchema.exclude(['OWNER']) }).strict();
export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  /** The calling user's role in this workspace. */
  role: WorkspaceRole;
  createdAt: string;
}
export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

/* ---------------- projects */
export const CreateProjectBody = z
  .object({ name: NameSchema, description: z.string().max(2000).optional() })
  .strict();
export const UpdateProjectBody = z
  .object({ name: NameSchema.optional(), description: z.string().max(2000).nullable().optional() })
  .strict();
export interface ProjectDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------------- documents */
export const CreateDocumentBody = z
  .object({ name: NameSchema, content: DocumentJSONSchema.optional() })
  .strict();
export const UpdateDocumentBody = z.object({ name: NameSchema.optional() }).strict();
export const SaveContentBody = z
  .object({
    content: DocumentJSONSchema,
    /** Revision the client loaded; a mismatch returns 409 with the server revision. */
    baseRevision: z.number().int().nonnegative(),
    thumbnail: z.string().max(2_000_000).nullable().optional(),
  })
  .strict();
export interface DocumentSummaryDto {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  revision: number;
  thumbnailUrl: string | null;
  nodeCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
export interface DocumentDto extends DocumentSummaryDto {
  content: DocumentJSON;
  /** Caller's effective role for this document (derived from workspace membership). */
  role: WorkspaceRole;
}
export interface SaveContentResponse {
  revision: number;
  updatedAt: string;
}
export interface ConflictResponse {
  statusCode: 409;
  message: string;
  revision: number;
}

/* ---------------- errors */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export type LoginInput = z.infer<typeof LoginBody>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordBody>;
export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type UpdateUserInput = z.infer<typeof UpdateUserBody>;
export type CreateWorkspaceInputV1 = z.infer<typeof CreateWorkspaceBody>;
export type AddMemberInput = z.infer<typeof AddMemberBody>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberBody>;
export type CreateProjectInputV1 = z.infer<typeof CreateProjectBody>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectBody>;
export type CreateDocumentInputV1 = z.infer<typeof CreateDocumentBody>;
export type SaveContentInput = z.infer<typeof SaveContentBody>;

/**
 * Permission matrix. System ADMIN bypasses workspace checks for administration (listing/deleting
 * workspaces) but still needs membership to edit documents.
 */
export const WORKSPACE_PERMISSIONS = {
  'workspace.read': ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'],
  'workspace.update': ['OWNER', 'ADMIN'],
  'workspace.delete': ['OWNER'],
  'members.manage': ['OWNER', 'ADMIN'],
  'project.create': ['OWNER', 'ADMIN', 'EDITOR'],
  'project.update': ['OWNER', 'ADMIN', 'EDITOR'],
  'project.delete': ['OWNER', 'ADMIN'],
  'document.create': ['OWNER', 'ADMIN', 'EDITOR'],
  'document.read': ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'],
  'document.write': ['OWNER', 'ADMIN', 'EDITOR'],
  'document.delete': ['OWNER', 'ADMIN', 'EDITOR'],
  'comment.create': ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'],
  'comment.moderate': ['OWNER', 'ADMIN', 'EDITOR'],
  'review.set': ['OWNER', 'ADMIN', 'EDITOR'],
} as const satisfies Record<string, readonly WorkspaceRole[]>;
export type Permission = keyof typeof WORKSPACE_PERMISSIONS;

export function roleHas(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  return !!role && (WORKSPACE_PERMISSIONS[permission] as readonly WorkspaceRole[]).includes(role);
}

/* ---------------- versions (checkpoints) */
export const CreateVersionBody = z.object({ label: z.string().trim().min(1).max(120) }).strict();
export interface VersionDto {
  id: string;
  documentId: string;
  label: string | null;
  automatic: boolean;
  revision: number;
  nodeCount: number;
  createdById: string;
  createdByName: string;
  createdAt: string;
}
export interface VersionContentDto extends VersionDto {
  content: DocumentJSON;
}
export type CreateVersionInput = z.infer<typeof CreateVersionBody>;

/* ---------------- personal API tokens */
export const CreateTokenBody = z
  .object({ name: NameSchema, expiresInDays: z.number().int().min(1).max(3650).optional() })
  .strict();
export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}
/** The full token is returned once at creation. */
export interface CreatedTokenResponse {
  token: ApiTokenDto;
  secret: string;
}
export type CreateTokenInput = z.infer<typeof CreateTokenBody>;

/* ---------------- review workflow on frames (stored in node metadata) */
export const ReviewStateSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED']);
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export interface FrameReview {
  state: ReviewState;
  byId: string;
  byName: string;
  at: string;
}
export interface FrameLock {
  userId: string;
  name: string;
  /** ISO expiry; locks are advisory in the UI and enforced on save until then. */
  until: string;
}

/* ---------------- comments */
export const CommentAnchorSchema = z
  .object({
    pageId: z.string().min(1),
    nodeId: z.string().min(1).nullable().optional(),
    x: z.number(),
    y: z.number(),
  })
  .strict();
export const CreateCommentBody = z
  .object({
    content: z.string().trim().min(1).max(5000),
    parentId: z.string().uuid().nullable().optional(),
    anchor: CommentAnchorSchema.optional(),
  })
  .strict();
export const UpdateCommentBody = z
  .object({
    content: z.string().trim().min(1).max(5000).optional(),
    resolved: z.boolean().optional(),
  })
  .strict();
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;
export type CreateCommentInputV1 = z.infer<typeof CreateCommentBody>;
export type UpdateCommentInput = z.infer<typeof UpdateCommentBody>;
export interface CommentDto {
  id: string;
  documentId: string;
  parentId: string | null;
  userId: string;
  userName: string;
  content: string;
  anchor: CommentAnchor | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface CommentThreadDto extends CommentDto {
  replies: CommentDto[];
}

/* ---------------- presence (WebSocket /api/v1/presence) */
export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  pageId: string | null;
  cursor: { x: number; y: number } | null;
  selection: string[];
}
export type PresenceClientMessage =
  | { type: 'join'; documentId: string }
  /** A Yjs update (base64) produced by the sender's local edits. */
  | { type: 'update'; update: string }
  | {
      type: 'awareness';
      pageId: string | null;
      cursor: { x: number; y: number } | null;
      selection: string[];
    };
export type PresenceServerMessage =
  | { type: 'presence'; users: PresenceUser[] }
  | { type: 'awareness'; user: PresenceUser }
  | { type: 'leave'; userId: string }
  | { type: 'saved'; revision: number; userId: string; userName: string }
  /** Full shared state (base64 Yjs update) sent on join and after the document is replaced over HTTP. */
  | { type: 'sync'; state: string; revision: number }
  /** A Yjs update from another participant. */
  | { type: 'update'; update: string; userId: string }
  | { type: 'error'; message: string };

/* ---------------- shared component libraries */
export const PublishComponentsBody = z
  .object({ componentIds: z.array(z.string().min(1)).min(1).max(200) })
  .strict();
export type PublishComponentsInput = z.infer<typeof PublishComponentsBody>;
export interface LibraryComponentDto {
  id: string;
  workspaceId: string;
  documentId: string;
  componentId: string;
  name: string;
  description: string;
  thumbnail: string | null;
  version: number;
  publishedById: string;
  publishedAt: string;
}
export interface LibraryComponentContentDto extends LibraryComponentDto {
  /** The COMPONENT node (with children) as document JSON. */
  content: DocumentJSON['pages'][number];
}

/* ---------------- assets */
export interface AssetDto {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  /** Session-authenticated content URL (relative). */
  url: string;
  uploadedById: string;
  createdAt: string;
}
export const SignedUrlBody = z
  .object({
    expiresInSeconds: z
      .number()
      .int()
      .min(10)
      .max(60 * 60 * 24 * 30)
      .default(3600),
  })
  .strict();

/* ---------------- sessions & two-factor */
export interface SessionDto {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
}
export const TwoFactorCodeBody = z.object({ code: z.string().trim().min(6).max(16) }).strict();
export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
}
export interface TwoFactorEnableResponse {
  recoveryCodes: string[];
}
export interface LoginChallengeResponse {
  requiresTwoFactor: true;
}

/* ---------------- share links (anonymous read access to one document) */
export const ShareLinkRoleSchema = z.enum(['VIEWER', 'COMMENTER']);
export type ShareLinkRole = z.infer<typeof ShareLinkRoleSchema>;
export const CreateShareLinkBody = z
  .object({
    role: ShareLinkRoleSchema.default('VIEWER'),
    /** Hours until the link stops working; omit for no expiry. */
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 365)
      .optional(),
  })
  .strict();
export type CreateShareLinkInput = z.infer<typeof CreateShareLinkBody>;
export interface ShareLinkDto {
  id: string;
  documentId: string;
  role: ShareLinkRole;
  expiresAt: string | null;
  createdAt: string;
  /** Only present in the create response. */
  token?: string;
  url?: string;
}
/** What an anonymous visitor receives for a share token. */
export interface SharedDocumentDto {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  role: ShareLinkRole;
  content: DocumentJSON;
}

/* ---------------- document operations (automation: MCP server, assistant, scripts) */
const HexColor = z
  .string()
  .regex(
    /^(none|#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))$/,
    'Use a hex colour like #2563eb, or "none"',
  );
const NodeFieldsShape = {
  name: z.string().trim().min(1).max(200).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().max(100_000).optional(),
  height: z.number().positive().max(100_000).optional(),
  rotation: z.number().finite().optional(),
  fill: HexColor.optional(),
  stroke: HexColor.optional(),
  strokeWidth: z.number().min(0).max(1000).optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  cornerRadius: z.number().min(0).max(10_000).optional(),
  text: z.string().max(20_000).optional(),
  fontSize: z.number().positive().max(2000).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
};
export const DocumentOpSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add'),
      type: z.enum([
        'PAGE',
        'FRAME',
        'GROUP',
        'RECTANGLE',
        'ELLIPSE',
        'LINE',
        'POLYGON',
        'STAR',
        'TEXT',
        'COMPONENT',
      ]),
      parent: z.string().min(1).max(100).optional(),
      ref: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,40}$/)
        .optional(),
      index: z.number().int().min(0).optional(),
      ...NodeFieldsShape,
    })
    .strict(),
  z
    .object({ op: z.literal('update'), id: z.string().min(1).max(100), ...NodeFieldsShape })
    .strict(),
  z
    .object({
      op: z.literal('move'),
      id: z.string().min(1).max(100),
      parent: z.string().min(1).max(100),
      index: z.number().int().min(0).optional(),
    })
    .strict(),
  z.object({ op: z.literal('delete'), id: z.string().min(1).max(100) }).strict(),
  z.object({ op: z.literal('rename_document'), name: z.string().trim().min(1).max(200) }).strict(),
]);
export const DocumentOpsBody = z
  .object({ ops: z.array(DocumentOpSchema).min(1).max(200) })
  .strict();
export type DocumentOpsInput = z.infer<typeof DocumentOpsBody>;
export interface DocumentOpsResponse {
  revision: number;
  applied: number;
  results: { ok: boolean; id?: string; error?: string }[];
}

/* ---------------- AI providers and the in-app assistant */
export const AiProviderKindSchema = z.enum(['anthropic', 'openai', 'openai_compatible', 'demo']);
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>;
export const CreateAiProviderBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: AiProviderKindSchema,
    /** Model id as the provider names it (ignored for `demo`). */
    model: z.string().trim().min(1).max(200).default('demo'),
    /** Required for `openai_compatible` (e.g. http://localhost:11434/v1); optional override otherwise. */
    baseUrl: z.string().trim().url().max(500).nullish(),
    apiKey: z.string().trim().min(1).max(500).nullish(),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.kind !== 'openai_compatible' || !!v.baseUrl, {
    message: 'baseUrl is required for OpenAI-compatible providers',
    path: ['baseUrl'],
  });
export type CreateAiProviderInput = z.infer<typeof CreateAiProviderBody>;
export const UpdateAiProviderBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    baseUrl: z.string().trim().url().max(500).nullish(),
    /** Omit to keep the stored key; null clears it. */
    apiKey: z.string().trim().min(1).max(500).nullish(),
    enabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type UpdateAiProviderInput = z.infer<typeof UpdateAiProviderBody>;
export interface AiProviderDto {
  id: string;
  name: string;
  kind: AiProviderKind;
  model: string;
  baseUrl: string | null;
  /** Whether a key is stored; the key itself is never returned. */
  hasKey: boolean;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
}
/** What non-admin users see: enough to pick a provider. */
export interface AiProviderSummaryDto {
  id: string;
  name: string;
  kind: AiProviderKind;
  model: string;
  isDefault: boolean;
}
export const AiChatBody = z
  .object({
    providerId: z.string().uuid().optional(),
    messages: z
      .array(
        z
          .object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20_000) })
          .strict(),
      )
      .min(1)
      .max(40),
  })
  .strict();
export type AiChatInput = z.infer<typeof AiChatBody>;
export interface AiChatStep {
  tool: string;
  summary: string;
  isError: boolean;
}
export interface AiChatResponse {
  reply: string;
  steps: AiChatStep[];
  /** Number of document operations applied during this turn. */
  applied: number;
  revision: number | null;
  provider: AiProviderSummaryDto;
  stopReason: string;
}

/* ---------------- first-run setup (desktop app) */
export const SetupBody = z
  .object({ name: NameSchema, email: EmailSchema, password: PasswordSchema })
  .strict();
export type SetupInput = z.infer<typeof SetupBody>;
export interface SetupStatusDto {
  /** True when running inside the desktop app. */
  desktop: boolean;
  /** True when no account exists yet and the setup screen should be shown. */
  needsSetup: boolean;
}
export interface SetupResponse {
  user: UserDto;
  workspaceId: string;
  projectId: string;
  documentId: string;
}

/** Desktop app: reset an account's password from the computer running SIGMA (no email involved). */
export const LocalResetBody = z
  .object({ email: EmailSchema.optional(), password: PasswordSchema })
  .strict();
export type LocalResetInput = z.infer<typeof LocalResetBody>;
