import type { NodeId } from '@sigma/shared';
import { colorToHex, hexToColor } from './color';
import { createNodeProps } from './nodes';
import { SceneGraph } from './scene-graph';
import { NodePropsSchema } from './schema';
import type { DocumentJSON, NodeJSON, NodeProps, NodeType } from './schema';

/**
 * High-level, validated edit operations on a document. This is the editing surface offered to
 * automation (the MCP server, the in-app assistant, scripts): small JSON ops instead of raw
 * document JSON, each applied through the scene graph so the result is always schema-valid.
 */
export type AddableType =
  Exclude<NodeType, 'PAGE' | 'INSTANCE' | 'COMPONENT_SET' | 'VECTOR' | 'IMAGE'> | 'PAGE';

export interface NodeFields {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  /** Hex colour (#rgb, #rrggbb, #rrggbbaa); sets a single solid fill. `"none"` clears fills. */
  fill?: string;
  /** Hex colour of a 1px (or `strokeWidth`) stroke. `"none"` clears strokes. */
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  visible?: boolean;
  cornerRadius?: number;
  /** Text content (TEXT nodes). */
  text?: string;
  fontSize?: number;
  fontWeight?: number;
}

export type DocumentOp =
  | ({
      op: 'add';
      type: AddableType;
      /** Parent node id, or `$ref` of a node added earlier in the same batch. Defaults to the first page. */
      parent?: string;
      /** Name other ops in this batch can use as `$ref`. */
      ref?: string;
      index?: number;
    } & NodeFields)
  | ({ op: 'update'; id: string } & NodeFields)
  | { op: 'move'; id: string; parent: string; index?: number }
  | { op: 'delete'; id: string }
  | { op: 'rename_document'; name: string };

export interface OpResult {
  ok: boolean;
  /** Id of the node the op created or touched. */
  id?: string;
  error?: string;
}

function parseColor(value: string, what: string) {
  const c = hexToColor(value);
  if (!c) throw new Error(`Invalid ${what} colour "${value}"; use hex like #2563eb`);
  return c;
}

function patchFor(
  fields: NodeFields,
  type: NodeType,
  current?: {
    transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
    size: { width: number; height: number };
  },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined) patch['name'] = fields.name;
  if (fields.x !== undefined || fields.y !== undefined || fields.rotation !== undefined) {
    patch['transform'] = {
      ...(fields.x !== undefined ? { x: fields.x } : {}),
      ...(fields.y !== undefined ? { y: fields.y } : {}),
      ...(fields.rotation !== undefined ? { rotation: fields.rotation } : {}),
    };
  }
  if (fields.width !== undefined || fields.height !== undefined) {
    if (
      (fields.width !== undefined && fields.width <= 0) ||
      (fields.height !== undefined && fields.height <= 0)
    )
      throw new Error('width and height must be positive');
    patch['size'] = {
      ...(fields.width !== undefined ? { width: fields.width } : {}),
      ...(fields.height !== undefined ? { height: fields.height } : {}),
    };
  }
  const style: Record<string, unknown> = {};
  if (fields.fill !== undefined)
    style['fills'] =
      fields.fill === 'none'
        ? []
        : [{ type: 'SOLID', color: parseColor(fields.fill, 'fill'), opacity: 1, visible: true }];
  if (fields.stroke !== undefined)
    style['strokes'] =
      fields.stroke === 'none'
        ? []
        : [
            {
              paint: {
                type: 'SOLID',
                color: parseColor(fields.stroke, 'stroke'),
                opacity: 1,
                visible: true,
              },
              width: fields.strokeWidth ?? 1,
              align: 'CENTER',
            },
          ];
  if (fields.opacity !== undefined) {
    if (fields.opacity < 0 || fields.opacity > 1)
      throw new Error('opacity must be between 0 and 1');
    style['opacity'] = fields.opacity;
  }
  if (fields.cornerRadius !== undefined) {
    if (fields.cornerRadius < 0) throw new Error('cornerRadius must not be negative');
    style['cornerRadius'] = fields.cornerRadius;
  }
  if (Object.keys(style).length) patch['style'] = style;
  if (fields.visible !== undefined) patch['visible'] = fields.visible;
  if (type === 'TEXT') {
    if (fields.text !== undefined) patch['characters'] = fields.text;
    const ts: Record<string, unknown> = {};
    if (fields.fontSize !== undefined) ts['fontSize'] = fields.fontSize;
    if (fields.fontWeight !== undefined) ts['fontWeight'] = fields.fontWeight;
    if (Object.keys(ts).length) patch['textStyle'] = ts;
  }
  void current;
  return patch;
}

/**
 * Re-validates a node against the strict schema after a patch (filling defaults such as stroke
 * caps). Returns an error message when the patch made the node invalid, e.g. a field its type
 * does not have.
 */
function normalise(graph: SceneGraph, id: NodeId): string | null {
  const { parentId: _p, childIds: _c, ...props } = graph.requireNode(id);
  const parsed = NodePropsSchema.safeParse(props);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const keys = (issue as { keys?: string[] }).keys;
    return keys
      ? `${props.type.toLowerCase()} layers have no "${keys.join('", "')}"`
      : `${issue.path.join('.')}: ${issue.message}`;
  }
  graph.replaceNode(parsed.data as NodeProps);
  return null;
}

/** Applies ops in order. A failing op is skipped and reported; later ops still run. */
export function applyDocumentOps(
  json: DocumentJSON,
  ops: readonly DocumentOp[],
): { content: DocumentJSON; results: OpResult[] } {
  const graph = SceneGraph.fromJSON(json);
  const refs = new Map<string, NodeId>();
  const results: OpResult[] = [];
  const resolve = (idOrRef: string | undefined): NodeId => {
    if (idOrRef === undefined) return graph.pageIds[0] as NodeId;
    if (idOrRef.startsWith('$')) {
      const id = refs.get(idOrRef.slice(1));
      if (!id) throw new Error(`Unknown ref "${idOrRef}"`);
      return id;
    }
    if (!graph.hasNode(idOrRef as NodeId)) throw new Error(`Node "${idOrRef}" not found`);
    return idOrRef as NodeId;
  };
  for (const op of ops) {
    try {
      if (op.op === 'add') {
        const { op: _o, type, parent, ref, index, ...fields } = op;
        const patch = patchFor(fields, type);
        const defaults = createNodeProps(type, {});
        let id: NodeId;
        graph.batch(() => {
          id = graph.insertNode(defaults, type === 'PAGE' ? null : resolve(parent), index);
          if (Object.keys(patch).length) graph.updateNode(id, patch);
          const invalid = normalise(graph, id);
          if (invalid) {
            graph.removeNode(id);
            throw new Error(invalid);
          }
        });
        if (ref) refs.set(ref, id!);
        results.push({ ok: true, id: id! });
      } else if (op.op === 'update') {
        const id = resolve(op.id);
        const node = graph.requireNode(id);
        const { op: _o, id: _i, ...fields } = op;
        const { parentId: _pp, childIds: _cc, ...before } = node;
        graph.batch(() => {
          graph.updateNode(id, patchFor(fields, node.type));
          const invalid = normalise(graph, id);
          if (invalid) {
            graph.replaceNode(before as NodeProps);
            throw new Error(invalid);
          }
        });
        results.push({ ok: true, id });
      } else if (op.op === 'move') {
        const id = resolve(op.id);
        graph.reparentNode(id, resolve(op.parent), op.index);
        results.push({ ok: true, id });
      } else if (op.op === 'delete') {
        const id = resolve(op.id);
        graph.removeNode(id);
        results.push({ ok: true, id });
      } else if (op.op === 'rename_document') {
        if (!op.name.trim()) throw new Error('name must not be empty');
        graph.setName(op.name.trim());
        results.push({ ok: true });
      } else {
        throw new Error(`Unknown op "${(op as { op: string }).op}"`);
      }
    } catch (e) {
      results.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { content: graph.toJSON(), results };
}

export interface OutlineNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fill?: string;
  children?: OutlineNode[];
}
export interface DocumentOutline {
  id: string;
  name: string;
  pages: { id: string; name: string; children: OutlineNode[] }[];
  nodeCount: number;
  /** True when the outline stopped at `maxNodes`. */
  truncated: boolean;
}

/** Compact, LLM-friendly summary of a document: ids, types, names, geometry, text and solid fill. */
export function outlineDocument(
  json: DocumentJSON,
  options: { maxNodes?: number } = {},
): DocumentOutline {
  const max = options.maxNodes ?? 400;
  let count = 0;
  let truncated = false;
  const visit = (n: NodeJSON): OutlineNode | null => {
    if (count >= max) {
      truncated = true;
      return null;
    }
    count++;
    const anyN = n as unknown as {
      transform: { x: number; y: number };
      size: { width: number; height: number };
      characters?: string;
      style?: { fills?: { type: string; color?: Parameters<typeof colorToHex>[0] }[] };
    };
    const out: OutlineNode = {
      id: n.id,
      type: n.type,
      name: n.name,
      x: Math.round(anyN.transform.x),
      y: Math.round(anyN.transform.y),
      w: Math.round(anyN.size.width),
      h: Math.round(anyN.size.height),
    };
    if (typeof anyN.characters === 'string' && anyN.characters)
      out.text = anyN.characters.slice(0, 200);
    const fill = anyN.style?.fills?.find((f) => f.type === 'SOLID' && f.color);
    if (fill?.color) out.fill = colorToHex(fill.color);
    if (n.children?.length)
      out.children = n.children.map(visit).filter((c): c is OutlineNode => c !== null);
    return out;
  };
  const pages = json.pages.map((p) => ({
    id: p.id,
    name: p.name,
    children: (p.children ?? []).map(visit).filter((c): c is OutlineNode => c !== null),
  }));
  let total = 0;
  const countAll = (n: NodeJSON): void => {
    total++;
    n.children?.forEach(countAll);
  };
  json.pages.forEach((p) => p.children?.forEach(countAll));
  return { id: json.id, name: json.name, pages, nodeCount: total, truncated };
}
