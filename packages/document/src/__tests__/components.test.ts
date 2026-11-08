import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import {
  SceneGraph,
  createNodeProps,
  projectInstances,
  instanceChildId,
  resolveInstanceTarget,
} from '../index';

function setup() {
  const g = SceneGraph.createEmpty();
  const page = g.pageIds[0] as NodeId;
  const master = g.insertNode(
    createNodeProps('COMPONENT', {
      name: 'Button',
      size: { width: 120, height: 40 },
      variantProps: { state: 'default' },
    }),
    page,
  );
  const bg = g.insertNode(
    createNodeProps('RECTANGLE', {
      name: 'bg',
      size: { width: 120, height: 40 },
      style: { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }] },
    }),
    master,
  );
  const label = g.insertNode(
    createNodeProps('TEXT', {
      name: 'label',
      characters: 'Click',
      transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
    }),
    master,
  );
  const inst = g.insertNode(
    createNodeProps('INSTANCE', {
      name: 'Button',
      componentId: master,
      transform: { x: 300, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 120, height: 40 },
    }),
    page,
  );
  return { g, page, master, bg, label, inst };
}

describe('instance projection', () => {
  it('materializes master children under instances with stable derived ids', () => {
    const { g, inst, bg, label } = setup();
    expect(g.getChildIds(inst)).toEqual([]);
    const changed = projectInstances(g);
    expect(changed).toBe(true);
    const kids = g.getChildIds(inst);
    expect(kids).toEqual([instanceChildId(inst, bg), instanceChildId(inst, label)]);
    expect(g.isDerived(kids[0] as NodeId)).toBe(true);
    expect(g.requireNode(kids[1] as NodeId)).toMatchObject({ type: 'TEXT', characters: 'Click' });
    expect(projectInstances(g)).toBe(false); // idempotent
  });
  it('applies overrides by main node id and keeps them across re-projection', () => {
    const { g, inst, label, bg } = setup();
    projectInstances(g);
    g.updateNode(inst, {
      overrides: {
        [label]: { characters: 'Buy now' },
        [bg]: { style: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] } },
      },
    });
    projectInstances(g);
    const kid = g.requireNode(instanceChildId(inst, label));
    expect(kid).toMatchObject({ characters: 'Buy now' });
    const bgKid = g.requireNode(instanceChildId(inst, bg));
    expect(bgKid.style.fills[0]).toMatchObject({ color: { r: 1 } });
    // Master edit flows through while the override wins.
    g.updateNode(label, { characters: 'Changed', visible: false });
    projectInstances(g);
    expect(g.requireNode(instanceChildId(inst, label))).toMatchObject({
      characters: 'Buy now',
      visible: false,
    });
  });
  it('excludes derived nodes from serialization and rebuilds them after load', () => {
    const { g, inst } = setup();
    projectInstances(g);
    const json = g.toJSON();
    const instJson = json.pages[0]!.children!.find((n) => n.id === inst)!;
    expect(instJson.children ?? []).toHaveLength(0);
    const copy = SceneGraph.fromJSON(json);
    expect(copy.getChildIds(inst)).toEqual([]);
    projectInstances(copy);
    expect(copy.getChildIds(inst)).toHaveLength(2);
  });
  it('resolves a derived node to its instance and main node', () => {
    const { g, inst, label } = setup();
    projectInstances(g);
    expect(resolveInstanceTarget(g, instanceChildId(inst, label))).toEqual({
      instanceId: inst,
      mainNodeId: label,
    });
    expect(resolveInstanceTarget(g, inst)).toBeNull();
  });
  it('handles nested instances and removes projections of deleted masters', () => {
    const { g, page, master, inst } = setup();
    const card = g.insertNode(
      createNodeProps('COMPONENT', { name: 'Card', size: { width: 200, height: 200 } }),
      page,
    );
    const innerInst = g.insertNode(
      createNodeProps('INSTANCE', {
        name: 'Button',
        componentId: master,
        size: { width: 120, height: 40 },
      }),
      card,
    );
    const cardInst = g.insertNode(
      createNodeProps('INSTANCE', {
        name: 'Card',
        componentId: card,
        size: { width: 200, height: 200 },
      }),
      page,
    );
    projectInstances(g);
    const nested = g.getChildIds(instanceChildId(cardInst, innerInst));
    expect(nested).toHaveLength(2);
    g.removeNode(master);
    projectInstances(g);
    expect(g.getChildIds(inst)).toEqual([]);
    expect(g.getNode(inst)?.type).toBe('INSTANCE');
  });
});
