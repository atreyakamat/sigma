import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { Editor, NO_MODIFIERS } from '@sigma/engine';
import type { EditorPointerEvent, Modifiers } from '@sigma/engine';
import { registerDefaultTools } from '../index';

function setup() {
  const editor = new Editor({
    settings: { showRulers: false, snapToObjects: false, snapToPixels: false },
  });
  editor.viewport.setSize(1000, 1000);
  const tools = registerDefaultTools(editor);
  const page = editor.currentPageId as NodeId;
  const mk = (x: number, y: number, w = 100, h = 100) =>
    editor.ops.createNode(
      'RECTANGLE',
      { transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 }, size: { width: w, height: h } },
      page,
    );
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
  const drag = (
    from: [number, number],
    to: [number, number],
    mods: Partial<Modifiers> = {},
    steps = 4,
  ) => {
    editor.tools.pointerDown(ev('down', from[0], from[1], mods));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      editor.tools.pointerMove(
        ev('move', from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, mods),
      );
    }
    editor.tools.pointerUp(ev('up', to[0], to[1], mods));
    editor.history.markBoundary();
  };
  const click = (x: number, y: number, mods: Partial<Modifiers> = {}) => {
    editor.tools.pointerDown(ev('down', x, y, mods));
    editor.tools.pointerUp(ev('up', x, y, mods));
  };
  return { editor, tools, page, mk, ev, drag, click };
}

describe('SelectTool', () => {
  it('click selects, shift-click toggles, empty click clears', () => {
    const { editor, mk, click } = setup();
    const a = mk(0, 0);
    const b = mk(200, 0);
    editor.selection.clear();
    click(10, 10);
    expect(editor.selection.ids).toEqual([a]);
    click(210, 10, { shift: true });
    expect(editor.selection.ids).toEqual([a, b]);
    click(210, 10, { shift: true });
    expect(editor.selection.ids).toEqual([a]);
    click(500, 500);
    expect(editor.selection.ids).toEqual([]);
  });

  it('drag moves the selection as one undoable step', () => {
    const { editor, mk, drag } = setup();
    const a = mk(0, 0);
    editor.selection.clear();
    editor.history.clear();
    drag([10, 10], [60, 40]);
    expect(editor.graph.requireNode(a).transform).toMatchObject({ x: 50, y: 30 });
    expect(editor.history.length).toBe(1);
    editor.history.undo();
    expect(editor.graph.requireNode(a).transform).toMatchObject({ x: 0, y: 0 });
  });

  it('marquee selects intersecting nodes', () => {
    const { editor, mk, drag } = setup();
    const a = mk(0, 0);
    const b = mk(200, 0);
    mk(600, 600);
    editor.selection.clear();
    drag([-10, -10], [250, 50]);
    expect([...editor.selection.ids].sort()).toEqual([a, b].sort());
  });

  it('resizes from the south-east handle', () => {
    const { editor, mk, drag } = setup();
    const a = mk(0, 0);
    editor.selection.set([a]);
    drag([100, 100], [150, 120]);
    expect(editor.graph.requireNode(a).size).toEqual({ width: 150, height: 120 });
    expect(editor.graph.requireNode(a).transform).toMatchObject({ x: 0, y: 0 });
    editor.history.undo();
    expect(editor.graph.requireNode(a).size).toEqual({ width: 100, height: 100 });
  });

  it('resizes proportionally with shift and from the north-west handle', () => {
    const { editor, mk, drag } = setup();
    const a = mk(100, 100);
    editor.selection.set([a]);
    drag([100, 100], [120, 150], { shift: true });
    const n = editor.graph.requireNode(a);
    expect(n.size.width).toBeCloseTo(n.size.height);
    expect(n.transform.x + n.size.width).toBeCloseTo(200);
    expect(n.transform.y + n.size.height).toBeCloseTo(200);
  });

  it('rotates from outside a corner', () => {
    const { editor, mk, drag } = setup();
    const a = mk(0, 0);
    editor.selection.set([a]);
    // Start just outside the SE corner, sweep around the center.
    drag([108, 108], [-8, 108]);
    const rot = editor.graph.requireNode(a).transform.rotation;
    expect(Math.abs(rot)).toBeGreaterThan(30);
    const c = editor.graph.getWorldBounds(a);
    expect(c.x + c.width / 2).toBeCloseTo(50, 0);
    expect(c.y + c.height / 2).toBeCloseTo(50, 0);
  });

  it('alt-drag duplicates', () => {
    const { editor, page, mk, drag } = setup();
    const a = mk(0, 0);
    editor.selection.set([a]);
    drag([10, 10], [310, 10], { alt: true });
    expect(editor.graph.getChildIds(page)).toHaveLength(2);
    const dup = editor.selection.first as NodeId;
    expect(dup).not.toBe(a);
    expect(editor.graph.requireNode(dup).transform.x).toBe(300);
    expect(editor.graph.requireNode(a).transform.x).toBe(0);
  });

  it('groups capture clicks until entered', () => {
    const { editor, mk, click } = setup();
    const a = mk(0, 0);
    const b = mk(200, 0);
    editor.selection.set([a, b]);
    const g = editor.ops.groupSelection() as NodeId;
    editor.selection.clear();
    click(10, 10);
    expect(editor.selection.ids).toEqual([g]);
    editor.tools.doubleClick({
      ...{
        type: 'down',
        world: { x: 10, y: 10 },
        screen: { x: 10, y: 10 },
        button: 0,
        buttons: 1,
        modifiers: NO_MODIFIERS,
        pointerType: 'mouse',
        pointerId: 1,
        timestamp: 0,
        detail: 2,
      },
    });
    expect(editor.selection.ids).toEqual([a]);
    click(210, 10);
    expect(editor.selection.ids).toEqual([b]); // group is open, siblings selectable
    click(500, 500);
    click(210, 10);
    expect(editor.selection.ids).toEqual([g]);
  });

  it('hover tracks nodes under the pointer', () => {
    const { editor, mk, ev } = setup();
    const a = mk(0, 0);
    editor.selection.clear();
    editor.tools.pointerMove(ev('move', 10, 10));
    expect(editor.selection.hover).toBe(a);
    editor.tools.pointerMove(ev('move', 500, 500));
    expect(editor.selection.hover).toBeNull();
  });
});

describe('shape tools', () => {
  it('rectangle tool creates a shape from a drag and returns to select', () => {
    const { editor, page, drag } = setup();
    editor.tools.activate('rectangle');
    drag([10, 20], [110, 70]);
    const ids = editor.graph.getChildIds(page);
    expect(ids).toHaveLength(1);
    const n = editor.graph.requireNode(ids[0] as NodeId);
    expect(n.type).toBe('RECTANGLE');
    expect(n.transform).toMatchObject({ x: 10, y: 20 });
    expect(n.size).toEqual({ width: 100, height: 50 });
    expect(editor.tools.activeId).toBe('select');
    expect(editor.selection.ids).toEqual(ids);
  });

  it('shift constrains to a square, click creates default size', () => {
    const { editor, page, drag, click } = setup();
    editor.tools.activate('ellipse');
    drag([0, 0], [100, 30], { shift: true });
    editor.tools.activate('ellipse');
    click(300, 300);
    const [e1, e2] = editor.graph.getChildren(page);
    expect(e1?.size).toEqual({ width: 100, height: 100 });
    expect(e2?.size).toEqual({ width: 100, height: 100 });
    expect(e2?.transform).toMatchObject({ x: 300, y: 300 });
  });

  it('shapes drawn inside a frame become its children', () => {
    const { editor, page, drag } = setup();
    editor.tools.activate('frame');
    drag([0, 0], [400, 400]);
    const frame = editor.graph.getChildIds(page)[0] as NodeId;
    editor.tools.activate('rectangle');
    drag([50, 50], [150, 150]);
    const child = editor.graph.getChildIds(frame)[0] as NodeId;
    expect(child).toBeTruthy();
    expect(editor.graph.requireNode(child).transform).toMatchObject({ x: 50, y: 50 });
    expect(editor.graph.getChildIds(page)).toEqual([frame]);
  });

  it('line tool stores a rotated segment', () => {
    const { editor, page, drag } = setup();
    editor.tools.activate('line');
    drag([0, 0], [100, 100]);
    const n = editor.graph.requireNode(editor.graph.getChildIds(page)[0] as NodeId);
    expect(n.type).toBe('LINE');
    expect(n.size.width).toBeCloseTo(Math.SQRT2 * 100);
    expect(n.transform.rotation).toBeCloseTo(45);
  });

  it('text tool creates a text node and requests editing', () => {
    const { editor, page, click } = setup();
    const requests: NodeId[] = [];
    editor.events.on('textEdit', ({ id }) => requests.push(id));
    editor.tools.activate('text');
    click(20, 20);
    const n = editor.graph.requireNode(editor.graph.getChildIds(page)[0] as NodeId);
    expect(n.type).toBe('TEXT');
    expect(requests).toEqual([n.id]);
    expect(editor.tools.activeId).toBe('select');
  });

  it('image tool places a pending image', () => {
    const { editor, page, tools, click } = setup();
    tools.image.setPending({ src: 'data:image/png;base64,AAAA', width: 2000, height: 1000 });
    editor.tools.activate('image');
    click(0, 0);
    const n = editor.graph.requireNode(editor.graph.getChildIds(page)[0] as NodeId);
    expect(n.type).toBe('IMAGE');
    expect(n.size).toEqual({ width: 1024, height: 512 });
  });

  it('hand tool pans and temporary tool restores', () => {
    const { editor, ev } = setup();
    editor.tools.pushTemporary('hand');
    expect(editor.tools.activeId).toBe('hand');
    editor.tools.pointerDown(ev('down', 0, 0));
    editor.tools.pointerMove(ev('move', 50, 20));
    editor.tools.pointerUp(ev('up', 50, 20));
    expect(editor.viewport.offsetX).toBe(50);
    expect(editor.viewport.offsetY).toBe(20);
    editor.tools.popTemporary();
    expect(editor.tools.activeId).toBe('select');
  });
});
