import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import type { SceneNode } from '@sigma/document';
import { instanceChildId } from '@sigma/document';
import { Editor } from '../editor';

function setup() {
  const editor = new Editor();
  const page = editor.currentPageId as NodeId;
  const frame = editor.ops.createNode(
    'FRAME',
    {
      name: 'Button',
      transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 120, height: 40 },
    },
    page,
  );
  const bg = editor.ops.createNode(
    'RECTANGLE',
    { name: 'bg', size: { width: 120, height: 40 } },
    frame,
  );
  const label = editor.ops.createNode(
    'TEXT',
    {
      name: 'label',
      characters: 'Click',
      transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
    },
    frame,
  );
  editor.history.clear();
  return { editor, page, frame, bg, label };
}

describe('components', () => {
  it('turns a frame into a component in place and creates instances that project its children', () => {
    const { editor, page, frame, bg, label } = setup();
    editor.selection.set([frame]);
    const master = editor.ops.createComponentFromSelection() as NodeId;
    expect(master).toBe(frame);
    expect(editor.graph.requireNode(master).type).toBe('COMPONENT');
    expect(editor.graph.getChildIds(master)).toEqual([bg, label]);
    const inst = editor.ops.createInstance(master, page, { x: 300, y: 10 });
    expect(editor.graph.requireNode(inst)).toMatchObject({
      type: 'INSTANCE',
      componentId: master,
      size: { width: 120, height: 40 },
    });
    expect(editor.graph.getChildIds(inst)).toEqual([
      instanceChildId(inst, bg),
      instanceChildId(inst, label),
    ]);
    expect(editor.graph.isDerived(instanceChildId(inst, label))).toBe(true);
    expect(editor.history.length).toBe(2);
    editor.history.undo();
    expect(editor.graph.hasNode(inst)).toBe(false);
    editor.history.undo();
    expect(editor.graph.requireNode(frame).type).toBe('FRAME');
  });

  it('wraps loose nodes into a new component and keeps world positions', () => {
    const { editor, page } = setup();
    const a = editor.ops.createNode(
      'RECTANGLE',
      {
        transform: { x: 500, y: 500, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 20, height: 20 },
      },
      page,
    );
    editor.selection.set([a]);
    const master = editor.ops.createComponentFromSelection() as NodeId;
    expect(editor.graph.requireNode(master).type).toBe('COMPONENT');
    expect(editor.graph.getWorldBounds(a)).toEqual({ x: 500, y: 500, width: 20, height: 20 });
    expect(editor.graph.requireNode(master).transform).toMatchObject({ x: 500, y: 500 });
  });

  it('master edits propagate; edits to projected nodes become overrides that survive master changes', () => {
    const { editor, page, frame, label, bg } = setup();
    editor.selection.set([frame]);
    const master = editor.ops.createComponentFromSelection() as NodeId;
    const inst = editor.ops.createInstance(master, page, { x: 300, y: 10 });
    const kid = instanceChildId(inst, label);
    // Override text on the instance copy
    editor.ops.setText(kid, 'Buy now');
    expect((editor.graph.requireNode(kid) as Extract<SceneNode, { type: 'TEXT' }>).characters).toBe(
      'Buy now',
    );
    expect(
      (editor.graph.requireNode(inst) as Extract<SceneNode, { type: 'INSTANCE' }>).overrides[label],
    ).toMatchObject({ characters: 'Buy now' });
    // Master change flows to the instance, override wins for the overridden field
    editor.ops.setStyle([bg], { opacity: 0.5 });
    editor.ops.setText(label, 'Master text');
    expect(editor.graph.requireNode(instanceChildId(inst, bg)).style.opacity).toBe(0.5);
    expect((editor.graph.requireNode(kid) as Extract<SceneNode, { type: 'TEXT' }>).characters).toBe(
      'Buy now',
    );
    // Undo of the override restores the projection
    editor.history.undo();
    editor.history.undo();
    editor.history.undo();
    expect((editor.graph.requireNode(kid) as Extract<SceneNode, { type: 'TEXT' }>).characters).toBe(
      'Click',
    );
    // Deleting a projected node hides it via an override; structural edits inside instances are refused
    editor.ops.deleteNodes([kid]);
    expect(editor.graph.hasNode(kid)).toBe(true);
    expect(editor.graph.requireNode(kid).visible).toBe(false);
    expect(editor.ops.reparent(kid, page)).toBe(false);
    editor.ops.resetOverrides(inst);
    expect(editor.graph.requireNode(kid).visible).toBe(true);
  });

  it('detaches an instance into a plain frame with real children', () => {
    const { editor, page, frame, label } = setup();
    editor.selection.set([frame]);
    const master = editor.ops.createComponentFromSelection() as NodeId;
    const inst = editor.ops.createInstance(master, page, { x: 300, y: 10 });
    editor.ops.setText(instanceChildId(inst, label), 'Custom');
    const detached = editor.ops.detachInstance(inst);
    const node = editor.graph.requireNode(detached);
    expect(node.type).toBe('FRAME');
    expect(editor.graph.getChildIds(detached)).toHaveLength(2);
    const text = editor.graph.getChildren(detached).find((n) => n.type === 'TEXT') as Extract<
      SceneNode,
      { type: 'TEXT' }
    >;
    expect(text.characters).toBe('Custom');
    expect(editor.graph.isDerived(text.id)).toBe(false);
    editor.history.undo();
    expect(editor.graph.requireNode(inst).type).toBe('INSTANCE');
  });

  it('builds a component set from variants and swaps instances between them', () => {
    const { editor, page, frame } = setup();
    editor.selection.set([frame]);
    const def = editor.ops.createComponentFromSelection() as NodeId;
    editor.ops.setProps([def], { variantProps: { state: 'default' } });
    const hover = editor.ops.duplicateNodes([def])[0] as NodeId;
    editor.ops.setProps([hover], { variantProps: { state: 'hover' } });
    editor.selection.set([def, hover]);
    const set = editor.ops.createComponentSet() as NodeId;
    expect(editor.graph.requireNode(set)).toMatchObject({
      type: 'COMPONENT_SET',
      variantAxes: ['state'],
    });
    expect([...editor.graph.getChildIds(set)].sort()).toEqual([def, hover].sort());
    const inst = editor.ops.createInstance(def, page, { x: 400, y: 0 });
    expect(
      editor.ops
        .variantsOf(inst)
        .map((v) => v.variantProps.state)
        .sort(),
    ).toEqual(['default', 'hover']);
    editor.ops.swapInstance(inst, hover);
    expect(
      (editor.graph.requireNode(inst) as Extract<SceneNode, { type: 'INSTANCE' }>).componentId,
    ).toBe(hover);
    expect(editor.graph.getChildIds(inst).every((c) => c.startsWith(`${inst}~`))).toBe(true);
  });

  it('serializes without projected nodes and re-projects on load', () => {
    const { editor, page, frame } = setup();
    editor.selection.set([frame]);
    const master = editor.ops.createComponentFromSelection() as NodeId;
    const inst = editor.ops.createInstance(master, page, { x: 300, y: 10 });
    const json = editor.toJSON();
    const other = new Editor({ document: json });
    expect(other.graph.getChildIds(inst)).toHaveLength(2);
    expect(JSON.stringify(json)).not.toContain('~');
  });
});
