import { Minus, Plus } from 'lucide-react';
import type { Interaction, SceneNode, Transition } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import { useEditor } from '../editor/editor-context';
import { Section, Select, NumberField } from '../editor/components/fields';

const TRIGGERS: { value: Interaction['trigger']; label: string }[] = [
  { value: 'CLICK', label: 'On click' },
  { value: 'HOVER', label: 'On hover' },
  { value: 'DRAG', label: 'On drag' },
  { value: 'AFTER_DELAY', label: 'After delay' },
  { value: 'KEY', label: 'On key' },
];
const ACTIONS = [
  'NAVIGATE',
  'OPEN_OVERLAY',
  'BACK',
  'CLOSE_OVERLAY',
  'SCROLL_TO',
  'OPEN_URL',
] as const;
const TRANSITIONS: Transition['type'][] = [
  'INSTANT',
  'DISSOLVE',
  'SLIDE_LEFT',
  'SLIDE_RIGHT',
  'SLIDE_UP',
  'SLIDE_DOWN',
  'PUSH_LEFT',
  'PUSH_RIGHT',
  'SMART',
];

/** Inspector editor for a node's prototype interactions. */
export function PrototypeSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const page = editor.currentPageId as NodeId;
  const screens = editor.graph.getChildren(page).filter((n) => 'layout' in n && n.id !== node.id);
  const isScreen = node.parentId === page && 'layout' in node;
  const flowStart = editor.ops.flowStart();
  const update = (i: number, patch: Record<string, unknown>) =>
    editor.ops.updateInteraction(node.id, i, patch as never);
  return (
    <Section
      title="Prototype"
      action={
        <button
          className="icon-btn h-6 w-6"
          title="Add interaction"
          data-testid="add-interaction"
          onClick={() =>
            editor.ops.addInteraction(node.id, {
              trigger: 'CLICK',
              action: { type: 'NAVIGATE', targetId: screens[0]?.id ?? node.id },
            })
          }
        >
          <Plus size={13} />
        </button>
      }
    >
      {isScreen && (
        <label className="mb-2 flex items-center gap-2 text-[11px] text-ink-300">
          <input
            type="checkbox"
            checked={flowStart === node.id}
            onChange={(e) => editor.ops.setFlowStart(e.target.checked ? node.id : null)}
          />{' '}
          Flow starting point
        </label>
      )}
      {node.interactions.length === 0 && (
        <div className="text-[11px] text-ink-500">
          No interactions. Add one to link this layer to another frame.
        </div>
      )}
      {node.interactions.map((it, i) => {
        const a = it.action;
        return (
          <div key={i} className="mb-2 rounded-md bg-ink-800 p-2" data-testid="interaction">
            <div className="mb-1 flex items-center gap-1">
              <Select<Interaction['trigger']>
                value={it.trigger}
                options={TRIGGERS}
                onChange={(v) => update(i, { trigger: v })}
              />
              <button
                className="icon-btn h-6 w-6"
                title="Remove"
                onClick={() => editor.ops.removeInteraction(node.id, i)}
              >
                <Minus size={12} />
              </button>
            </div>
            {it.trigger === 'AFTER_DELAY' && (
              <NumberField
                label="ms"
                value={it.delayMs}
                min={0}
                className="mb-1"
                onChange={(v) => update(i, { delayMs: v })}
              />
            )}
            {it.trigger === 'KEY' && (
              <input
                className="field mb-1 h-7"
                placeholder="Key (e.g. Enter)"
                defaultValue={it.key ?? ''}
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={(e) => update(i, { key: e.target.value || undefined })}
              />
            )}
            <Select<(typeof ACTIONS)[number]>
              value={a.type}
              options={ACTIONS.map((t) => ({
                value: t,
                label: {
                  NAVIGATE: 'Navigate to',
                  OPEN_OVERLAY: 'Open overlay',
                  BACK: 'Go back',
                  CLOSE_OVERLAY: 'Close overlay',
                  SCROLL_TO: 'Scroll to',
                  OPEN_URL: 'Open URL',
                }[t],
              }))}
              onChange={(type) => {
                const target = screens[0]?.id ?? node.id;
                const next =
                  type === 'OPEN_URL'
                    ? { type, url: 'https://' }
                    : type === 'BACK' || type === 'CLOSE_OVERLAY'
                      ? { type }
                      : { type, targetId: target };
                update(i, { action: next });
              }}
            />
            {'targetId' in a && (
              <Select<string>
                value={a.targetId}
                className="mt-1"
                options={screens.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(targetId) => update(i, { action: { ...a, targetId } })}
              />
            )}
            {a.type === 'OPEN_URL' && (
              <input
                className="field mt-1 h-7"
                defaultValue={a.url}
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={(e) => update(i, { action: { ...a, url: e.target.value } })}
              />
            )}
            {'transition' in a && (
              <div className="mt-1 grid grid-cols-[1fr_4.5rem] gap-1">
                <Select<Transition['type']>
                  value={a.transition.type}
                  options={TRANSITIONS.map((t) => ({
                    value: t,
                    label: t.toLowerCase().replace('_', ' '),
                  }))}
                  onChange={(type) =>
                    update(i, { action: { ...a, transition: { ...a.transition, type } } })
                  }
                />
                <NumberField
                  label="ms"
                  value={a.transition.durationMs}
                  min={0}
                  onChange={(v) =>
                    update(i, { action: { ...a, transition: { ...a.transition, durationMs: v } } })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
