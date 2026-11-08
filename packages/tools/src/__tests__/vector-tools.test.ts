import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { Editor, NO_MODIFIERS } from '@sigma/engine';
import type { EditorPointerEvent, Modifiers } from '@sigma/engine';
import type { SceneNode } from '@sigma/document';
import { registerDefaultTools } from '../index';

function setup() {
  const editor = new Editor({
    settings: { showRulers: false, snapToObjects: false, snapToPixels: false },
  });
  editor.viewport.setSize(1000, 1000);
  const tools = registerDefaultTools(editor);
  const page = editor.currentPageId as NodeId;
  const ev = (
    type: EditorPointerEvent['type'],
    x: number,
    y: number,
    mods: Partial<Modifiers> = {},
    detail = 1,
  ): EditorPointerEvent => ({
    type,
    world: { x, y },
    screen: editor.viewport.worldToScreen({ x, y }),
    button: 0,
    buttons: type === 'up' ? 0 : 1,
    modifiers: { ...NO_MODIFIERS, ...mods },
    pointerType: 'mouse',
    pointerId: 1,
    timestamp: 0,
    detail,
  });
  const click = (x: number, y: number, mods: Partial<Modifiers> = {}) => {
    editor.tools.pointerDown(ev('down', x, y, mods));
    editor.tools.pointerUp(ev('up', x, y, mods));
  };
  const drag = (from: [number, number], to: [number, number], steps = 4) => {
    editor.tools.pointerDown(ev('down', from[0], from[1]));
    for (let i = 1; i <= steps; i++)
      editor.tools.pointerMove(
        ev(
          'move',
          from[0] + ((to[0] - from[0]) * i) / steps,
          from[1] + ((to[1] - from[1]) * i) / steps,
        ),
      );
    editor.tools.pointerUp(ev('up', to[0], to[1]));
    editor.history.markBoundary();
  };
  const key = (k: string) =>
    editor.tools.keyDown({
      key: k,
      code: k,
      modifiers: NO_MODIFIERS,
      repeat: false,
      preventDefault() {},
    });
  const vectors = () =>
    editor.graph
      .getChildren(page)
      .filter((n): n is Extract<SceneNode, { type: 'VECTOR' }> => n.type === 'VECTOR');
  return { editor, tools, page, ev, click, drag, key, vectors };
}

describe('PenTool', () => {
  it('builds a path from clicks, closes on the first anchor and commits one undo step', () => {
    const { editor, click, vectors } = setup();
    editor.tools.activate('pen');
    click(100, 100);
    click(200, 100);
    click(200, 200);
    click(100, 100); // close
    const [v] = vectors();
    expect(v).toBeTruthy();
    expect(v!.path.map((c) => c.type)).toEqual(['M', 'L', 'L', 'Z']);
    expect(v!.transform).toMatchObject({ x: 100, y: 100 });
    expect(v!.size).toEqual({ width: 100, height: 100 });
    expect(v!.style.fills.length).toBeGreaterThan(0); // closed paths get a fill
    expect(editor.tools.activeId).toBe('select');
    expect(editor.history.length).toBe(1);
    editor.history.undo();
    expect(vectors()).toHaveLength(0);
  });
  it('drag creates curved segments; Enter finishes an open path with a stroke only', () => {
    const { editor, click, drag, key, vectors } = setup();
    editor.tools.activate('pen');
    click(0, 0);
    drag([100, 0], [130, 30]); // anchor with handle
    click(200, 0);
    key('Enter');
    const [v] = vectors();
    expect(v!.path.some((c) => c.type === 'C')).toBe(true);
    expect(v!.path.some((c) => c.type === 'Z')).toBe(false);
    expect(v!.style.fills).toHaveLength(0);
    expect(v!.style.strokes).toHaveLength(1);
  });
  it('Escape discards an unfinished path', () => {
    const { editor, click, key, vectors } = setup();
    editor.tools.activate('pen');
    click(0, 0);
    click(10, 10);
    key('Escape');
    expect(vectors()).toHaveLength(0);
    expect(editor.history.length).toBe(0);
  });
});

describe('PencilTool', () => {
  it('turns a freehand drag into a smoothed vector in one undo step', () => {
    const { editor, drag, vectors } = setup();
    editor.tools.activate('pencil');
    drag([0, 0], [100, 50], 30);
    const [v] = vectors();
    expect(v).toBeTruthy();
    expect(v!.path[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(v!.path.length).toBeLessThan(31);
    expect(v!.size.width).toBeCloseTo(100, 0);
    expect(editor.history.length).toBe(1);
  });
});

describe('VectorEditTool', () => {
  it('enters on Enter for a selected vector, drags anchors and exits on Escape', () => {
    const { editor, page, drag, key } = setup();
    const id = editor.ops.createNode(
      'VECTOR',
      {
        transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 100, height: 100 },
        path: [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: 100, y: 0 },
          { type: 'L', x: 100, y: 100 },
          { type: 'Z' },
        ],
      },
      page,
    );
    editor.selection.set([id]);
    editor.ops.editVector(id);
    expect(editor.tools.activeId).toBe('vector-edit');
    // Drag the second anchor (world 200,100) to (250,100).
    drag([200, 100], [250, 100]);
    const node = editor.graph.requireNode(id) as Extract<SceneNode, { type: 'VECTOR' }>;
    expect(node.path[1]).toMatchObject({ type: 'L', x: 150, y: 0 });
    expect(node.size.width).toBe(150);
    expect(editor.history.length).toBe(2); // create + one merged edit
    key('Escape');
    expect(editor.tools.activeId).toBe('select');
    editor.history.undo();
    expect(
      (editor.graph.requireNode(id) as Extract<SceneNode, { type: 'VECTOR' }>).size.width,
    ).toBe(100);
  });
  it('double-clicking a segment inserts an anchor and Delete removes a selected anchor', () => {
    const { editor, page, click, key } = setup();
    const id = editor.ops.createNode(
      'VECTOR',
      {
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 100, height: 100 },
        path: [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: 100, y: 0 },
          { type: 'L', x: 100, y: 100 },
          { type: 'Z' },
        ],
      },
      page,
    );
    editor.ops.editVector(id);
    editor.tools.doubleClick({
      type: 'down',
      world: { x: 50, y: 0 },
      screen: { x: 50, y: 0 },
      button: 0,
      buttons: 1,
      modifiers: NO_MODIFIERS,
      pointerType: 'mouse',
      pointerId: 1,
      timestamp: 0,
      detail: 2,
    });
    let node = editor.graph.requireNode(id) as Extract<SceneNode, { type: 'VECTOR' }>;
    expect(node.path.map((c) => c.type)).toEqual(['M', 'L', 'L', 'L', 'Z']);
    click(50, 0); // select the inserted anchor
    key('Delete');
    node = editor.graph.requireNode(id) as Extract<SceneNode, { type: 'VECTOR' }>;
    expect(node.path.map((c) => c.type)).toEqual(['M', 'L', 'L', 'Z']);
  });
});

describe('boolean operations', () => {
  it('unions two shapes into one vector and is undoable', () => {
    const { editor, page } = setup();
    const a = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      },
      page,
    );
    const b = editor.ops.createNode(
      'ELLIPSE',
      {
        transform: { x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      },
      page,
    );
    editor.selection.set([a, b]);
    const id = editor.ops.booleanSelection('union');
    expect(id).toBeTruthy();
    expect(editor.graph.hasNode(a)).toBe(false);
    const v = editor.graph.requireNode(id as NodeId) as Extract<SceneNode, { type: 'VECTOR' }>;
    expect(v.type).toBe('VECTOR');
    expect(v.transform).toMatchObject({ x: 0, y: 0 });
    expect(v.size.width).toBeCloseTo(15, 0);
    expect(v.style.fills[0]).toEqual(editor.graph.requireNode(id as NodeId).style.fills[0]);
    expect(editor.selection.ids).toEqual([id]);
    editor.history.undo();
    expect(editor.graph.hasNode(a)).toBe(true);
    expect(editor.graph.hasNode(b)).toBe(true);
    expect(editor.graph.hasNode(id as NodeId)).toBe(false);
  });
  it('subtract keeps the bottom-most shape as the base', () => {
    const { editor, page } = setup();
    const base = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 30, height: 30 },
      },
      page,
    );
    const hole = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      },
      page,
    );
    editor.selection.set([hole, base]);
    const id = editor.ops.booleanSelection('subtract') as NodeId;
    const v = editor.graph.requireNode(id) as Extract<SceneNode, { type: 'VECTOR' }>;
    expect(v.path.filter((c) => c.type === 'Z')).toHaveLength(2);
    expect(v.size).toEqual({ width: 30, height: 30 });
  });
});
