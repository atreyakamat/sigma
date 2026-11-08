import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Minus,
  Plus,
} from 'lucide-react';
import type {
  BlendMode,
  Color,
  Effect,
  Paint,
  SceneNode,
  Stroke,
  TextStyle,
} from '@sigma/document';
import { COLORS } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import { useEditor, useEditorContext, useReadOnly } from '../editor-context';
import { useAuth } from '../../authentication/AuthProvider';
import type { FrameLock, FrameReview, ReviewState } from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import { useDocumentRevision, useSelectedNodes } from '../hooks';
import { ColorField, NumberField, Section, Select } from './fields';

type Mixed<T> = T | 'mixed';
function common<T>(values: T[]): Mixed<T> {
  if (values.length === 0) return 'mixed';
  const first = values[0] as T;
  return values.every((v) => Object.is(v, first)) ? first : 'mixed';
}
const round = (n: number) => Math.round(n * 100) / 100;

export function Inspector() {
  const readOnly = useReadOnly();
  if (readOnly) return <ReadOnlyInspector />;
  return <EditableInspector />;
}

function ReadOnlyInspector() {
  const nodes = useSelectedNodes();
  const bounds = useEditor().selection.getBounds();
  return (
    <div className="p-3 text-[12px] text-ink-300">
      <div className="mb-2 rounded-md bg-ink-800 px-2 py-1.5 text-[11px] text-ink-400">
        View only — ask a workspace admin for edit access.
      </div>
      {nodes.length === 0 ? (
        <div className="text-ink-500">Select a layer to inspect it.</div>
      ) : (
        <dl className="grid grid-cols-2 gap-1">
          <dt className="text-ink-500">Layer</dt>
          <dd>{nodes.length === 1 ? nodes[0]?.name : `${nodes.length} layers`}</dd>
          <dt className="text-ink-500">X / Y</dt>
          <dd>{bounds ? `${round(bounds.x)} / ${round(bounds.y)}` : '—'}</dd>
          <dt className="text-ink-500">W / H</dt>
          <dd>{bounds ? `${round(bounds.width)} × ${round(bounds.height)}` : '—'}</dd>
        </dl>
      )}
    </div>
  );
}

function EditableInspector() {
  const editor = useEditor();
  const nodes = useSelectedNodes();
  const revision = useDocumentRevision();
  void revision;
  if (nodes.length === 0) return <PageInspector />;
  const ids = nodes.map((n) => n.id);
  const first = nodes[0] as SceneNode;
  const single = nodes.length === 1 ? first : null;
  const sameType = nodes.every((n) => n.type === first.type);
  const styleable = nodes.filter((n) => n.type !== 'GROUP');
  const textNodes = nodes.filter(
    (n): n is Extract<SceneNode, { type: 'TEXT' }> => n.type === 'TEXT',
  );

  const bounds = editor.selection.getBounds();
  const setX = (v: number) =>
    bounds && editor.ops.moveNodes(ids, { x: v - bounds.x, y: 0 }, 'inspector:x');
  const setY = (v: number) =>
    bounds && editor.ops.moveNodes(ids, { x: 0, y: v - bounds.y }, 'inspector:y');

  return (
    <div className="pb-6">
      <Section
        title={single ? single.name : `${nodes.length} layers`}
        action={<LayerToggles ids={ids} nodes={nodes} />}
      >
        {single && (
          <input
            className="field mb-2"
            defaultValue={single.name}
            key={single.id}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== single.name) editor.ops.rename(single.id, v);
            }}
          />
        )}
        <div className="grid grid-cols-6 gap-1">
          <button
            className="icon-btn"
            title="Align left"
            onClick={() => editor.ops.align(ids, 'left')}
          >
            <AlignStartVertical size={14} />
          </button>
          <button
            className="icon-btn"
            title="Align horizontal centers"
            onClick={() => editor.ops.align(ids, 'hcenter')}
          >
            <AlignCenterVertical size={14} />
          </button>
          <button
            className="icon-btn"
            title="Align right"
            onClick={() => editor.ops.align(ids, 'right')}
          >
            <AlignEndVertical size={14} />
          </button>
          <button
            className="icon-btn"
            title="Align top"
            onClick={() => editor.ops.align(ids, 'top')}
          >
            <AlignStartHorizontal size={14} />
          </button>
          <button
            className="icon-btn"
            title="Align vertical centers"
            onClick={() => editor.ops.align(ids, 'vcenter')}
          >
            <AlignCenterHorizontal size={14} />
          </button>
          <button
            className="icon-btn"
            title="Align bottom"
            onClick={() => editor.ops.align(ids, 'bottom')}
          >
            <AlignEndHorizontal size={14} />
          </button>
          <button
            className="icon-btn"
            title="Distribute horizontally"
            disabled={nodes.length < 3}
            onClick={() => editor.ops.distribute(ids, 'horizontal')}
          >
            <AlignHorizontalDistributeCenter size={14} />
          </button>
          <button
            className="icon-btn"
            title="Distribute vertically"
            disabled={nodes.length < 3}
            onClick={() => editor.ops.distribute(ids, 'vertical')}
          >
            <AlignVerticalDistributeCenter size={14} />
          </button>
          <button
            className="icon-btn"
            title="Flip horizontal (⇧⌘H)"
            onClick={() => editor.ops.flipSelection('horizontal')}
          >
            <FlipHorizontal2 size={14} />
          </button>
          <button
            className="icon-btn"
            title="Flip vertical (⇧⌘V)"
            onClick={() => editor.ops.flipSelection('vertical')}
          >
            <FlipVertical2 size={14} />
          </button>
        </div>
      </Section>

      <Section title="Position">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField label="X" value={bounds ? round(bounds.x) : 'mixed'} onChange={setX} />
          <NumberField label="Y" value={bounds ? round(bounds.y) : 'mixed'} onChange={setY} />
          <NumberField
            label="W"
            value={
              single && single.type !== 'GROUP'
                ? round(single.size.width)
                : bounds
                  ? round(bounds.width)
                  : 'mixed'
            }
            min={0}
            onChange={(v) => {
              if (single && single.type !== 'GROUP')
                editor.ops.setSize(single.id, { width: v }, 'inspector:w');
            }}
          />
          <NumberField
            label="H"
            value={
              single && single.type !== 'GROUP'
                ? round(single.size.height)
                : bounds
                  ? round(bounds.height)
                  : 'mixed'
            }
            min={0}
            onChange={(v) => {
              if (single && single.type !== 'GROUP')
                editor.ops.setSize(single.id, { height: v }, 'inspector:h');
            }}
          />
          <NumberField
            label="∠"
            value={common(nodes.map((n) => round(n.transform.rotation)))}
            suffix="°"
            onChange={(v) =>
              editor.ops.setProps(ids, { transform: { rotation: v } }, 'Rotate', 'inspector:rot')
            }
          />
          {styleable.length > 0 && (
            <NumberField
              label="◜"
              value={common(
                styleable.map((n) =>
                  typeof n.style.cornerRadius === 'number' ? n.style.cornerRadius : -1,
                ),
              )}
              min={0}
              onChange={(v) =>
                editor.ops.setStyle(
                  styleable.map((n) => n.id),
                  { cornerRadius: v },
                  'Corner radius',
                  'inspector:radius',
                )
              }
            />
          )}
        </div>
      </Section>

      {styleable.length > 0 && (
        <Section title="Layer">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              label="◐"
              value={common(styleable.map((n) => Math.round(n.style.opacity * 100)))}
              min={0}
              max={100}
              suffix="%"
              onChange={(v) =>
                editor.ops.setStyle(
                  styleable.map((n) => n.id),
                  { opacity: v / 100 },
                  'Opacity',
                  'inspector:opacity',
                )
              }
            />
            <Select<BlendMode>
              value={common(styleable.map((n) => n.style.blendMode))}
              options={(
                [
                  'NORMAL',
                  'MULTIPLY',
                  'SCREEN',
                  'OVERLAY',
                  'DARKEN',
                  'LIGHTEN',
                  'COLOR_DODGE',
                  'COLOR_BURN',
                  'HARD_LIGHT',
                  'SOFT_LIGHT',
                  'DIFFERENCE',
                  'EXCLUSION',
                  'HUE',
                  'SATURATION',
                  'COLOR',
                  'LUMINOSITY',
                ] as BlendMode[]
              ).map((b) => ({ value: b, label: b.toLowerCase().replace('_', ' ') }))}
              onChange={(v) =>
                editor.ops.setStyle(
                  styleable.map((n) => n.id),
                  { blendMode: v },
                  'Blend mode',
                )
              }
            />
          </div>
        </Section>
      )}

      {single && single.type === 'FRAME' && <FrameSection frame={single} />}
      {single && (single.type === 'POLYGON' || single.type === 'STAR') && (
        <Section title={single.type === 'POLYGON' ? 'Polygon' : 'Star'}>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              label="N"
              value={single.pointCount}
              min={3}
              max={60}
              onChange={(v) =>
                editor.ops.setProps([single.id], { pointCount: Math.round(v) }, 'Points')
              }
            />
            {single.type === 'STAR' && (
              <NumberField
                label="R"
                value={Math.round(single.innerRadius * 100)}
                min={1}
                max={100}
                suffix="%"
                onChange={(v) =>
                  editor.ops.setProps(
                    [single.id],
                    { innerRadius: v / 100 },
                    'Inner radius',
                    'inspector:inner',
                  )
                }
              />
            )}
          </div>
        </Section>
      )}
      {single && single.type === 'IMAGE' && (
        <Section title="Image">
          <Select
            value={single.image.scaleMode}
            options={[
              { value: 'FILL', label: 'Fill' },
              { value: 'FIT', label: 'Fit' },
              { value: 'STRETCH', label: 'Stretch' },
              { value: 'TILE', label: 'Tile' },
            ]}
            onChange={(v) =>
              editor.ops.setProps([single.id], { image: { scaleMode: v } }, 'Image scale mode')
            }
          />
        </Section>
      )}

      {textNodes.length > 0 && sameType && <TextSection nodes={textNodes} />}

      {styleable.length > 0 && <FillsSection nodes={styleable} />}
      {styleable.length > 0 && <StrokesSection nodes={styleable} />}
      {styleable.length > 0 && <EffectsSection nodes={styleable} />}
    </div>
  );
}

function LayerToggles({ ids, nodes }: { ids: NodeId[]; nodes: SceneNode[] }) {
  const editor = useEditor();
  const anyHidden = nodes.some((n) => !n.visible);
  return (
    <div className="flex gap-0.5">
      <button
        className="icon-btn h-6 w-6"
        title={anyHidden ? 'Show' : 'Hide'}
        onClick={() => editor.ops.setVisible(ids, anyHidden)}
      >
        {anyHidden ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

function PageInspector() {
  const editor = useEditor();
  const page = editor.currentPageId
    ? editor.graph.getNodeOfType(editor.currentPageId, 'PAGE')
    : undefined;
  if (!page) return null;
  return (
    <div>
      <Section title="Page">
        <input
          className="field mb-2"
          defaultValue={page.name}
          key={page.id}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== page.name) editor.ops.rename(page.id, v);
          }}
        />
        <div className="text-[11px] text-ink-400">Background</div>
        <div className="mt-1 flex">
          <ColorField
            color={page.backgroundColor}
            opacity={1}
            onChange={(c) =>
              editor.ops.setProps(
                [page.id],
                { backgroundColor: { ...c, a: 1 } },
                'Page background',
                'inspector:pagebg',
              )
            }
          />
        </div>
      </Section>
      <div className="px-3 py-3 text-[11px] leading-relaxed text-ink-400">
        Select a layer to edit its properties. Tools: <kbd>V</kbd> select, <kbd>F</kbd> frame,{' '}
        <kbd>R</kbd> rectangle, <kbd>O</kbd> ellipse, <kbd>L</kbd> line, <kbd>T</kbd> text,{' '}
        <kbd>H</kbd> hand. Hold <kbd>Space</kbd> to pan, <kbd>⌘</kbd> + scroll to zoom.
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- fills */

function FillsSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const ids = nodes.map((n) => n.id);
  const first = nodes[0] as SceneNode;
  const same = nodes.every(
    (n) => JSON.stringify(n.style.fills) === JSON.stringify(first.style.fills),
  );
  const fills = first.style.fills;
  const update = (next: Paint[], name: string, mergeKey?: string) =>
    editor.ops.setStyle(ids, { fills: next }, name, mergeKey);
  return (
    <Section
      title="Fill"
      action={
        <button
          className="icon-btn h-6 w-6"
          title="Add fill"
          onClick={() =>
            update(
              [
                ...(same ? fills : []),
                { type: 'SOLID', color: COLORS.defaultFill, opacity: 1, visible: true },
              ],
              'Add fill',
            )
          }
        >
          <Plus size={13} />
        </button>
      }
    >
      {!same ? (
        <div className="text-[11px] text-ink-400">
          Mixed fills. Click + to replace with one fill.
        </div>
      ) : fills.length === 0 ? (
        <div className="text-[11px] text-ink-500">No fill</div>
      ) : (
        <div className="flex flex-col gap-1">
          {fills.map((fill, i) => (
            <PaintRow
              key={i}
              paint={fill}
              onChange={(p, mergeKey) =>
                update(
                  fills.map((f, j) => (j === i ? p : f)),
                  'Change fill',
                  mergeKey,
                )
              }
              onRemove={() =>
                update(
                  fills.filter((_, j) => j !== i),
                  'Remove fill',
                )
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function PaintRow({
  paint,
  onChange,
  onRemove,
}: {
  paint: Paint;
  onChange: (p: Paint, mergeKey?: string) => void;
  onRemove: () => void;
}) {
  if (paint.type === 'SOLID') {
    return (
      <div className="flex items-center gap-1">
        <ColorField
          color={paint.color}
          opacity={paint.opacity}
          onChange={(color, opacity) => onChange({ ...paint, color, opacity }, 'paint:solid')}
        />
        <button
          className="icon-btn h-6 w-6"
          title={paint.visible ? 'Hide fill' : 'Show fill'}
          onClick={() => onChange({ ...paint, visible: !paint.visible })}
        >
          {paint.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button className="icon-btn h-6 w-6" title="Remove" onClick={onRemove}>
          <Minus size={12} />
        </button>
      </div>
    );
  }
  const label =
    paint.type === 'LINEAR_GRADIENT'
      ? 'Linear gradient'
      : paint.type === 'RADIAL_GRADIENT'
        ? 'Radial gradient'
        : 'Image';
  return (
    <div className="flex items-center gap-1">
      <div className="flex h-7 flex-1 items-center rounded-md bg-ink-750 px-2 text-[12px] text-ink-300">
        {label}
      </div>
      <NumberField
        label=""
        value={Math.round(paint.opacity * 100)}
        min={0}
        max={100}
        suffix="%"
        className="w-16"
        onChange={(v) => onChange({ ...paint, opacity: v / 100 }, 'paint:opacity')}
      />
      <button className="icon-btn h-6 w-6" title="Remove" onClick={onRemove}>
        <Minus size={12} />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- strokes */

function StrokesSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const ids = nodes.map((n) => n.id);
  const first = nodes[0] as SceneNode;
  const same = nodes.every(
    (n) => JSON.stringify(n.style.strokes) === JSON.stringify(first.style.strokes),
  );
  const strokes = first.style.strokes;
  const update = (next: Stroke[], name: string, mergeKey?: string) =>
    editor.ops.setStyle(ids, { strokes: next }, name, mergeKey);
  const defaultStroke: Stroke = {
    paint: { type: 'SOLID', color: COLORS.black, opacity: 1, visible: true },
    width: 1,
    align: 'INSIDE',
    cap: 'BUTT',
    join: 'MITER',
    dashPattern: [],
    visible: true,
  };
  return (
    <Section
      title="Stroke"
      action={
        <button
          className="icon-btn h-6 w-6"
          title="Add stroke"
          onClick={() => update([...(same ? strokes : []), defaultStroke], 'Add stroke')}
        >
          <Plus size={13} />
        </button>
      }
    >
      {!same ? (
        <div className="text-[11px] text-ink-400">Mixed strokes.</div>
      ) : strokes.length === 0 ? (
        <div className="text-[11px] text-ink-500">No stroke</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {strokes.map((stroke, i) => {
            const set = (patch: Partial<Stroke>, mergeKey?: string) =>
              update(
                strokes.map((s, j) => (j === i ? { ...s, ...patch } : s)),
                'Change stroke',
                mergeKey,
              );
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  {stroke.paint.type === 'SOLID' ? (
                    <ColorField
                      color={stroke.paint.color}
                      opacity={stroke.paint.opacity}
                      onChange={(color, opacity) =>
                        set(
                          {
                            paint: {
                              ...(stroke.paint as Extract<Paint, { type: 'SOLID' }>),
                              color,
                              opacity,
                            },
                          },
                          'stroke:color',
                        )
                      }
                    />
                  ) : (
                    <div className="flex h-7 flex-1 items-center rounded-md bg-ink-750 px-2 text-[12px] text-ink-300">
                      Gradient
                    </div>
                  )}
                  <button
                    className="icon-btn h-6 w-6"
                    onClick={() => set({ visible: !stroke.visible })}
                    title={stroke.visible ? 'Hide stroke' : 'Show stroke'}
                  >
                    {stroke.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    className="icon-btn h-6 w-6"
                    title="Remove"
                    onClick={() =>
                      update(
                        strokes.filter((_, j) => j !== i),
                        'Remove stroke',
                      )
                    }
                  >
                    <Minus size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <NumberField
                    label="W"
                    value={stroke.width}
                    min={0}
                    step={0.5}
                    onChange={(v) => set({ width: v }, 'stroke:width')}
                  />
                  <Select
                    value={stroke.align}
                    options={[
                      { value: 'INSIDE', label: 'Inside' },
                      { value: 'CENTER', label: 'Center' },
                      { value: 'OUTSIDE', label: 'Outside' },
                    ]}
                    onChange={(v) => set({ align: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- effects */

function EffectsSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const ids = nodes.map((n) => n.id);
  const first = nodes[0] as SceneNode;
  const same = nodes.every(
    (n) => JSON.stringify(n.style.effects) === JSON.stringify(first.style.effects),
  );
  const effects = first.style.effects;
  const update = (next: Effect[], name: string, mergeKey?: string) =>
    editor.ops.setStyle(ids, { effects: next }, name, mergeKey);
  return (
    <Section
      title="Effects"
      action={
        <div className="flex gap-0.5">
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-300 hover:bg-ink-700"
            onClick={() =>
              update(
                [
                  ...(same ? effects : []),
                  {
                    type: 'DROP_SHADOW',
                    color: { r: 0, g: 0, b: 0, a: 0.25 },
                    offset: { x: 0, y: 4 },
                    blur: 8,
                    spread: 0,
                    visible: true,
                  },
                ],
                'Add shadow',
              )
            }
          >
            + Shadow
          </button>
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-300 hover:bg-ink-700"
            onClick={() =>
              update(
                [...(same ? effects : []), { type: 'LAYER_BLUR', radius: 4, visible: true }],
                'Add blur',
              )
            }
          >
            + Blur
          </button>
        </div>
      }
    >
      {!same ? (
        <div className="text-[11px] text-ink-400">Mixed effects.</div>
      ) : effects.length === 0 ? (
        <div className="text-[11px] text-ink-500">No effects</div>
      ) : (
        <div className="flex flex-col gap-2">
          {effects.map((effect, i) => {
            const set = (e: Effect, mergeKey?: string) =>
              update(
                effects.map((x, j) => (j === i ? e : x)),
                'Change effect',
                mergeKey,
              );
            return (
              <div key={i} className="rounded-md bg-ink-800 p-1.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-300">
                  <span>{effect.type === 'DROP_SHADOW' ? 'Drop shadow' : 'Layer blur'}</span>
                  <div className="flex">
                    <button
                      className="icon-btn h-5 w-5"
                      onClick={() => set({ ...effect, visible: !effect.visible })}
                    >
                      {effect.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button
                      className="icon-btn h-5 w-5"
                      onClick={() =>
                        update(
                          effects.filter((_, j) => j !== i),
                          'Remove effect',
                        )
                      }
                    >
                      <Minus size={11} />
                    </button>
                  </div>
                </div>
                {effect.type === 'DROP_SHADOW' ? (
                  <div className="flex flex-col gap-1">
                    <ColorField
                      color={effect.color}
                      opacity={effect.color.a}
                      onChange={(c, a) => set({ ...effect, color: { ...c, a } }, 'effect:color')}
                    />
                    <div className="grid grid-cols-3 gap-1">
                      <NumberField
                        label="X"
                        value={effect.offset.x}
                        onChange={(v) =>
                          set({ ...effect, offset: { ...effect.offset, x: v } }, 'effect:x')
                        }
                      />
                      <NumberField
                        label="Y"
                        value={effect.offset.y}
                        onChange={(v) =>
                          set({ ...effect, offset: { ...effect.offset, y: v } }, 'effect:y')
                        }
                      />
                      <NumberField
                        label="B"
                        value={effect.blur}
                        min={0}
                        onChange={(v) => set({ ...effect, blur: v }, 'effect:blur')}
                      />
                    </div>
                  </div>
                ) : (
                  <NumberField
                    label="R"
                    value={effect.radius}
                    min={0}
                    onChange={(v) => set({ ...effect, radius: v }, 'effect:radius')}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- text */

function TextSection({ nodes }: { nodes: Extract<SceneNode, { type: 'TEXT' }>[] }) {
  const editor = useEditor();
  const ids = nodes.map((n) => n.id);
  const ts = (k: keyof TextStyle) => common(nodes.map((n) => n.textStyle[k] as string | number));
  const set = (patch: Partial<TextStyle>, mergeKey?: string) =>
    editor.ops.setTextStyle(ids, patch, mergeKey);
  const autoResize = common(nodes.map((n) => n.autoResize));
  return (
    <Section title="Text">
      <div className="flex flex-col gap-1.5">
        <input
          className="field"
          value={(ts('fontFamily') as string) === 'mixed' ? '' : (ts('fontFamily') as string)}
          placeholder="Font family"
          onChange={(e) => set({ fontFamily: e.target.value }, 'text:family')}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <Select<string>
            value={String(ts('fontWeight'))}
            options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
              value: String(w),
              label: {
                100: 'Thin',
                200: 'Extra light',
                300: 'Light',
                400: 'Regular',
                500: 'Medium',
                600: 'Semibold',
                700: 'Bold',
                800: 'Extra bold',
                900: 'Black',
              }[w] as string,
            }))}
            onChange={(v) => set({ fontWeight: Number(v) })}
          />
          <NumberField
            label="S"
            value={ts('fontSize') as Mixed<number>}
            min={1}
            onChange={(v) => set({ fontSize: v }, 'text:size')}
          />
          <NumberField
            label="LH"
            value={ts('lineHeight') as Mixed<number>}
            min={0.1}
            step={0.1}
            onChange={(v) => set({ lineHeight: v }, 'text:lh')}
          />
          <NumberField
            label="LS"
            value={ts('letterSpacing') as Mixed<number>}
            step={0.1}
            onChange={(v) => set({ letterSpacing: v }, 'text:ls')}
          />
          <Select<TextStyle['textAlign']>
            value={ts('textAlign') as Mixed<TextStyle['textAlign']>}
            options={[
              { value: 'LEFT', label: 'Left' },
              { value: 'CENTER', label: 'Center' },
              { value: 'RIGHT', label: 'Right' },
            ]}
            onChange={(v) => set({ textAlign: v })}
          />
          <Select<TextStyle['verticalAlign']>
            value={ts('verticalAlign') as Mixed<TextStyle['verticalAlign']>}
            options={[
              { value: 'TOP', label: 'Top' },
              { value: 'MIDDLE', label: 'Middle' },
              { value: 'BOTTOM', label: 'Bottom' },
            ]}
            onChange={(v) => set({ verticalAlign: v })}
          />
          <Select<TextStyle['textDecoration']>
            value={ts('textDecoration') as Mixed<TextStyle['textDecoration']>}
            options={[
              { value: 'NONE', label: 'No decoration' },
              { value: 'UNDERLINE', label: 'Underline' },
              { value: 'STRIKETHROUGH', label: 'Strikethrough' },
            ]}
            onChange={(v) => set({ textDecoration: v })}
          />
          <Select<TextStyle['textTransform']>
            value={ts('textTransform') as Mixed<TextStyle['textTransform']>}
            options={[
              { value: 'NONE', label: 'As typed' },
              { value: 'UPPERCASE', label: 'UPPERCASE' },
              { value: 'LOWERCASE', label: 'lowercase' },
              { value: 'CAPITALIZE', label: 'Capitalize' },
            ]}
            onChange={(v) => set({ textTransform: v })}
          />
          <Select<Extract<SceneNode, { type: 'TEXT' }>['autoResize']>
            value={autoResize}
            options={[
              { value: 'WIDTH_AND_HEIGHT', label: 'Auto width' },
              { value: 'HEIGHT', label: 'Auto height' },
              { value: 'NONE', label: 'Fixed size' },
            ]}
            className="col-span-2"
            onChange={(v) => {
              editor.ops.setProps(ids, { autoResize: v }, 'Text resize');
              editor.ops.setTextStyle(ids, {});
            }}
          />
          <Select<TextStyle['fontStyle']>
            value={ts('fontStyle') as Mixed<TextStyle['fontStyle']>}
            options={[
              { value: 'NORMAL', label: 'Upright' },
              { value: 'ITALIC', label: 'Italic' },
            ]}
            className="col-span-2"
            onChange={(v) => set({ fontStyle: v })}
          />
        </div>
      </div>
    </Section>
  );
}

export type { Color };

function FrameSection({ frame }: { frame: Extract<SceneNode, { type: 'FRAME' }> }) {
  const editor = useEditor();
  const { role } = useEditorContext();
  const { user } = useAuth();
  const meta = frame.metadata as { lock?: FrameLock; review?: FrameReview };
  const lock =
    meta.lock && new Date(meta.lock.until).getTime() > Date.now() ? meta.lock : undefined;
  const mine = lock?.userId === user?.id;
  const setMeta = (patch: Record<string, unknown>, name: string) =>
    editor.ops.setProps([frame.id], { metadata: { ...frame.metadata, ...patch } }, name);
  return (
    <Section title="Frame">
      <label className="mb-2 flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={frame.clipsContent}
          onChange={(e) =>
            editor.ops.setProps([frame.id], { clipsContent: e.target.checked }, 'Clip content')
          }
        />
        Clip content
      </label>
      <div className="mb-2 grid grid-cols-[auto_1fr] items-center gap-2 text-[12px]">
        <span className="text-ink-400">Review</span>
        <Select<ReviewState>
          value={meta.review?.state ?? 'DRAFT'}
          options={[
            { value: 'DRAFT', label: 'Draft' },
            { value: 'IN_REVIEW', label: 'In review' },
            { value: 'APPROVED', label: 'Approved' },
          ]}
          onChange={(state) =>
            roleHas(role, 'review.set') &&
            setMeta(
              {
                review: {
                  state,
                  byId: user?.id ?? '',
                  byName: user?.name ?? '',
                  at: new Date().toISOString(),
                } as FrameReview,
              },
              `Mark ${state.toLowerCase().replace('_', ' ')}`,
            )
          }
        />
      </div>
      {meta.review && meta.review.state !== 'DRAFT' && (
        <div className="mb-2 text-[11px] text-ink-500">
          {meta.review.state === 'APPROVED' ? 'Approved' : 'Submitted'} by {meta.review.byName} ·{' '}
          {new Date(meta.review.at).toLocaleString()}
        </div>
      )}
      {lock && !mine ? (
        <div
          className="rounded-md bg-ink-800 px-2 py-1.5 text-[11px] text-ink-300"
          data-testid="frame-locked-by"
        >
          🔒 Locked by {lock.name} until {new Date(lock.until).toLocaleString()}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-ink-700 px-2 py-1 text-[11px] hover:bg-ink-600"
            data-testid="frame-lock-toggle"
            onClick={() => {
              if (mine) setMeta({ lock: undefined }, 'Unlock frame');
              else {
                const hours = Number(
                  prompt(
                    'Lock this frame for how many hours? Others can view but not change it.',
                    '8',
                  ),
                );
                if (!hours || hours <= 0) return;
                setMeta(
                  {
                    lock: {
                      userId: user?.id ?? '',
                      name: user?.name ?? '',
                      until: new Date(Date.now() + hours * 3600_000).toISOString(),
                    } as FrameLock,
                  },
                  'Lock frame',
                );
              }
            }}
          >
            {mine
              ? `🔓 Unlock (yours until ${new Date(lock!.until).toLocaleTimeString()})`
              : '🔒 Lock for me'}
          </button>
        </div>
      )}
    </Section>
  );
}
