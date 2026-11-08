import type { NodeId } from '@sigma/shared';
import type { DocumentJSON, NodeJSON } from './schema';

export interface NodeChange {
  id: NodeId;
  name: string;
  type: NodeJSON['type'];
  kind: 'added' | 'removed' | 'modified' | 'moved';
  /** Top-level props that differ (for 'modified'). */
  fields: string[];
  pageId: NodeId;
}

export interface DocumentDiff {
  changes: NodeChange[];
  added: number;
  removed: number;
  modified: number;
  moved: number;
}

interface Flat {
  node: NodeJSON;
  parentId: NodeId | null;
  index: number;
  pageId: NodeId;
}

function flatten(doc: DocumentJSON): Map<NodeId, Flat> {
  const out = new Map<NodeId, Flat>();
  const visit = (node: NodeJSON, parentId: NodeId | null, index: number, pageId: NodeId): void => {
    out.set(node.id as NodeId, { node, parentId, index, pageId });
    node.children?.forEach((c, i) => visit(c, node.id as NodeId, i, pageId));
  };
  doc.pages.forEach((p, i) => visit(p, null, i, p.id as NodeId));
  return out;
}

function propsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Structural diff between two versions of a document, by stable node id. */
export function diffDocuments(before: DocumentJSON, after: DocumentJSON): DocumentDiff {
  const a = flatten(before);
  const b = flatten(after);
  const changes: NodeChange[] = [];
  // Order among siblings that exist in both versions; pure insertions/removals do not move others.
  const survivingIndex = (
    flat: Map<NodeId, Flat>,
    other: Map<NodeId, Flat>,
  ): Map<NodeId, number> => {
    const byParent = new Map<string, Flat[]>();
    for (const f of flat.values()) {
      if (!other.has(f.node.id as NodeId)) continue;
      const key = f.parentId ?? '';
      const list = byParent.get(key) ?? [];
      list.push(f);
      byParent.set(key, list);
    }
    const out = new Map<NodeId, number>();
    for (const list of byParent.values())
      list.sort((x, y) => x.index - y.index).forEach((f, i) => out.set(f.node.id as NodeId, i));
    return out;
  };
  const orderA = survivingIndex(a, b);
  const orderB = survivingIndex(b, a);
  for (const [id, fb] of b) {
    const fa = a.get(id);
    if (!fa) {
      changes.push({
        id,
        name: fb.node.name,
        type: fb.node.type,
        kind: 'added',
        fields: [],
        pageId: fb.pageId,
      });
      continue;
    }
    const fields: string[] = [];
    const keys = new Set([...Object.keys(fa.node), ...Object.keys(fb.node)]);
    keys.delete('children');
    for (const k of keys)
      if (
        !propsEqual(
          (fa.node as Record<string, unknown>)[k],
          (fb.node as Record<string, unknown>)[k],
        )
      )
        fields.push(k);
    const moved = fa.parentId !== fb.parentId || orderA.get(id) !== orderB.get(id);
    if (fields.length)
      changes.push({
        id,
        name: fb.node.name,
        type: fb.node.type,
        kind: 'modified',
        fields,
        pageId: fb.pageId,
      });
    else if (moved)
      changes.push({
        id,
        name: fb.node.name,
        type: fb.node.type,
        kind: 'moved',
        fields: [],
        pageId: fb.pageId,
      });
  }
  for (const [id, fa] of a) {
    if (!b.has(id))
      changes.push({
        id,
        name: fa.node.name,
        type: fa.node.type,
        kind: 'removed',
        fields: [],
        pageId: fa.pageId,
      });
  }
  const count = (k: NodeChange['kind']) => changes.filter((c) => c.kind === k).length;
  return {
    changes,
    added: count('added'),
    removed: count('removed'),
    modified: count('modified'),
    moved: count('moved'),
  };
}
