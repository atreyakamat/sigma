import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { Editor } from '../editor';

function setup() {
  const editor = new Editor();
  const page = editor.currentPageId as NodeId;
  const frame = editor.ops.createNode(
    'FRAME',
    {
      name: 'Row',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 300, height: 100 },
    },
    page,
  );
  const a = editor.ops.createNode(
    'RECTANGLE',
    { name: 'a', size: { width: 50, height: 20 } },
    frame,
  );
  const b = editor.ops.createNode(
    'RECTANGLE',
    { name: 'b', size: { width: 70, height: 40 } },
    frame,
  );
  const c = editor.ops.createNode(
    'RECTANGLE',
    { name: 'c', size: { width: 30, height: 30 } },
    frame,
  );
  editor.history.clear();
  return { editor, page, frame, a, b, c };
}
const pos = (editor: Editor, id: NodeId) => {
  const n = editor.graph.requireNode(id);
  return { x: n.transform.x, y: n.transform.y, w: n.size.width, h: n.size.height };
};

describe('auto layout', () => {
  it('horizontal layout with padding and gap positions children and hugs the frame', () => {
    const { editor, frame, a, b, c } = setup();
    editor.ops.setLayout(frame, {
      mode: 'HORIZONTAL',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
      gap: 8,
      primarySizing: 'HUG',
      counterSizing: 'HUG',
    });
    expect(pos(editor, a)).toMatchObject({ x: 10, y: 10 });
    expect(pos(editor, b)).toMatchObject({ x: 68, y: 10 });
    expect(pos(editor, c)).toMatchObject({ x: 146, y: 10 });
    expect(pos(editor, frame)).toMatchObject({ w: 186, h: 60 });
    expect(editor.history.length).toBe(1);
    editor.history.undo();
    expect(pos(editor, frame)).toMatchObject({ w: 300, h: 100 });
    expect(pos(editor, b)).toMatchObject({ x: 0, y: 0 });
  });

  it('counter-axis alignment and fixed sizing with justify', () => {
    const { editor, frame, a, b, c } = setup();
    editor.ops.setLayout(frame, {
      mode: 'HORIZONTAL',
      gap: 0,
      alignItems: 'CENTER',
      justifyContent: 'SPACE_BETWEEN',
      primarySizing: 'FIXED',
      counterSizing: 'FIXED',
    });
    expect(pos(editor, frame)).toMatchObject({ w: 300, h: 100 });
    expect(pos(editor, a)).toMatchObject({ x: 0, y: 40 });
    expect(pos(editor, b)).toMatchObject({ x: 125, y: 30 });
    expect(pos(editor, c)).toMatchObject({ x: 270, y: 35 });
    editor.ops.setLayout(frame, { alignItems: 'END', justifyContent: 'END' });
    expect(pos(editor, c)).toMatchObject({ x: 270, y: 70 });
    expect(pos(editor, a)).toMatchObject({ x: 150, y: 80 });
  });

  it('vertical layout re-flows when children change, are added, removed or reordered', () => {
    const { editor, frame, a, b, c } = setup();
    editor.ops.setLayout(frame, {
      mode: 'VERTICAL',
      gap: 10,
      primarySizing: 'HUG',
      counterSizing: 'HUG',
    });
    expect(pos(editor, b)).toMatchObject({ x: 0, y: 30 });
    editor.ops.setSize(a, { height: 50 });
    expect(pos(editor, b)).toMatchObject({ y: 60 });
    expect(pos(editor, frame)).toMatchObject({ w: 70, h: 140 });
    editor.ops.deleteNodes([b]);
    expect(pos(editor, c)).toMatchObject({ y: 60 });
    const d = editor.ops.createNode('RECTANGLE', { size: { width: 10, height: 10 } }, frame);
    expect(pos(editor, d)).toMatchObject({ y: 100 });
    editor.ops.bringToFront([a]);
    expect(pos(editor, a)).toMatchObject({ y: 60 });
  });

  it('fill-container children stretch along the primary axis', () => {
    const { editor, frame, b, c } = setup();
    editor.ops.setLayout(frame, {
      mode: 'HORIZONTAL',
      gap: 10,
      primarySizing: 'FIXED',
      counterSizing: 'FIXED',
    });
    editor.ops.setChildLayout(b, { primary: 'FILL', counter: 'FILL' });
    // 300 - 50 - 30 - 2 gaps = 200 for b
    expect(pos(editor, b)).toMatchObject({ x: 60, w: 200, h: 100 });
    expect(pos(editor, c)).toMatchObject({ x: 270 });
  });

  it('nested layouts resolve inner before outer', () => {
    const { editor, page, frame } = setup();
    const outer = editor.ops.createNode(
      'FRAME',
      { name: 'Outer', size: { width: 10, height: 10 } },
      page,
    );
    editor.ops.reparent(frame, outer);
    editor.ops.setLayout(frame, {
      mode: 'HORIZONTAL',
      gap: 0,
      primarySizing: 'HUG',
      counterSizing: 'HUG',
    });
    editor.ops.setLayout(outer, {
      mode: 'VERTICAL',
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
      gap: 0,
      primarySizing: 'HUG',
      counterSizing: 'HUG',
    });
    expect(pos(editor, frame)).toMatchObject({ x: 5, y: 5, w: 150, h: 40 });
    expect(pos(editor, outer)).toMatchObject({ w: 160, h: 50 });
  });

  it('dragging a child inside an auto-layout frame reorders instead of moving freely', () => {
    const { editor, frame, a, c } = setup();
    editor.ops.setLayout(frame, {
      mode: 'HORIZONTAL',
      gap: 0,
      primarySizing: 'HUG',
      counterSizing: 'HUG',
    });
    editor.ops.moveNodes([a], { x: 140, y: 0 }); // past b and c
    expect(editor.graph.getChildIds(frame)).toEqual(expect.arrayContaining([a, c]));
    expect(editor.graph.getChildIds(frame)[2]).toBe(a);
    expect(pos(editor, a)).toMatchObject({ x: 100 });
  });
});

describe('constraints', () => {
  it('reposition children when the parent frame is resized', () => {
    const editor = new Editor();
    const page = editor.currentPageId as NodeId;
    const frame = editor.ops.createNode('FRAME', { size: { width: 200, height: 100 } }, page);
    const right = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 150, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 40, height: 20 },
        constraints: { horizontal: 'RIGHT', vertical: 'TOP' },
      },
      frame,
    );
    const stretch = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 20, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 160, height: 20 },
        constraints: { horizontal: 'STRETCH', vertical: 'BOTTOM' },
      },
      frame,
    );
    const center = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 90, y: 40, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 20, height: 20 },
        constraints: { horizontal: 'CENTER', vertical: 'CENTER' },
      },
      frame,
    );
    const scale = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 100, height: 50 },
        constraints: { horizontal: 'SCALE', vertical: 'SCALE' },
      },
      frame,
    );
    editor.ops.resizeFrame(frame, { width: 400, height: 200 });
    expect(pos(editor, right)).toMatchObject({ x: 350, y: 10 });
    expect(pos(editor, stretch)).toMatchObject({ x: 20, w: 360, y: 150 });
    expect(pos(editor, center)).toMatchObject({ x: 190, y: 90 });
    expect(pos(editor, scale)).toMatchObject({ w: 200, h: 100 });
    editor.history.undo();
    expect(pos(editor, right)).toMatchObject({ x: 150 });
    expect(pos(editor, stretch)).toMatchObject({ w: 160 });
  });
});
