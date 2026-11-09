import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { outlineDocument } from '@sigma/document';
import type { DocumentJSON } from '@sigma/document';
import { DocumentOpsBody, roleHas } from '@sigma/validation';
import type {
  AiChatInput,
  AiChatResponse,
  AiProviderDto,
  AiProviderKind,
  AiProviderSummaryDto,
  CreateAiProviderInput,
  UpdateAiProviderInput,
} from '@sigma/validation';
import type { AiProvider, User } from '../../prisma/generated/client';
import { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../common/crypto';
import type { AppConfig } from '../config/configuration';
import { DocumentsService } from '../documents/documents.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderError, runAgent } from './agent';
import type { AgentTool } from './agent';

const DEFAULT_MODELS: Record<AiProviderKind, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
  openai_compatible: 'llama3.1',
  demo: 'demo',
};

export const SYSTEM_PROMPT = `You are the design assistant inside SIGMA, a collaborative design tool. You help the user by reading and editing the open design file through the tools provided.

How the canvas works: a document has pages; a page contains frames (screens/artboards) and layers. Coordinates are in pixels, relative to the parent, with y growing downward. Colours are hex strings.

Working rules:
- Call get_document_outline before editing unless you already have a current outline in this conversation, so that ids and positions are real.
- Make changes with apply_document_ops. Batch related operations in one call; use "ref" on an added node and "$ref" as the "parent" of nodes that belong inside it.
- Put screen content inside a FRAME rather than directly on the page, lay elements out with consistent spacing, and give layers descriptive names.
- If an operation fails, read the error, fix the cause, and retry once. Never invent node ids.
- When you have view-only access there is no editing tool: describe what you would change instead.
- After editing, reply with a short summary of what changed. Do not print raw JSON to the user.`;

const OPS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ops'],
  properties: {
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 200,
      description:
        'Operations applied in order. A failing operation is skipped and reported; the rest still run.',
      items: {
        type: 'object',
        required: ['op'],
        properties: {
          op: { type: 'string', enum: ['add', 'update', 'move', 'delete', 'rename_document'] },
          type: {
            type: 'string',
            enum: [
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
            ],
            description: 'add only',
          },
          id: { type: 'string', description: 'update / move / delete: id of an existing node' },
          parent: {
            type: 'string',
            description:
              'add / move: parent node id, or "$ref" of a node added earlier in this call. Defaults to the first page.',
          },
          ref: {
            type: 'string',
            description: 'add only: a short name later ops can reference as "$name"',
          },
          index: { type: 'integer', minimum: 0 },
          name: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          rotation: { type: 'number' },
          fill: { type: 'string', description: 'hex colour like #2563eb, or "none"' },
          stroke: { type: 'string', description: 'hex colour, or "none"' },
          strokeWidth: { type: 'number' },
          opacity: { type: 'number', minimum: 0, maximum: 1 },
          visible: { type: 'boolean' },
          cornerRadius: { type: 'number' },
          text: { type: 'string', description: 'TEXT nodes: the characters' },
          fontSize: { type: 'number' },
          fontWeight: { type: 'integer' },
        },
      },
    },
  },
} as const;

function toDto(p: AiProvider): AiProviderDto {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind as AiProviderKind,
    model: p.model,
    baseUrl: p.baseUrl,
    hasKey: !!p.apiKey,
    enabled: p.enabled,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
  };
}
function toSummary(p: AiProvider): AiProviderSummaryDto {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind as AiProviderKind,
    model: p.model,
    isDefault: p.isDefault,
  };
}

/** AI provider configuration (system admins) and the in-document assistant (members). */
@Injectable()
export class AiService {
  private readonly secret: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.secret = config.get('sessionSecret', { infer: true });
  }

  /* ---- providers */

  async listAll(): Promise<AiProviderDto[]> {
    return (await this.prisma.aiProvider.findMany({ orderBy: { createdAt: 'asc' } })).map(toDto);
  }

  async listEnabled(): Promise<AiProviderSummaryDto[]> {
    return (
      await this.prisma.aiProvider.findMany({
        where: { enabled: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      })
    ).map(toSummary);
  }

  async create(actor: User, input: CreateAiProviderInput): Promise<AiProviderDto> {
    if (input.isDefault) await this.prisma.aiProvider.updateMany({ data: { isDefault: false } });
    const first = (await this.prisma.aiProvider.count()) === 0;
    const row = await this.prisma.aiProvider.create({
      data: {
        name: input.name,
        kind: input.kind,
        model:
          input.kind === 'demo'
            ? 'demo'
            : input.model === 'demo'
              ? DEFAULT_MODELS[input.kind]
              : input.model,
        baseUrl: input.baseUrl ?? null,
        apiKey: input.apiKey ? encryptSecret(input.apiKey, this.secret) : null,
        enabled: input.enabled,
        isDefault: input.isDefault || first,
      },
    });
    await this.audit.record('ai.provider_saved', {
      actorId: actor.id,
      targetType: 'ai_provider',
      targetId: row.id,
      metadata: { name: row.name, kind: row.kind, model: row.model },
    });
    return toDto(row);
  }

  async update(actor: User, id: string, input: UpdateAiProviderInput): Promise<AiProviderDto> {
    const existing = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');
    if (input.isDefault)
      await this.prisma.aiProvider.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    const row = await this.prisma.aiProvider.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
        ...(input.apiKey !== undefined
          ? { apiKey: input.apiKey ? encryptSecret(input.apiKey, this.secret) : null }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
    });
    await this.audit.record('ai.provider_saved', {
      actorId: actor.id,
      targetType: 'ai_provider',
      targetId: row.id,
      metadata: { name: row.name, kind: row.kind, model: row.model },
    });
    return toDto(row);
  }

  async remove(actor: User, id: string): Promise<void> {
    const existing = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');
    await this.prisma.aiProvider.delete({ where: { id } });
    await this.audit.record('ai.provider_deleted', {
      actorId: actor.id,
      targetType: 'ai_provider',
      targetId: id,
      metadata: { name: existing.name },
    });
  }

  /** Sends a one-line prompt without tools to check the configuration end to end. */
  async test(id: string): Promise<{ ok: boolean; message: string }> {
    const row = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Provider not found');
    try {
      const result = await runAgent(this.configOf(row), {
        system: 'Reply with the single word: ready',
        history: [{ role: 'user', content: 'Are you ready?' }],
        tools: [],
        maxSteps: 1,
      });
      return { ok: true, message: result.text.slice(0, 200) || 'The provider answered.' };
    } catch (e) {
      if (e instanceof ProviderError) return { ok: false, message: e.message };
      throw e;
    }
  }

  private configOf(row: AiProvider) {
    return {
      kind: row.kind as AiProviderKind,
      model: row.model,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey ? decryptSecret(row.apiKey, this.secret) : null,
    };
  }

  /* ---- assistant */

  async chat(
    user: User,
    documentId: string,
    input: AiChatInput,
    ip?: string,
  ): Promise<AiChatResponse> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    const role = await this.perms.assert(user, workspaceId, 'document.read');
    const canWrite = roleHas(role, 'document.write');
    if (input.messages[input.messages.length - 1]!.role !== 'user')
      throw new BadRequestException('The last message must be from the user');
    const provider = input.providerId
      ? await this.prisma.aiProvider.findFirst({ where: { id: input.providerId, enabled: true } })
      : await this.prisma.aiProvider.findFirst({
          where: { enabled: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        });
    if (!provider)
      throw new BadRequestException(
        'No AI provider is configured. Ask an administrator to add one under Admin → AI providers.',
      );

    let applied = 0;
    let revision: number | null = null;
    const tools: AgentTool[] = [
      {
        name: 'get_document_outline',
        description:
          'Returns the current structure of the open design file as JSON: pages, then nested layers with id, type, name, x, y, w, h, text and solid fill. Call this before editing so ids and positions are real, and again after large edits if you need the new ids.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        run: async () => {
          const doc = await this.documents.get(user, documentId);
          return JSON.stringify(outlineDocument(doc.content as DocumentJSON));
        },
      },
    ];
    if (canWrite)
      tools.push({
        name: 'apply_document_ops',
        description:
          'Edits the open design file. Takes a list of operations (add, update, move, delete, rename_document) applied in order and returns one result per operation with the id it created or touched, or an error. Use "ref" + "$ref" to nest nodes added in the same call. Everyone viewing the file sees the change immediately.',
        inputSchema: OPS_SCHEMA as unknown as Record<string, unknown>,
        run: async (raw) => {
          const parsed = DocumentOpsBody.safeParse(raw);
          if (!parsed.success)
            throw new Error(
              `Invalid operations: ${parsed.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')
                .slice(0, 600)}`,
            );
          const res = await this.documents.applyOps(user, documentId, parsed.data.ops);
          applied += res.applied;
          revision = res.revision;
          return JSON.stringify({ applied: res.applied, results: res.results });
        },
      });

    try {
      const result = await runAgent(this.configOf(provider), {
        system: SYSTEM_PROMPT,
        history: input.messages,
        tools,
        maxSteps: 8,
      });
      await this.audit.record('ai.chat', {
        actorId: user.id,
        targetType: 'document',
        targetId: documentId,
        ip,
        metadata: {
          provider: provider.name,
          model: provider.model,
          steps: result.steps.length,
          applied,
        },
      });
      return {
        reply: result.text,
        steps: result.steps.map((s) => ({
          tool: s.tool,
          isError: s.isError,
          summary: s.isError
            ? s.output.slice(0, 200)
            : s.tool === 'apply_document_ops'
              ? `${((s.input as { ops?: unknown[] }).ops ?? []).length} operation(s)`
              : 'read the file',
        })),
        applied,
        revision,
        provider: toSummary(provider),
        stopReason: result.stopReason,
      };
    } catch (e) {
      if (e instanceof ProviderError)
        throw new HttpException({ statusCode: e.status, message: e.message }, e.status);
      throw e;
    }
  }
}
