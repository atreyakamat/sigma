import { SceneGraph, isContainer } from '@sigma/document';
import type { DocumentJSON, NodeProps, SceneNode } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import * as Y from 'yjs';

/**
 * Shared-document layout inside a Y.Doc:
 *  - `nodes`: Y.Map<id, NodeRecord> — one plain JSON record per scene node (hierarchy as
 *    `parentId` + `childIds`, mirroring the flat scene graph).
 *  - `meta`: Y.Map with `id`, `name`, `metadata`, `pageIds`.
 * Records are replaced wholesale (last writer wins per node); hierarchy conflicts are repaired by
 * `childOrderFor`, which is deterministic so every peer converges to the same order.
 */
export interface NodeRecord {
  id: string;
  type: string;
  parentId: string | null;
  childIds: string[];
  [key: string]: unknown;
}

export interface GraphBinding {
  /** Origin tag used for transactions caused by local graph changes. */
  readonly origin: object;
  /** The Y.Doc currently bound (changes after `reset`). */
  readonly doc: Y.Doc;
  /** Replaces the shared state with a snapshot (e.g. after a version restore); the graph follows. */
  reset(state: Uint8Array): Y.Doc;
  /** Registers a listener for `reset`, so transports can re-attach to the new Y.Doc. */
  onDocReplaced(listener: (doc: Y.Doc) => void): () => void;
  destroy(): void;
}

const ROOT = '\u0000root';

function toRecord(graph: SceneGraph, node: SceneNode): NodeRecord {
  const childIds = node.childIds.filter((c) => !graph.isDerived(c));
  return JSON.parse(JSON.stringify({ ...node, childIds })) as NodeRecord;
}

function recordToProps(rec: NodeRecord): NodeProps {
  const { parentId: _p, childIds: _c, ...props } = rec;
  return props as unknown as NodeProps;
}

function propsKey(rec: NodeRecord): string {
  return JSON.stringify(recordToProps(rec));
}

/** Writes a graph's whole content into an (empty) Y.Doc. */
export function populateYDoc(graph: SceneGraph, doc: Y.Doc, origin: unknown = 'populate'): void {
  doc.transact(() => {
    const nodes = doc.getMap<NodeRecord>('nodes');
    const meta = doc.getMap<unknown>('meta');
    const visit = (id: NodeId) => {
      if (graph.isDerived(id)) return;
      const node = graph.requireNode(id);
      nodes.set(id, toRecord(graph, node));
      for (const c of node.childIds) visit(c);
    };
    for (const p of graph.pageIds) visit(p);
    meta.set('id', graph.id);
    meta.set('name', graph.name);
    meta.set('metadata', JSON.parse(JSON.stringify(graph.metadata)));
    meta.set('pageIds', [...graph.pageIds]);
  }, origin);
}

/** Deterministic child order for a parent: the listed order, then unlisted children sorted by id. */
function childOrderFor(
  graph: SceneGraph,
  parentId: NodeId | null,
  listed: readonly string[] | undefined,
): NodeId[] {
  const actual = parentId ? graph.getChildIds(parentId) : graph.pageIds;
  const real = actual.filter((c) => !graph.isDerived(c));
  const realSet = new Set(real);
  const ordered: NodeId[] = [];
  for (const id of listed ?? [])
    if (realSet.has(id as NodeId) && !ordered.includes(id as NodeId)) ordered.push(id as NodeId);
  const orphans = real.filter((id) => !ordered.includes(id)).sort();
  const derived = actual.filter((c) => graph.isDerived(c));
  return [...ordered, ...orphans, ...derived];
}

interface ApplyOptions {
  keys: Iterable<string>;
  metaChanged: boolean;
}

/**
 * Makes `graph` reflect the Y.Doc for the given node keys (and document meta), inserting,
 * replacing, reparenting, removing and re-ordering as needed. Pure function of the Y state, so
 * every peer applying the same state ends with the same graph.
 */
function applyFromDoc(
  graph: SceneGraph,
  doc: Y.Doc,
  opts: ApplyOptions,
  localOrigin: object,
): Set<string> {
  const nodes = doc.getMap<NodeRecord>('nodes');
  const meta = doc.getMap<unknown>('meta');
  const touchedParents = new Set<string>();
  const touched = new Set<string>();
  const keys = new Set(opts.keys);
  graph.batch(() => {
    // 1. Upserts, parents first (iterate until no progress).
    let pending = [...keys].filter((id) => nodes.has(id));
    let progress = true;
    while (pending.length && progress) {
      progress = false;
      const rest: string[] = [];
      for (const id of pending) {
        const rec = nodes.get(id)!;
        const parentReady = rec.parentId === null || graph.hasNode(rec.parentId as NodeId);
        if (!parentReady) {
          rest.push(id);
          continue;
        }
        if (graph.hasNode(id as NodeId)) {
          const cur = graph.requireNode(id as NodeId);
          if (cur.type !== rec.type) {
            // Type changed: rebuild the subtree from the shared state.
            touchedParents.add(cur.parentId ?? ROOT);
            graph.removeNode(id as NodeId);
            graph.insertNode(recordToProps(rec), rec.parentId as NodeId | null);
            for (const [cid, crec] of nodes.entries()) if (crec.parentId === id) rest.push(cid);
          } else {
            if (rec.parentId !== cur.parentId && rec.parentId !== null) {
              touchedParents.add(cur.parentId ?? ROOT);
              try {
                graph.reparentNode(id as NodeId, rec.parentId as NodeId);
              } catch {
                /* cycle or container violation: keep local hierarchy */
              }
            }
            if (propsKey(rec) !== propsKey(toRecord(graph, graph.requireNode(id as NodeId))))
              graph.replaceNode(recordToProps(rec));
          }
        } else {
          graph.insertNode(recordToProps(rec), rec.parentId as NodeId | null);
        }
        touched.add(id);
        touchedParents.add(rec.parentId ?? ROOT);
        if (isContainer(rec as unknown as SceneNode)) touchedParents.add(id);
        progress = true;
      }
      pending = rest;
    }
    // Leftovers point at parents that exist nowhere (added into a concurrently deleted parent).
    if (pending.length) {
      doc.transact(() => {
        for (const id of pending) if (!nodes.has(nodes.get(id)?.parentId ?? '')) nodes.delete(id);
      }, localOrigin);
    }
    // 3. Removals (after upserts so a replaced page can land before the old one goes).
    for (const id of keys) {
      if (nodes.has(id) || !graph.hasNode(id as NodeId) || graph.isDerived(id as NodeId)) continue;
      const node = graph.requireNode(id as NodeId);
      touchedParents.add(node.parentId ?? ROOT);
      try {
        graph.removeNode(id as NodeId);
      } catch {
        /* last page: keep it */
      }
    }
    // 4. Order.
    if (opts.metaChanged) touchedParents.add(ROOT);
    for (const p of touchedParents) {
      const parentId = p === ROOT ? null : (p as NodeId);
      if (parentId && !graph.hasNode(parentId)) continue;
      const listed = parentId
        ? nodes.get(parentId)?.childIds
        : (meta.get('pageIds') as string[] | undefined);
      const order = childOrderFor(graph, parentId, listed);
      const current = parentId ? graph.getChildIds(parentId) : graph.pageIds;
      if (order.some((id, i) => id !== current[i])) graph.setChildOrder(parentId, order);
      if (parentId) touched.add(parentId);
    }
    // 5. Document meta.
    if (opts.metaChanged) {
      const name = meta.get('name');
      if (typeof name === 'string' && name !== graph.name) graph.setName(name);
      const metadata = meta.get('metadata');
      if (
        metadata &&
        typeof metadata === 'object' &&
        JSON.stringify(metadata) !== JSON.stringify(graph.metadata)
      )
        graph.metadata = metadata as Record<string, unknown>;
    }
  });
  return touched;
}

/** Builds a standalone graph from the shared state (server-side persistence, exports). */
export function graphFromYDoc(doc: Y.Doc): SceneGraph {
  const meta = doc.getMap<unknown>('meta');
  const graph = new SceneGraph({
    id: typeof meta.get('id') === 'string' ? (meta.get('id') as string) : undefined,
    name: typeof meta.get('name') === 'string' ? (meta.get('name') as string) : undefined,
    metadata: (meta.get('metadata') as Record<string, unknown> | undefined) ?? {},
  });
  applyFromDoc(graph, doc, { keys: doc.getMap('nodes').keys(), metaChanged: true }, {});
  return graph;
}

/** Document JSON of the shared state. */
export function documentFromYDoc(doc: Y.Doc): DocumentJSON {
  return graphFromYDoc(doc).toJSON();
}

/**
 * Two-way binding between a scene graph and a Y.Doc. Local graph changes are mirrored into the
 * doc (transactions tagged with `binding.origin`); remote transactions are applied to the graph.
 * With `mergeLocal`, nodes already in the graph are written into the doc first (used when a
 * client connects with unsynced offline edits); otherwise the doc wins on connect.
 */
export function bindGraph(
  graph: SceneGraph,
  initialDoc: Y.Doc,
  options: { mergeLocal?: boolean; origin?: object } = {},
): GraphBinding {
  const origin = options.origin ?? { name: 'sigma-local' };
  let doc = initialDoc;
  let applying = false;
  const cache = new Map<string, string>();
  const replacedListeners = new Set<(d: Y.Doc) => void>();
  let unobserve: (() => void) | null = null;

  const snapshotKey = (node: SceneNode) => JSON.stringify(toRecord(graph, node));

  const refreshCache = (ids: Iterable<string>) => {
    for (const id of ids) {
      if (graph.hasNode(id as NodeId) && !graph.isDerived(id as NodeId))
        cache.set(id, snapshotKey(graph.requireNode(id as NodeId)));
      else cache.delete(id);
    }
  };

  const writeLocal = (candidates: Set<string>) => {
    const nodes = doc.getMap<NodeRecord>('nodes');
    const meta = doc.getMap<unknown>('meta');
    doc.transact(() => {
      for (const id of candidates) {
        if (id === ROOT) continue;
        if (graph.hasNode(id as NodeId) && !graph.isDerived(id as NodeId)) {
          const node = graph.requireNode(id as NodeId);
          const key = snapshotKey(node);
          if (cache.get(id) !== key) {
            nodes.set(id, JSON.parse(key) as NodeRecord);
            cache.set(id, key);
          }
        } else if (cache.has(id) || nodes.has(id)) {
          nodes.delete(id);
          cache.delete(id);
        }
      }
      const pageIds = [...graph.pageIds];
      if (JSON.stringify(meta.get('pageIds')) !== JSON.stringify(pageIds))
        meta.set('pageIds', pageIds);
      if (meta.get('name') !== graph.name) meta.set('name', graph.name);
      if (meta.get('id') !== graph.id) meta.set('id', graph.id);
      const md = JSON.stringify(graph.metadata);
      if (JSON.stringify(meta.get('metadata')) !== md) meta.set('metadata', JSON.parse(md));
    }, origin);
  };

  const allLocalIds = () => {
    const ids = new Set<string>();
    const visit = (id: NodeId) => {
      if (graph.isDerived(id)) return;
      ids.add(id);
      for (const c of graph.getChildIds(id)) visit(c);
    };
    for (const p of graph.pageIds) visit(p);
    return ids;
  };

  const offChange = graph.events.on('change', (change) => {
    if (applying) return;
    const candidates = new Set<string>([...change.added, ...change.removed, ...change.updated]);
    for (const id of [...change.added, ...change.updated]) {
      if (graph.hasNode(id)) candidates.add(graph.requireNode(id).parentId ?? ROOT);
    }
    for (const id of [...change.updated, ...change.removed]) {
      const cached = cache.get(id);
      if (cached) candidates.add((JSON.parse(cached) as NodeRecord).parentId ?? ROOT);
    }
    if (change.structural) candidates.add(ROOT);
    writeLocal(candidates);
  });

  const applyRemote = (keys: Iterable<string>, metaChanged: boolean) => {
    applying = true;
    try {
      const touched = applyFromDoc(graph, doc, { keys, metaChanged }, origin);
      refreshCache(new Set([...keys, ...touched]));
      // Stale entries for nodes the remote removed.
      for (const id of [...cache.keys()]) if (!graph.hasNode(id as NodeId)) cache.delete(id);
    } finally {
      applying = false;
    }
  };

  const observe = () => {
    const nodes = doc.getMap<NodeRecord>('nodes');
    const meta = doc.getMap<unknown>('meta');
    const onNodes = (e: Y.YMapEvent<NodeRecord>, tx: Y.Transaction) => {
      if (tx.origin === origin) return;
      applyRemote(e.keysChanged, false);
    };
    const onMeta = (_e: Y.YMapEvent<unknown>, tx: Y.Transaction) => {
      if (tx.origin === origin) return;
      applyRemote([], true);
    };
    nodes.observe(onNodes);
    meta.observe(onMeta);
    unobserve = () => {
      nodes.unobserve(onNodes);
      meta.unobserve(onMeta);
    };
  };

  const attach = (mergeLocal: boolean) => {
    if (mergeLocal) {
      cache.clear();
      writeLocal(allLocalIds());
    }
    applyRemote([...doc.getMap('nodes').keys(), ...allLocalIds()], true);
    observe();
  };

  attach(options.mergeLocal ?? false);

  return {
    origin,
    get doc() {
      return doc;
    },
    reset(state) {
      unobserve?.();
      doc = new Y.Doc();
      Y.applyUpdate(doc, state, 'reset');
      cache.clear();
      attach(false);
      for (const l of replacedListeners) l(doc);
      return doc;
    },
    onDocReplaced(listener) {
      replacedListeners.add(listener);
      return () => replacedListeners.delete(listener);
    },
    destroy() {
      offChange();
      unobserve?.();
      replacedListeners.clear();
    },
  };
}

/* ------------------------------------------------------------------ transport helpers */

export function encodeUpdate(update: Uint8Array): string {
  let s = '';
  for (let i = 0; i < update.length; i += 0x8000)
    s += String.fromCharCode(...update.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeUpdate(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
