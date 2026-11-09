import type { NodeId } from '@sigma/shared';
import type { SceneNode } from './nodes';
import type { NodeJSON, NodeProps } from './schema';
import type { SceneGraph } from './scene-graph';

/** Deterministic id of the projected copy of `mainNodeId` inside `instanceId`. */
export function instanceChildId(instanceId: NodeId, mainNodeId: NodeId): NodeId {
  return `${instanceId}~${mainNodeId}` as NodeId;
}

/** For a derived node, the instance that owns it and the master node it mirrors. */
export function resolveInstanceTarget(
  graph: SceneGraph,
  id: NodeId,
): { instanceId: NodeId; mainNodeId: NodeId } | null {
  if (!graph.isDerived(id)) return null;
  const sep = id.indexOf('~');
  if (sep === -1) return null;
  // Nested instances produce ids like "outer~inner~main"; the owning instance is the longest prefix that is a real instance.
  let instanceId = id.slice(0, sep) as NodeId;
  let rest = id.slice(sep + 1);
  while (rest.includes('~')) {
    const cut = rest.indexOf('~');
    const candidate = `${instanceId}~${rest.slice(0, cut)}` as NodeId;
    if (graph.getNode(candidate)?.type === 'INSTANCE') {
      instanceId = candidate;
      rest = rest.slice(cut + 1);
    } else break;
  }
  return { instanceId, mainNodeId: rest as NodeId };
}

/** Builds the JSON an instance should project, from its master, with overrides applied. */
export function projectedChildren(graph: SceneGraph, instanceId: NodeId, depth = 0): NodeJSON[] {
  const instance = graph.getNode(instanceId);
  if (!instance || instance.type !== 'INSTANCE' || depth > 8) return [];
  const master = graph.getNode(instance.componentId as NodeId);
  if (!master || master.type !== 'COMPONENT') return [];
  const overrides = instance.overrides as Record<string, Record<string, unknown>>;
  const copy = (id: NodeId): NodeJSON | null => {
    const node = graph.getNode(id);
    if (!node) return null;
    const { parentId: _p, childIds, ...props } = node;
    const patch = overrides[id] ?? {};
    const merged: Record<string, unknown> = { ...(props as NodeProps) };
    for (const [k, v] of Object.entries(patch)) {
      const prev = merged[k];
      merged[k] =
        prev &&
        typeof prev === 'object' &&
        !Array.isArray(prev) &&
        v &&
        typeof v === 'object' &&
        !Array.isArray(v)
          ? { ...(prev as object), ...(v as object) }
          : v;
    }
    merged.id = instanceChildId(instanceId, id);
    merged.metadata = { ...(merged.metadata as object), mainNodeId: id };
    const json = merged as NodeJSON;
    if (node.type === 'INSTANCE') json.children = [];
    else if (childIds.length)
      json.children = childIds
        .filter((c) => !graph.isDerived(c))
        .map(copy)
        .filter((c): c is NodeJSON => !!c);
    return json;
  };
  return master.childIds
    .filter((c) => !graph.isDerived(c))
    .map(copy)
    .filter((c): c is NodeJSON => !!c);
}

function fingerprint(graph: SceneGraph, id: NodeId): string {
  const node = graph.requireNode(id);
  const { parentId: _p, childIds, ...props } = node;
  return JSON.stringify(props) + '[' + childIds.map((c) => fingerprint(graph, c)).join(',') + ']';
}

/**
 * Materializes instance children for every INSTANCE in the graph (nested instances included).
 * Derived nodes are rebuilt only when their projection changed. Returns true if anything changed.
 */
export function projectInstances(graph: SceneGraph): boolean {
  let changed = false;
  const instances = graph.getNodeIdsOfType('INSTANCE');
  if (instances.length === 0) return false;
  // Outer instances first so nested projections see their parent's projected children.
  const ordered = [...instances].sort((a, b) => graph.getDepth(a) - graph.getDepth(b));
  const seen = new Set<NodeId>();
  const project = (id: NodeId): void => {
    if (seen.has(id) || !graph.hasNode(id)) return;
    seen.add(id);
    const node = graph.getNode(id);
    if (!node || node.type !== 'INSTANCE') return;
    const desired = projectedChildren(graph, id);
    const current = node.childIds.filter((c) => graph.isDerived(c));
    const desiredKey = JSON.stringify(desired);
    const currentKey =
      '[' + current.map((c) => JSON.stringify(graph.nodeToJSONIncludingDerived(c))).join(',') + ']';
    if (desiredKey !== currentKey) {
      graph.batch(() => {
        for (const c of current) graph.removeNode(c);
        for (const json of desired) graph.insertSubtreeJSON(json, id, undefined, { derived: true });
      });
      changed = true;
    }
    // Nested instances inside the projection are themselves instances: recurse into them.
    for (const c of graph.getDescendantIds(id))
      if (graph.getNode(c)?.type === 'INSTANCE') project(c);
  };
  for (const id of ordered) project(id);
  void fingerprint;
  return changed;
}

/** All INSTANCE nodes whose master is `componentId`. */
export function instancesOf(graph: SceneGraph, componentId: NodeId): SceneNode[] {
  const out: SceneNode[] = [];
  for (const page of graph.pageIds)
    graph.traverse(page, (n) => {
      if (n.type === 'INSTANCE' && n.componentId === componentId) out.push(n);
    });
  return out;
}
