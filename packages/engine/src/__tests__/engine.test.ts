import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { Editor } from '../editor';
import { comboFromEvent, normalizeCombo, Keymap } from '../keymap';
import { snapRect } from '../snapping';
import {
  applyFrameRectToNodes,
  getSelectionFrame,
  resizeFrameRect,
  rotateNodesAround,
  flipNodes,
  handleCursor,
} from '../transform';
import { NO_MODIFIERS } from '../types';
import { registerDefaultShortcuts } from '../shortcuts';

function editorWithShapes() {
  const editor = new Editor();
  const page = editor.currentPageId as NodeId;
  const a = editor.ops.createNode(
    'RECTANGLE',
    {
      name: 'A',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 100, height: 100 },
    },
    page,
  );
  const b = editor.ops.createNode(
    'ELLIPSE',
    {
      name: 'B',
      transform: { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 100, height: 100 },
    },
    page,
  );
  const c = editor.ops.createNode(
    'RECTANGLE',
    {
      name: 'C',
      transform: { x: 300, y: 300, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 50, height: 50 },
    },
    page,
  );
  editor.selection.clear();
  editor.history.clear();
  return { editor, page, a, b, c };
}

describe('Editor (headless)', () => {
  it('starts with one page and no renderer', () => {
    const editor = new Editor();
    expect(editor.currentPageId).toBeTruthy();
    expect(editor.isMounted).toBe(false);
    expect(editor.graph.pageIds).toHaveLength(1);
  });

  it('hit-tests top-most nodes with precise geometry', () => {
    const { editor, a, b, c } = editorWithShapes();
    expect(editor.hitTester.hitTest({ x: 10, y: 10 })?.id).toBe(a);
    // Inside both rect A and ellipse B's bounds, but outside the ellipse itself → A.
    expect(editor.hitTester.hitTest({ x: 55, y: 55 })?.id).toBe(a);
    // Center of the ellipse: B is on top.
    expect(editor.hitTester.hitTest({ x: 100, y: 100 })?.id).toBe(b);
    expect(editor.hitTester.hitTest({ x: 320, y: 320 })?.id).toBe(c);
    expect(editor.hitTester.hitTest({ x: 1000, y: 1000 })).toBeNull();
    expect(editor.hitTester.hitTest({ x: 102, y: 10 }, { tolerance: 4 })?.id).toBe(a);
  });

  it('skips hidden and locked nodes and updates after changes', () => {
    const { editor, a, b } = editorWithShapes();
    editor.ops.setVisible([b], false);
    expect(editor.hitTester.hitTest({ x: 100, y: 100 })?.id).toBe(a);
    editor.ops.setVisible([b], true);
    editor.ops.setLocked([b], true);
    expect(editor.hitTester.hitTest({ x: 100, y: 100 })?.id).toBe(a);
    editor.ops.setLocked([b], false);
    editor.ops.moveNodes([b], { x: 500, y: 500 });
    expect(editor.hitTester.hitTest({ x: 100, y: 100 })?.id).toBe(a);
    expect(editor.hitTester.hitTest({ x: 600, y: 600 })?.id).toBe(b);
    editor.history.undo();
    expect(editor.hitTester.hitTest({ x: 100, y: 100 })?.id).toBe(b);
  });

  it('finds nodes in a rect and respects containment mode', () => {
    const { editor, a, b, c } = editorWithShapes();
    const r = { x: -10, y: -10, width: 200, height: 200 };
    expect(editor.hitTester.nodesInRect(r, 'contain').map((n) => n.id)).toEqual([a, b]);
    expect(
      editor.hitTester
        .nodesInRect({ x: 0, y: 0, width: 60, height: 60 }, 'intersect')
        .map((n) => n.id),
    ).toEqual([a, b]);
    expect(
      editor.hitTester
        .nodesInRect({ x: 0, y: 0, width: 400, height: 400 }, 'intersect')
        .map((n) => n.id),
    ).toEqual([a, b, c]);
  });

  it('switches pages and rebuilds the hit index', () => {
    const { editor, a } = editorWithShapes();
    const p2 = editor.ops.addPage('Two');
    expect(editor.currentPageId).toBe(p2);
    expect(editor.hitTester.hitTest({ x: 10, y: 10 })).toBeNull();
    editor.setPage(editor.graph.pageIds[0] as NodeId);
    expect(editor.hitTester.hitTest({ x: 10, y: 10 })?.id).toBe(a);
  });

  it('loads and serializes documents', () => {
    const { editor } = editorWithShapes();
    const json = editor.toJSON();
    const other = new Editor({ document: json });
    expect(other.toJSON()).toEqual(json);
    expect(other.graph.nodeCount).toBe(4);
    other.loadDocument(new Editor().toJSON());
    expect(other.graph.nodeCount).toBe(1);
  });
});

describe('operations', () => {
  it('duplicates, groups, ungroups and keeps selection sane', () => {
    const { editor, a, b } = editorWithShapes();
    const dup = editor.ops.duplicateNodes([a]);
    expect(dup).toHaveLength(1);
    expect(editor.selection.ids).toEqual(dup);
    expect(editor.graph.requireNode(dup[0] as NodeId).transform).toMatchObject({ x: 10, y: 10 });
    editor.selection.set([a, b]);
    const g = editor.ops.groupSelection() as NodeId;
    expect(editor.selection.ids).toEqual([g]);
    expect(editor.graph.getChildIds(g)).toEqual([a, b]);
    editor.ops.ungroupSelection();
    expect(editor.graph.hasNode(g)).toBe(false);
    expect(editor.selection.ids).toEqual([a, b]);
    editor.history.undo();
    expect(editor.graph.hasNode(g)).toBe(true);
  });

  it('aligns and distributes', () => {
    const { editor, a, b, c } = editorWithShapes();
    editor.ops.align([a, b, c], 'left');
    expect(editor.graph.getWorldBounds(b).x).toBe(0);
    expect(editor.graph.getWorldBounds(c).x).toBe(0);
    editor.ops.align([a, b, c], 'top');
    expect(editor.graph.getWorldBounds(c).y).toBe(0);
    editor.ops.moveNodes([b], { x: 0, y: 500 });
    editor.ops.moveNodes([c], { x: 0, y: 1000 });
    editor.ops.distribute([a, b, c], 'vertical');
    const ya = editor.graph.getWorldBounds(a);
    const yb = editor.graph.getWorldBounds(b);
    const yc = editor.graph.getWorldBounds(c);
    const gap1 = yb.y - (ya.y + ya.height);
    const gap2 = yc.y - (yb.y + yb.height);
    expect(gap1).toBeCloseTo(gap2);
  });

  it('reorders layers', () => {
    const { editor, page, a, b, c } = editorWithShapes();
    editor.ops.bringToFront([a]);
    expect(editor.graph.getChildIds(page)).toEqual([b, c, a]);
    editor.ops.sendBackward([a]);
    expect(editor.graph.getChildIds(page)).toEqual([b, a, c]);
    editor.ops.sendToBack([c]);
    expect(editor.graph.getChildIds(page)).toEqual([c, b, a]);
    editor.ops.bringForward([c]);
    expect(editor.graph.getChildIds(page)).toEqual([b, c, a]);
  });

  it('frames the selection', () => {
    const { editor, a, b } = editorWithShapes();
    editor.selection.set([a, b]);
    const f = editor.ops.frameSelection() as NodeId;
    const frame = editor.graph.requireNode(f);
    expect(frame.type).toBe('FRAME');
    expect(frame.size).toEqual({ width: 150, height: 150 });
    expect(editor.graph.getChildIds(f)).toEqual([a, b]);
    expect(editor.graph.getWorldBounds(b)).toEqual({ x: 50, y: 50, width: 100, height: 100 });
    editor.history.undo();
    expect(editor.graph.hasNode(f)).toBe(false);
    expect(editor.graph.getWorldBounds(b)).toEqual({ x: 50, y: 50, width: 100, height: 100 });
  });

  it('sets text and measures auto-size', () => {
    const { editor, page } = editorWithShapes();
    const t = editor.ops.createNode('TEXT', { characters: 'Hi' }, page);
    editor.ops.setText(t, 'Hello world');
    const node = editor.graph.requireNode(t);
    expect(node.type === 'TEXT' && node.characters).toBe('Hello world');
    expect(node.size.width).toBeGreaterThan(10);
    expect(node.size.height).toBe(Math.ceil(16 * 1.2));
  });

  it('clipboard copy/paste creates offset copies', () => {
    const { editor, a } = editorWithShapes();
    editor.selection.set([a]);
    expect(editor.clipboard.copy()).toBe(true);
    const pasted = editor.clipboard.paste();
    expect(pasted).toHaveLength(1);
    expect(editor.graph.requireNode(pasted[0] as NodeId).transform).toMatchObject({ x: 10, y: 10 });
    expect(editor.clipboard.load(editor.clipboard.serialize())).toBe(true);
    expect(editor.clipboard.load('nope')).toBe(false);
  });
});

describe('transform math', () => {
  it('resizes from the east handle keeping the west edge fixed', () => {
    const frame = { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, width: 100, height: 50 };
    expect(resizeFrameRect(frame, 'e', { x: 150, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 50,
    });
    expect(resizeFrameRect(frame, 'nw', { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 90,
      height: 40,
    });
    const prop = resizeFrameRect(frame, 'se', { x: 200, y: 10 }, { proportional: true });
    expect(prop.width / prop.height).toBeCloseTo(2);
    const center = resizeFrameRect(frame, 'e', { x: 150, y: 0 }, { fromCenter: true });
    expect(center).toEqual({ x: -50, y: 0, width: 200, height: 50 });
    const crossed = resizeFrameRect(frame, 'e', { x: -20, y: 0 });
    expect(crossed.width).toBe(-20);
  });

  it('applies a frame rect to a single node and to multiple nodes', () => {
    const { editor, a, b } = editorWithShapes();
    const frame = getSelectionFrame(editor.graph, [a])!;
    const res = applyFrameRectToNodes(editor.graph, [a], frame, {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    expect(res[0]?.size).toEqual({ width: 200, height: 100 });
    expect(res[0]?.transform).toMatchObject({ x: 0, y: 0 });

    const multi = getSelectionFrame(editor.graph, [a, b])!;
    expect(multi.width).toBe(150);
    const res2 = applyFrameRectToNodes(editor.graph, [a, b], multi, {
      x: 0,
      y: 0,
      width: 300,
      height: 300,
    });
    const rb = res2.find((r) => r.id === b)!;
    expect(rb.transform).toMatchObject({ x: 100, y: 100 });
    expect(rb.size).toEqual({ width: 200, height: 200 });
  });

  it('rotates around a pivot keeping the pivot fixed, and flips', () => {
    const { editor, a } = editorWithShapes();
    const res = rotateNodesAround(editor.graph, [a], { x: 50, y: 50 }, 90);
    editor.ops.applyTransforms(res, 'Rotate');
    const wb = editor.graph.getWorldBounds(a);
    expect(wb.x).toBeCloseTo(0);
    expect(wb.y).toBeCloseTo(0);
    expect(editor.graph.requireNode(a).transform.rotation).toBeCloseTo(90);
    const flipped = flipNodes(editor.graph, [a], 'horizontal');
    editor.ops.applyTransforms(flipped, 'Flip');
    const wb2 = editor.graph.getWorldBounds(a);
    expect(wb2.x).toBeCloseTo(0);
    expect(wb2.width).toBeCloseTo(100);
  });

  it('maps handle cursors through rotation', () => {
    expect(handleCursor('e', 0)).toBe('ew-resize');
    expect(handleCursor('e', 90)).toBe('ns-resize');
    expect(handleCursor('se', 45)).toBe('ns-resize');
  });
});

describe('snapping', () => {
  it('snaps edges and centers within threshold and reports guides', () => {
    const moving = { x: 103, y: 0, width: 50, height: 50 };
    const r = snapRect(moving, [{ rect: { x: 0, y: 100, width: 100, height: 100 } }], {
      threshold: 5,
    });
    expect(r.delta.x).toBe(-3); // left edge 103 → 100
    expect(r.guides.some((g) => g.axis === 'x' && g.position === 100)).toBe(true);
    const far = snapRect(
      { x: 150, y: 0, width: 50, height: 50 },
      [{ rect: { x: 0, y: 0, width: 100, height: 100 } }],
      { threshold: 5 },
    );
    expect(far.delta).toEqual({ x: 0, y: 0 });
    const grid = snapRect({ x: 13, y: 7, width: 10, height: 10 }, [], {
      threshold: 5,
      gridSize: 8,
    });
    expect(grid.delta).toEqual({ x: 3, y: 1 });
  });
});

describe('keymap', () => {
  it('normalizes combos and dispatches with precedence', () => {
    expect(normalizeCombo('Cmd+Shift+Z')).toBe('mod+shift+z');
    expect(normalizeCombo('ctrl+a')).toBe('mod+a');
    expect(comboFromEvent('ArrowUp', { ...NO_MODIFIERS, shift: true })).toBe('shift+up');
    const k = new Keymap();
    const calls: string[] = [];
    k.register('mod+z', () => void calls.push('first'));
    const off = k.register('mod+z', () => void calls.push('second'));
    const ev = {
      key: 'z',
      code: 'KeyZ',
      modifiers: { ...NO_MODIFIERS, mod: true },
      repeat: false,
      preventDefault() {},
    };
    expect(k.handle(ev)).toBe(true);
    off();
    k.handle(ev);
    expect(calls).toEqual(['second', 'first']);
    expect(k.handle({ ...ev, key: 'q' })).toBe(false);
  });

  it('default shortcuts drive the editor', () => {
    const { editor, a, b } = editorWithShapes();
    registerDefaultShortcuts(editor);
    const press = (key: string, mods: Partial<typeof NO_MODIFIERS> = {}) =>
      editor.keymap.handle({
        key,
        code: key,
        modifiers: { ...NO_MODIFIERS, ...mods },
        repeat: false,
        preventDefault() {},
      });
    press('a', { mod: true });
    expect(editor.selection.size).toBe(3);
    press('Escape');
    expect(editor.selection.size).toBe(0);
    editor.selection.set([a]);
    press('ArrowRight', { shift: true });
    expect(editor.graph.requireNode(a).transform.x).toBe(10);
    press('z', { mod: true });
    expect(editor.graph.requireNode(a).transform.x).toBe(0);
    press('z', { mod: true, shift: true });
    expect(editor.graph.requireNode(a).transform.x).toBe(10);
    editor.selection.set([a, b]);
    press('g', { mod: true });
    expect(editor.graph.getNode(editor.selection.first as NodeId)?.type).toBe('GROUP');
    press('Delete');
    expect(editor.graph.hasNode(a)).toBe(false);
  });
});
