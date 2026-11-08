import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { Editor } from '../editor';
import { PrototypeRuntime } from '../prototype';

function setup() {
  const editor = new Editor();
  const page = editor.currentPageId as NodeId;
  const home = editor.ops.createNode(
    'FRAME',
    { name: 'Home', size: { width: 200, height: 400 } },
    page,
  );
  const button = editor.ops.createNode(
    'RECTANGLE',
    {
      name: 'Go',
      transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 50, height: 20 },
    },
    home,
  );
  const details = editor.ops.createNode(
    'FRAME',
    {
      name: 'Details',
      transform: { x: 300, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 200, height: 400 },
    },
    page,
  );
  const back = editor.ops.createNode(
    'RECTANGLE',
    { name: 'Back', size: { width: 50, height: 20 } },
    details,
  );
  const modal = editor.ops.createNode(
    'FRAME',
    {
      name: 'Modal',
      transform: { x: 600, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 100, height: 100 },
    },
    page,
  );
  editor.history.clear();
  return { editor, page, home, button, details, back, modal };
}

describe('prototype interactions', () => {
  it('adds, lists and removes interactions as undoable edits', () => {
    const { editor, button, details } = setup();
    editor.ops.addInteraction(button, {
      trigger: 'CLICK',
      action: {
        type: 'NAVIGATE',
        targetId: details,
        transition: { type: 'SLIDE_LEFT', durationMs: 300, easing: 'EASE_OUT' },
      },
    });
    const node = editor.graph.requireNode(button);
    expect(node.interactions).toHaveLength(1);
    expect(node.interactions[0]).toMatchObject({
      trigger: 'CLICK',
      action: { type: 'NAVIGATE', targetId: details },
    });
    expect(editor.history.length).toBe(1);
    editor.ops.removeInteraction(button, 0);
    expect(editor.graph.requireNode(button).interactions).toHaveLength(0);
    editor.history.undo();
    expect(editor.graph.requireNode(button).interactions).toHaveLength(1);
  });

  it('lists connections for the overlay and sets the flow start', () => {
    const { editor, button, details, home } = setup();
    editor.ops.addInteraction(button, {
      trigger: 'CLICK',
      action: {
        type: 'NAVIGATE',
        targetId: details,
        transition: { type: 'INSTANT', durationMs: 0, easing: 'LINEAR' },
      },
    });
    const connections = editor.ops.prototypeConnections();
    expect(connections).toEqual([
      { sourceId: button, targetId: details, trigger: 'CLICK', type: 'NAVIGATE' },
    ]);
    editor.ops.setFlowStart(home);
    expect(editor.ops.flowStart()).toBe(home);
    editor.ops.deleteNodes([details]);
    expect(editor.ops.prototypeConnections()).toEqual([]); // dangling connections are dropped
  });
});

describe('PrototypeRuntime', () => {
  it('navigates, keeps history, opens and closes overlays, and reports transitions', () => {
    const { editor, home, button, details, back, modal } = setup();
    editor.ops.addInteraction(button, {
      trigger: 'CLICK',
      action: {
        type: 'NAVIGATE',
        targetId: details,
        transition: { type: 'SLIDE_LEFT', durationMs: 300, easing: 'EASE_IN_OUT' },
      },
    });
    editor.ops.addInteraction(back, { trigger: 'CLICK', action: { type: 'BACK' } });
    editor.ops.addInteraction(back, {
      trigger: 'HOVER',
      action: {
        type: 'OPEN_OVERLAY',
        targetId: modal,
        transition: { type: 'DISSOLVE', durationMs: 200, easing: 'LINEAR' },
      },
    });
    editor.ops.setFlowStart(home);
    const rt = new PrototypeRuntime(editor.graph);
    expect(rt.state.screenId).toBe(home);
    expect(rt.screens().map((s) => s.name)).toEqual(['Home', 'Details', 'Modal']);
    // Hit-testing a click inside the button on the Home screen (local coordinates of the screen)
    const t1 = rt.trigger('CLICK', { x: 20, y: 20 });
    expect(t1).toMatchObject({
      kind: 'navigate',
      to: details,
      transition: { type: 'SLIDE_LEFT', durationMs: 300 },
    });
    expect(rt.state.screenId).toBe(details);
    expect(rt.canGoBack).toBe(true);
    const t2 = rt.trigger('HOVER', { x: 10, y: 10 });
    expect(t2).toMatchObject({ kind: 'overlay', to: modal });
    expect(rt.state.overlayId).toBe(modal);
    expect(rt.closeOverlay()).toMatchObject({ kind: 'closeOverlay' });
    expect(rt.state.overlayId).toBeNull();
    const t3 = rt.trigger('CLICK', { x: 10, y: 10 });
    expect(t3).toMatchObject({ kind: 'navigate', to: home });
    expect(rt.state.screenId).toBe(home);
    expect(rt.canGoBack).toBe(false);
    expect(rt.trigger('CLICK', { x: 150, y: 350 })).toBeNull(); // nothing there
    rt.goTo(modal);
    expect(rt.state.screenId).toBe(modal);
  });

  it('hotspots are the nodes with interactions on the current screen', () => {
    const { editor, home, button, details } = setup();
    editor.ops.addInteraction(button, {
      trigger: 'CLICK',
      action: { type: 'NAVIGATE', targetId: details },
    });
    const rt = new PrototypeRuntime(editor.graph, home);
    expect(rt.hotspots().map((h) => h.id)).toEqual([button]);
    expect(rt.hotspots()[0]!.bounds).toEqual({ x: 10, y: 10, width: 50, height: 20 });
  });
});
