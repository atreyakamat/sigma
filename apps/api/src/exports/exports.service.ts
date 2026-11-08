import { createCanvas } from '@napi-rs/canvas';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentJSON } from '@sigma/document';
import { SceneGraph } from '@sigma/document';
import { exportSvg, extractDesignTokens, tokensToCss } from '@sigma/import-export';
import { rasterizeNodes } from '@sigma/renderer';
import type { NodeId } from '@sigma/shared';
import type { User } from '../../prisma/generated/client';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ExportQuery {
  /** Frame (node) id; defaults to the first page. */
  frame?: string;
  /** Page id; defaults to the first page. */
  page?: string;
  scale?: string;
  /** Only frames whose review state is APPROVED (tokens / all-frames listing). */
  approved?: string;
}

/** Server-side rendering: SVG and PNG of pages or frames, and design tokens. */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  private async load(
    user: User,
    documentId: string,
  ): Promise<{ graph: SceneGraph; json: DocumentJSON }> {
    const { workspaceId } = await this.perms.workspaceOfDocument(documentId);
    await this.perms.assert(user, workspaceId, 'document.read');
    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
      select: { content: true },
    });
    const json = doc.content as DocumentJSON;
    return { graph: SceneGraph.fromJSON(json), json };
  }

  private targets(graph: SceneGraph, q: ExportQuery): NodeId[] {
    if (q.frame) {
      if (!graph.hasNode(q.frame as NodeId)) throw new NotFoundException('Frame not found');
      return [q.frame as NodeId];
    }
    const pageId = (q.page as NodeId | undefined) ?? (graph.pageIds[0] as NodeId);
    if (!graph.hasNode(pageId) || graph.getNode(pageId)?.type !== 'PAGE')
      throw new NotFoundException('Page not found');
    return [pageId];
  }

  async svg(user: User, documentId: string, q: ExportQuery): Promise<string> {
    const { graph } = await this.load(user, documentId);
    return exportSvg(graph, this.targets(graph, q), { prolog: true, padding: q.frame ? 0 : 16 });
  }

  async png(user: User, documentId: string, q: ExportQuery): Promise<Buffer> {
    const scale = Number(q.scale ?? 1);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
      throw new BadRequestException('scale must be between 0 and 4');
    const { graph } = await this.load(user, documentId);
    const ids = this.targets(graph, q);
    const rects = ids.flatMap((id) => {
      const node = graph.requireNode(id);
      return node.type === 'PAGE'
        ? node.childIds.map((c) => graph.getWorldBounds(c))
        : [graph.getWorldBounds(id)];
    });
    const width = rects.length
      ? Math.max(...rects.map((r) => r.x + r.width)) - Math.min(...rects.map((r) => r.x))
      : 1;
    const height = rects.length
      ? Math.max(...rects.map((r) => r.y + r.height)) - Math.min(...rects.map((r) => r.y))
      : 1;
    if (width * scale > 8192 || height * scale > 8192)
      throw new BadRequestException('Output exceeds 8192px; lower the scale');
    const canvas = rasterizeNodes(graph, ids, {
      scale,
      background: '#ffffff',
      padding: q.frame ? 0 : 16,
      createCanvas: (w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement,
    });
    return (canvas as unknown as { toBuffer(mime: 'image/png'): Buffer }).toBuffer('image/png');
  }

  async tokens(
    user: User,
    documentId: string,
    q: ExportQuery,
  ): Promise<{ json: ReturnType<typeof extractDesignTokens>; css: string }> {
    const { json } = await this.load(user, documentId);
    const tokens = extractDesignTokens(json, { approvedOnly: q.approved === 'true' });
    return { json: tokens, css: tokensToCss(tokens) };
  }

  /** Lists frames (optionally only approved) with their review state, for handoff tooling. */
  async frames(
    user: User,
    documentId: string,
    q: ExportQuery,
  ): Promise<
    { id: string; name: string; pageId: string; width: number; height: number; review: unknown }[]
  > {
    const { graph } = await this.load(user, documentId);
    const out: {
      id: string;
      name: string;
      pageId: string;
      width: number;
      height: number;
      review: unknown;
    }[] = [];
    for (const page of graph.pages) {
      for (const child of graph.getChildren(page.id)) {
        if (child.type !== 'FRAME') continue;
        const review = (child.metadata as { review?: { state?: string } }).review ?? null;
        if (q.approved === 'true' && review?.state !== 'APPROVED') continue;
        out.push({
          id: child.id,
          name: child.name,
          pageId: page.id,
          width: child.size.width,
          height: child.size.height,
          review,
        });
      }
    }
    return out;
  }
}
