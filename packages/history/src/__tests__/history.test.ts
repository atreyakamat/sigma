import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { SceneGraph, createNodeProps } from '@sigma/document';
import {
  BatchCommand,
  CreateNodeCommand,
  DeleteNodeCommand,
  GroupNodesCommand,
  History,
  MoveNodesCommand,
  ReorderNodeCommand,
  ReparentNodeCommand,
  ResizeNodeCommand,
  RotateNodeCommand,
  UngroupNodesCommand,
  UpdateNodesCommand,
  UpdateStyleCommand,
} from '../index';

function setup() {
  const graph = SceneGraph.createEmpty();
  const page = graph.pageIds[0] as NodeId;
  let t = 0;
  const history = new History(graph, { now: () => t, mergeWindowMs: 100 });
  const tick = (ms: number) => (t += ms);
  const rect = (x: number, y: number, parent: NodeId = page) =>
    graph.insertNode(
      createNodeProps('RECTANGLE', {
        transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      }),
      parent,
    );
  return { graph, page, history, tick, rect };
}

describe('commands execute and undo', () => {
  it('CreateNodeCommand', () => {
    const { graph, page, history } = setup();
    const props = createNodeProps('RECTANGLE');
    const cmd = new CreateNodeCommand(props, page);
    expect(history.execute(cmd)).toBe(true);
    expect(graph.hasNode(cmd.nodeId)).toBe(true);
    history.undo();
    expect(graph.hasNode(cmd.nodeId)).toBe(false);
    history.redo();
    expect(graph.hasNode(cmd.nodeId)).toBe(true);
    expect(history.execute(new CreateNodeCommand(props, page))).toBe(false); // duplicate id invalid
  });

  it('DeleteNodeCommand restores position and subtree', () => {
    const { graph, page, history, rect } = setup();
    const a = rect(0, 0);
    const frame = graph.insertNode(createNodeProps('FRAME'), page);
    const inner = rect(0, 0, frame);
    const c = rect(0, 0);
    expect(history.execute(new DeleteNodeCommand(frame))).toBe(true);
    expect(graph.getChildIds(page)).toEqual([a, c]);
    history.undo();
    expect(graph.getChildIds(page)).toEqual([a, frame, c]);
    expect(graph.getChildIds(frame)).toEqual([inner]);
    expect(history.execute(new DeleteNodeCommand(page))).toBe(false);
  });

  it('Move/Resize/Rotate/UpdateStyle', () => {
    const { graph, history, rect } = setup();
    const a = rect(5, 5);
    history.execute(new MoveNodesCommand(graph, [a], { x: 10, y: -5 }));
    expect(graph.requireNode(a).transform).toMatchObject({ x: 15, y: 0 });
    history.execute(new ResizeNodeCommand(a, { x: 1 }, { width: 100 }));
    expect(graph.requireNode(a).size.width).toBe(100);
    expect(graph.requireNode(a).transform.x).toBe(1);
    history.execute(new RotateNodeCommand(a, { rotation: 45 }));
    expect(graph.requireNode(a).transform.rotation).toBe(45);
    history.execute(new UpdateStyleCommand([a], { opacity: 0.5 }));
    expect(graph.requireNode(a).style.opacity).toBe(0.5);
    history.undo();
    expect(graph.requireNode(a).style.opacity).toBe(1);
    history.undo();
    expect(graph.requireNode(a).transform.rotation).toBe(0);
    history.undo();
    expect(graph.requireNode(a).size.width).toBe(10);
    history.undo();
    expect(graph.requireNode(a).transform).toMatchObject({ x: 5, y: 5 });
    expect(history.canUndo).toBe(false);
  });

  it('Reparent and Reorder', () => {
    const { graph, page, history, rect } = setup();
    const a = rect(0, 0);
    const b = rect(0, 0);
    const frame = graph.insertNode(createNodeProps('FRAME'), page);
    history.execute(new ReparentNodeCommand(a, frame));
    expect(graph.getChildIds(frame)).toEqual([a]);
    history.undo();
    expect(graph.getChildIds(page)).toEqual([a, b, frame]);
    history.execute(new ReorderNodeCommand(a, 2));
    expect(graph.getChildIds(page)).toEqual([b, frame, a]);
    history.undo();
    expect(graph.getChildIds(page)).toEqual([a, b, frame]);
    expect(history.execute(new ReparentNodeCommand(frame, frame))).toBe(false);
  });

  it('Group preserves world positions and ungroup reverses', () => {
    const { graph, page, history, rect } = setup();
    const frame = graph.insertNode(
      createNodeProps('FRAME', {
        transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 500, height: 500 },
      }),
      page,
    );
    const a = rect(10, 10, frame);
    const b = rect(50, 70, frame);
    const group = new GroupNodesCommand([a, b]);
    history.execute(group);
    const g = graph.requireNode(group.groupId);
    expect(g.parentId).toBe(frame);
    expect(graph.getChildIds(frame)).toEqual([group.groupId]);
    expect(graph.getChildIds(group.groupId)).toEqual([a, b]);
    expect(g.transform).toMatchObject({ x: 10, y: 10 });
    expect(g.size).toEqual({ width: 50, height: 70 });
    expect(graph.getWorldBounds(a)).toEqual({ x: 110, y: 110, width: 10, height: 10 });
    expect(graph.getWorldBounds(b)).toEqual({ x: 150, y: 170, width: 10, height: 10 });

    history.execute(new UngroupNodesCommand(group.groupId));
    expect(graph.hasNode(group.groupId)).toBe(false);
    expect(graph.getChildIds(frame)).toEqual([a, b]);
    expect(graph.requireNode(a).transform).toMatchObject({ x: 10, y: 10 });
    expect(graph.getWorldBounds(b)).toEqual({ x: 150, y: 170, width: 10, height: 10 });

    history.undo(); // regroup
    expect(graph.getChildIds(group.groupId)).toEqual([a, b]);
    expect(graph.getWorldBounds(b)).toEqual({ x: 150, y: 170, width: 10, height: 10 });
    history.undo(); // ungroup (undo of group)
    expect(graph.hasNode(group.groupId)).toBe(false);
    expect(graph.getChildIds(frame)).toEqual([a, b]);
    expect(graph.requireNode(b).transform).toMatchObject({ x: 50, y: 70 });
  });

  it('Group of a rotated node keeps its world bounds', () => {
    const { graph, history, rect } = setup();
    const a = rect(100, 100);
    graph.updateNode(a, { transform: { rotation: 30 } });
    const before = graph.getWorldBounds(a);
    const group = new GroupNodesCommand([a]);
    history.execute(group);
    const after = graph.getWorldBounds(a);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(graph.requireNode(a).transform.rotation).toBeCloseTo(30);
  });

  it('BatchCommand undoes in reverse', () => {
    const { graph, page, history } = setup();
    const c1 = new CreateNodeCommand(createNodeProps('RECTANGLE'), page);
    const c2 = new CreateNodeCommand(createNodeProps('ELLIPSE'), page);
    history.execute(new BatchCommand('Create two', [c1, c2]));
    expect(graph.getChildIds(page)).toEqual([c1.nodeId, c2.nodeId]);
    history.undo();
    expect(graph.getChildIds(page)).toEqual([]);
    expect(history.canRedo).toBe(true);
  });
});

describe('History', () => {
  it('merges continuous moves inside the window', () => {
    const { graph, history, rect, tick } = setup();
    const a = rect(0, 0);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    tick(10);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    tick(10);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    expect(history.length).toBe(1);
    expect(graph.requireNode(a).transform.x).toBe(3);
    history.undo();
    expect(graph.requireNode(a).transform.x).toBe(0);
    history.redo();
    expect(graph.requireNode(a).transform.x).toBe(3);
  });

  it('does not merge across the window or a boundary', () => {
    const { graph, history, rect, tick } = setup();
    const a = rect(0, 0);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    tick(500);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    expect(history.length).toBe(2);
    history.markBoundary();
    tick(1);
    history.execute(new MoveNodesCommand(graph, [a], { x: 1, y: 0 }));
    expect(history.length).toBe(3);
    history.execute(new UpdateStyleCommand([a], { opacity: 0.1 }, 'o', 'opacity'));
    history.execute(new UpdateStyleCommand([a], { opacity: 0.2 }, 'o', 'opacity'));
    expect(history.length).toBe(4);
    history.undo();
    expect(graph.requireNode(a).style.opacity).toBe(1);
  });

  it('transactions group commands and abort reverts', () => {
    const { graph, page, history } = setup();
    history.transact('Create many', () => {
      history.execute(new CreateNodeCommand(createNodeProps('RECTANGLE'), page));
      history.execute(new CreateNodeCommand(createNodeProps('RECTANGLE'), page));
    });
    expect(history.length).toBe(1);
    expect(history.undoName).toBe('Create many');
    history.undo();
    expect(graph.getChildIds(page)).toEqual([]);
    history.redo();
    expect(graph.getChildIds(page)).toHaveLength(2);

    history.beginTransaction('Oops');
    history.execute(new CreateNodeCommand(createNodeProps('RECTANGLE'), page));
    history.abort();
    expect(graph.getChildIds(page)).toHaveLength(2);
    expect(history.length).toBe(1);
    expect(() => history.commit()).toThrow();
  });

  it('respects the limit and clears redo on new commands', () => {
    const { graph, page, rect } = setup();
    const h = new History(graph, { limit: 2 });
    void page;
    const a = rect(0, 0);
    h.execute(UpdateNodesCommand.single(a, { name: '1' }));
    h.execute(UpdateNodesCommand.single(a, { name: '2' }));
    h.execute(UpdateNodesCommand.single(a, { name: '3' }));
    expect(h.length).toBe(2);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.execute(new CreateNodeCommand(createNodeProps('RECTANGLE'), page));
    expect(h.canRedo).toBe(false);
  });

  it('emits change events', () => {
    const { history, rect } = setup();
    const a = rect(0, 0);
    const seen: boolean[] = [];
    history.events.on('change', (e) => seen.push(e.canUndo));
    history.execute(UpdateNodesCommand.single(a, { name: 'x' }));
    history.undo();
    expect(seen).toEqual([true, false]);
  });
});
