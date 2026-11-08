import { ArrowDown, ArrowRight, X } from 'lucide-react';
import type { Layout, LayoutChild, SceneNode } from '@sigma/document';
import { useEditor } from '../editor-context';
import { NumberField, Section, Select } from './fields';

type FrameLike = Extract<SceneNode, { type: 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE' }>;

/** Auto layout controls for frame-like nodes. */
export function LayoutSection({ node }: { node: FrameLike }) {
  const editor = useEditor();
  const l = node.layout;
  const set = (patch: Partial<Layout>) => editor.ops.setLayout(node.id, patch);
  const active = l.mode !== 'NONE';
  return (
    <Section
      title="Auto layout"
      action={
        <div className="flex gap-0.5" data-testid="layout-mode">
          <button
            className="icon-btn h-6 w-6"
            data-active={l.mode === 'HORIZONTAL'}
            title="Horizontal"
            onClick={() => set({ mode: 'HORIZONTAL' })}
          >
            <ArrowRight size={13} />
          </button>
          <button
            className="icon-btn h-6 w-6"
            data-active={l.mode === 'VERTICAL'}
            title="Vertical"
            onClick={() => set({ mode: 'VERTICAL' })}
          >
            <ArrowDown size={13} />
          </button>
          {active && (
            <button
              className="icon-btn h-6 w-6"
              title="Remove auto layout"
              onClick={() => set({ mode: 'NONE' })}
            >
              <X size={13} />
            </button>
          )}
        </div>
      }
    >
      {!active ? (
        <div className="text-[11px] text-ink-500">
          Lay children out in a row or column. Shortcut: ⇧A.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField label="Gap" value={l.gap} min={0} onChange={(v) => set({ gap: v })} />
          <Select<Layout['alignItems']>
            value={l.alignItems}
            options={[
              { value: 'START', label: 'Align start' },
              { value: 'CENTER', label: 'Align center' },
              { value: 'END', label: 'Align end' },
            ]}
            onChange={(v) => set({ alignItems: v })}
          />
          <NumberField
            label="PT"
            value={l.padding.top}
            min={0}
            onChange={(v) => set({ padding: { ...l.padding, top: v } })}
          />
          <NumberField
            label="PR"
            value={l.padding.right}
            min={0}
            onChange={(v) => set({ padding: { ...l.padding, right: v } })}
          />
          <NumberField
            label="PB"
            value={l.padding.bottom}
            min={0}
            onChange={(v) => set({ padding: { ...l.padding, bottom: v } })}
          />
          <NumberField
            label="PL"
            value={l.padding.left}
            min={0}
            onChange={(v) => set({ padding: { ...l.padding, left: v } })}
          />
          <Select<Layout['primarySizing']>
            value={l.primarySizing}
            options={[
              { value: 'HUG', label: l.mode === 'HORIZONTAL' ? 'Width: hug' : 'Height: hug' },
              { value: 'FIXED', label: l.mode === 'HORIZONTAL' ? 'Width: fixed' : 'Height: fixed' },
            ]}
            onChange={(v) => set({ primarySizing: v })}
          />
          <Select<Layout['counterSizing']>
            value={l.counterSizing}
            options={[
              { value: 'HUG', label: l.mode === 'HORIZONTAL' ? 'Height: hug' : 'Width: hug' },
              { value: 'FIXED', label: l.mode === 'HORIZONTAL' ? 'Height: fixed' : 'Width: fixed' },
            ]}
            onChange={(v) => set({ counterSizing: v })}
          />
          <Select<Layout['justifyContent']>
            value={l.justifyContent}
            className="col-span-2"
            options={[
              { value: 'START', label: 'Pack start' },
              { value: 'CENTER', label: 'Pack center' },
              { value: 'END', label: 'Pack end' },
              { value: 'SPACE_BETWEEN', label: 'Space between' },
            ]}
            onChange={(v) => set({ justifyContent: v })}
          />
        </div>
      )}
    </Section>
  );
}

/** Constraints (inside plain frames) or child sizing (inside auto-layout frames). */
export function PositioningSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const first = nodes[0]!;
  const parent = editor.graph.getParent(first.id);
  if (!parent || parent.type === 'PAGE') return null;
  const parentLayout = (parent as { layout?: Layout }).layout;
  const ids = nodes.map((n) => n.id);
  if (parentLayout && parentLayout.mode !== 'NONE') {
    const lc = first.layoutChild;
    const set = (patch: Partial<LayoutChild>) =>
      ids.forEach((id) => editor.ops.setChildLayout(id, patch));
    return (
      <Section title="Sizing in layout">
        <div className="grid grid-cols-2 gap-1.5">
          <Select<LayoutChild['primary']>
            value={lc.primary}
            options={[
              {
                value: 'FIXED',
                label: parentLayout.mode === 'HORIZONTAL' ? 'Width: fixed' : 'Height: fixed',
              },
              {
                value: 'FILL',
                label: parentLayout.mode === 'HORIZONTAL' ? 'Width: fill' : 'Height: fill',
              },
            ]}
            onChange={(v) => set({ primary: v })}
          />
          <Select<LayoutChild['counter']>
            value={lc.counter}
            options={[
              {
                value: 'FIXED',
                label: parentLayout.mode === 'HORIZONTAL' ? 'Height: fixed' : 'Width: fixed',
              },
              {
                value: 'FILL',
                label: parentLayout.mode === 'HORIZONTAL' ? 'Height: fill' : 'Width: fill',
              },
            ]}
            onChange={(v) => set({ counter: v })}
          />
        </div>
      </Section>
    );
  }
  const c = first.constraints;
  const set = (patch: Partial<typeof c>) =>
    editor.ops.setProps(ids, { constraints: { ...c, ...patch } }, 'Constraints');
  return (
    <Section title="Constraints">
      <div className="grid grid-cols-2 gap-1.5">
        <Select<typeof c.horizontal>
          value={c.horizontal}
          options={[
            { value: 'LEFT', label: 'Left' },
            { value: 'RIGHT', label: 'Right' },
            { value: 'CENTER', label: 'Center' },
            { value: 'STRETCH', label: 'Left and right' },
            { value: 'SCALE', label: 'Scale' },
          ]}
          onChange={(v) => set({ horizontal: v })}
        />
        <Select<typeof c.vertical>
          value={c.vertical}
          options={[
            { value: 'TOP', label: 'Top' },
            { value: 'BOTTOM', label: 'Bottom' },
            { value: 'CENTER', label: 'Center' },
            { value: 'STRETCH', label: 'Top and bottom' },
            { value: 'SCALE', label: 'Scale' },
          ]}
          onChange={(v) => set({ vertical: v })}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink-500">Applied when the parent frame is resized.</div>
    </Section>
  );
}
