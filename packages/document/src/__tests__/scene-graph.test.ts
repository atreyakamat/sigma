import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import {
  SceneGraph,
  createNodeProps,
  parseDocumentJSON,
  migrateDocument,
  UnsupportedSchemaError,
} from '../index';

function setup() {
  const graph = SceneGraph.createEmpty('Doc');
  const page = graph.pageIds[0] as NodeId;
  const frame = graph.insertNode(
    createNodeProps('FRAME', {
      transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 400, height: 300 },
    }),
    page,
  );
  const rectId = graph.insertNode(
    createNodeProps('RECTANGLE', {
      transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 50, height: 60 },
    }),
    frame,
  );
  return { graph, page, frame, rectId };
}

describe('SceneGraph hierarchy', () => {
  it('creates an empty document with one page', () => {
    const g = SceneGraph.createEmpty();
    expect(g.pageIds).toHaveLength(1);
    expect(g.pages[0]?.type).toBe('PAGE');
    expect(g.revision).toBe(0);
  });

  it('inserts, finds and links children', () => {
    const { graph, page, frame, rectId } = setup();
    expect(graph.getChildIds(page)).toEqual([frame]);
    expect(graph.getChildIds(frame)).toEqual([rectId]);
    expect(graph.getParent(rectId)?.id).toBe(frame);
    expect(graph.getAncestors(rectId).map((n) => n.id)).toEqual([frame, page]);
    expect(graph.getPageOf(rectId)?.id).toBe(page);
    expect(graph.getDepth(rectId)).toBe(2);
    expect(graph.isAncestorOf(page, rectId)).toBe(true);
    expect(graph.isAncestorOf(rectId, page)).toBe(false);
  });

  it('rejects invalid hierarchy operations', () => {
    const { graph, page, frame, rectId } = setup();
    expect(() => graph.insertNode(createNodeProps('RECTANGLE'), rectId)).toThrow(
      /cannot have children/,
    );
    expect(() => graph.insertNode(createNodeProps('RECTANGLE'), null)).toThrow(/Only pages/);
    expect(() => graph.insertNode(createNodeProps('PAGE'), page)).toThrow(/nested/);
    expect(() => graph.insertNode(createNodeProps('RECTANGLE', { id: rectId }), page)).toThrow(
      /already exists/,
    );
    expect(() => graph.reparentNode(frame, frame)).toThrow(/own subtree/);
    const group = graph.insertNode(createNodeProps('GROUP'), frame);
    expect(() => graph.reparentNode(frame, group)).toThrow(/own subtree/);
    expect(() => graph.removeNode(page)).toThrow(/at least one page/);
    expect(() => graph.updateNode(rectId, { id: 'x' } as never)).toThrow(/Cannot patch/);
  });

  it('reparents and reorders', () => {
    const { graph, page, frame, rectId } = setup();
    const other = graph.insertNode(createNodeProps('FRAME'), page, 0);
    expect(graph.getChildIds(page)).toEqual([other, frame]);
    graph.reparentNode(rectId, other);
    expect(graph.getChildIds(frame)).toEqual([]);
    expect(graph.getChildIds(other)).toEqual([rectId]);
    graph.reorderNode(other, 1);
    expect(graph.getChildIds(page)).toEqual([frame, other]);
    graph.reorderNode(other, 99);
    expect(graph.getIndexInParent(other)).toBe(1);
  });

  it('removes subtrees and restores them', () => {
    const { graph, page, frame, rectId } = setup();
    const before = graph.revision;
    const subtree = graph.removeNode(frame);
    expect(graph.hasNode(frame)).toBe(false);
    expect(graph.hasNode(rectId)).toBe(false);
    expect(graph.getChildIds(page)).toEqual([]);
    expect(subtree.nodes.map((n) => n.id)).toEqual([frame, rectId]);
    expect(subtree.index).toBe(0);
    graph.insertSubtree(subtree);
    expect(graph.getChildIds(page)).toEqual([frame]);
    expect(graph.getChildIds(frame)).toEqual([rectId]);
    expect(graph.revision).toBeGreaterThan(before);
  });

  it('updates with one-level deep merge and structural sharing', () => {
    const { graph, rectId } = setup();
    const prev = graph.requireNode(rectId);
    const next = graph.updateNode(rectId, { transform: { x: 99 }, name: 'R' });
    expect(next).not.toBe(prev);
    expect(next.transform).toEqual({ x: 99, y: 20, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(next.name).toBe('R');
    expect(next.style).toBe(prev.style);
    const same = graph.updateNode(rectId, { name: 'R' });
    expect(same).toBe(next);
  });

  it('emits coalesced change events in a batch', () => {
    const { graph, page } = setup();
    const events: number[] = [];
    graph.events.on('change', (c) => events.push(c.added.length));
    graph.batch(() => {
      graph.insertNode(createNodeProps('RECTANGLE'), page);
      graph.insertNode(createNodeProps('ELLIPSE'), page);
    });
    expect(events).toEqual([2]);
  });
});

describe('SceneGraph geometry', () => {
  it('computes world matrices and bounds through the hierarchy', () => {
    const { graph, rectId } = setup();
    const wb = graph.getWorldBounds(rectId);
    expect(wb).toEqual({ x: 110, y: 120, width: 50, height: 60 });
  });

  it('includes rotation in world bounds and invalidates caches', () => {
    const { graph, frame, rectId } = setup();
    graph.getWorldBounds(rectId);
    graph.updateNode(frame, { transform: { rotation: 90 } });
    const wb = graph.getWorldBounds(rectId);
    // frame rotated 90° cw around its origin (100,100): local (10,20) -> world (100-20, 100+10)
    expect(wb.x).toBeCloseTo(100 - 20 - 60);
    expect(wb.y).toBeCloseTo(100 + 10);
    expect(wb.width).toBeCloseTo(60);
    expect(wb.height).toBeCloseTo(50);
  });

  it('group bounds are the union of children', () => {
    const { graph, page } = setup();
    const group = graph.insertNode(
      createNodeProps('GROUP', { transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 } }),
      page,
    );
    graph.insertNode(
      createNodeProps('RECTANGLE', {
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      }),
      group,
    );
    graph.insertNode(
      createNodeProps('RECTANGLE', {
        transform: { x: 30, y: 30, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      }),
      group,
    );
    expect(graph.getLocalBounds(group)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(graph.getWorldBounds(group)).toEqual({ x: 10, y: 10, width: 40, height: 40 });
  });
});

describe('serialization', () => {
  it('round-trips through JSON', () => {
    const { graph } = setup();
    const json = graph.toJSON();
    expect(json.schemaVersion).toBe(1);
    const parsed = parseDocumentJSON(JSON.parse(JSON.stringify(json)));
    const copy = SceneGraph.fromJSON(parsed);
    expect(copy.toJSON()).toEqual(json);
    expect(copy.nodeCount).toBe(graph.nodeCount);
  });

  it('applies defaults and rejects invalid documents', () => {
    const doc = parseDocumentJSON({
      schemaVersion: 1,
      id: 'd',
      pages: [
        {
          id: 'p',
          type: 'PAGE',
          children: [{ id: 'r', type: 'RECTANGLE', size: { width: 1, height: 1 } }],
        },
      ],
    });
    expect(doc.name).toBe('Untitled');
    expect(doc.pages[0]?.children?.[0]?.style.opacity).toBe(1);
    expect(() => parseDocumentJSON({ schemaVersion: 1, id: 'd', pages: [] })).toThrow();
    expect(() =>
      parseDocumentJSON({
        schemaVersion: 1,
        id: 'd',
        pages: [{ id: 'p', type: 'PAGE', children: [{ id: 'p', type: 'RECTANGLE' }] }],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      parseDocumentJSON({
        schemaVersion: 1,
        id: 'd',
        pages: [{ id: 'p', type: 'PAGE', bogus: 1 }],
      }),
    ).toThrow();
    expect(() =>
      parseDocumentJSON({ schemaVersion: 1, id: 'd', pages: [{ id: 'r', type: 'RECTANGLE' }] }),
    ).toThrow(/pages/);
  });

  it('refuses unknown schema versions', () => {
    expect(() => migrateDocument({ schemaVersion: 99 })).toThrow(UnsupportedSchemaError);
    expect(() => migrateDocument({ schemaVersion: 'x' })).toThrow(UnsupportedSchemaError);
    expect(migrateDocument({ schemaVersion: 1, id: 'a' })).toEqual({ schemaVersion: 1, id: 'a' });
  });
});

describe('diffDocuments', () => {
  it('reports added, removed, modified and moved nodes by id', async () => {
    const { diffDocuments } = await import('../diff');
    const { graph, page, frame, rectId } = setup();
    const before = graph.toJSON();
    graph.updateNode(rectId, { name: 'Renamed', transform: { x: 50 } });
    const added = graph.insertNode(createNodeProps('ELLIPSE'), page);
    graph.reparentNode(added, frame, 0);
    const after = graph.toJSON();
    const d = diffDocuments(before, after);
    expect(d.added).toBe(1);
    expect(d.modified).toBe(1);
    expect(d.changes.find((c) => c.id === rectId)?.fields.sort()).toEqual(['name', 'transform']);
    expect(d.changes.find((c) => c.id === rectId)?.kind).toBe('modified');
    graph.removeNode(added);
    const d2 = diffDocuments(after, graph.toJSON());
    expect(d2.removed).toBe(1);
    expect(d2.changes).toHaveLength(1); // removal alone does not report siblings as moved
    // Moving the rect within the frame after inserting a sibling first counts as moved.
    const sib = graph.insertNode(createNodeProps('RECTANGLE'), frame, 0);
    const d3 = diffDocuments(
      graph.toJSON(),
      (() => {
        graph.reorderNode(sib, 1);
        return graph.toJSON();
      })(),
    );
    expect(d3.moved).toBeGreaterThanOrEqual(1);
  });
});

describe('type index', () => {
  it('tracks node ids per type through insert, remove, reparent and subtree re-insert', () => {
    const g = SceneGraph.createEmpty();
    const page = g.pageIds[0]!;
    const frame = g.insertNode(createNodeProps('FRAME', { name: 'F' }), page);
    const a = g.insertNode(createNodeProps('RECTANGLE', { name: 'A' }), frame);
    const b = g.insertNode(createNodeProps('RECTANGLE', { name: 'B' }), page);
    expect(new Set(g.getNodeIdsOfType('RECTANGLE'))).toEqual(new Set([a, b]));
    expect(g.getNodeIdsOfType('INSTANCE')).toEqual([]);
    g.reparentNode(b, frame);
    expect(g.getNodeIdsOfType('RECTANGLE')).toHaveLength(2);
    const sub = g.removeNode(frame);
    expect(g.getNodeIdsOfType('RECTANGLE')).toEqual([]);
    expect(g.getNodeIdsOfType('FRAME')).toEqual([]);
    g.insertSubtree(sub);
    expect(new Set(g.getNodeIdsOfType('RECTANGLE'))).toEqual(new Set([a, b]));
  });
});
