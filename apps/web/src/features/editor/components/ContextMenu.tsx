import { useEffect, useRef } from 'react';
import { useEditor, useReadOnly } from '../editor-context';
import { useSelectedNodes } from '../hooks';
import { FRAME_PRESETS } from '../commands';

interface Item {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}

export function ContextMenu({
  position,
  onClose,
}: {
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const editor = useEditor();
  const readOnly = useReadOnly();
  const nodes = useSelectedNodes();
  const ref = useRef<HTMLDivElement>(null);
  const ids = nodes.map((n) => n.id);
  const has = ids.length > 0;
  const hasGroup = nodes.some((n) => n.type === 'GROUP');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const worldAt = editor.viewport.screenToWorld(position);
  const allSections: Item[][] = [
    [
      {
        label: 'Copy',
        shortcut: '⌘C',
        disabled: !has,
        onClick: run(() => editor.clipboard.copy()),
      },
      { label: 'Cut', shortcut: '⌘X', disabled: !has, onClick: run(() => editor.clipboard.cut()) },
      {
        label: 'Paste',
        shortcut: '⌘V',
        disabled: editor.clipboard.isEmpty,
        onClick: run(() => editor.clipboard.paste()),
      },
      {
        label: 'Duplicate',
        shortcut: '⌘D',
        disabled: !has,
        onClick: run(() => editor.ops.duplicateNodes(ids)),
      },
      {
        label: 'Delete',
        shortcut: '⌫',
        disabled: !has,
        onClick: run(() => editor.ops.deleteNodes(ids)),
      },
    ],
    [
      {
        label: 'Group selection',
        shortcut: '⌘G',
        disabled: !has,
        onClick: run(() => editor.ops.groupSelection()),
      },
      {
        label: 'Ungroup',
        shortcut: '⇧⌘G',
        disabled: !hasGroup,
        onClick: run(() => editor.ops.ungroupSelection()),
      },
      {
        label: 'Frame selection',
        shortcut: '⌥⌘K',
        disabled: !has,
        onClick: run(() => editor.ops.frameSelection()),
      },
    ],
    [
      {
        label: 'Bring to front',
        shortcut: '⌥⌘]',
        disabled: !has,
        onClick: run(() => editor.ops.bringToFront(ids)),
      },
      {
        label: 'Bring forward',
        shortcut: '⌘]',
        disabled: !has,
        onClick: run(() => editor.ops.bringForward(ids)),
      },
      {
        label: 'Send backward',
        shortcut: '⌘[',
        disabled: !has,
        onClick: run(() => editor.ops.sendBackward(ids)),
      },
      {
        label: 'Send to back',
        shortcut: '⌥⌘[',
        disabled: !has,
        onClick: run(() => editor.ops.sendToBack(ids)),
      },
    ],
    [
      {
        label: 'Flip horizontal',
        shortcut: '⇧⌘H',
        disabled: !has,
        onClick: run(() => editor.ops.flipSelection('horizontal')),
      },
      {
        label: 'Flip vertical',
        shortcut: '⇧⌘V',
        disabled: !has,
        onClick: run(() => editor.ops.flipSelection('vertical')),
      },
      {
        label: nodes.some((n) => n.locked) ? 'Unlock' : 'Lock',
        shortcut: '⇧⌘L',
        disabled: !has,
        onClick: run(() => editor.ops.setLocked(ids, !nodes.some((n) => n.locked))),
      },
      {
        label: nodes.some((n) => !n.visible) ? 'Show' : 'Hide',
        shortcut: '⇧⌘.',
        disabled: !has,
        onClick: run(() =>
          editor.ops.setVisible(
            ids,
            nodes.some((n) => !n.visible),
          ),
        ),
      },
    ],
    FRAME_PRESETS.map((p) => ({
      label: `New frame here: ${p.name}`,
      onClick: run(() => {
        editor.defaults.frameSize = { width: p.width, height: p.height };
        editor.ops.createNode('FRAME', {
          name: p.name,
          transform: {
            x: Math.round(worldAt.x),
            y: Math.round(worldAt.y),
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          size: { width: p.width, height: p.height },
        });
      }),
    })),
    [
      { label: 'Zoom to fit', shortcut: '⌘1', onClick: run(() => editor.zoomToFit()) },
      {
        label: 'Zoom to selection',
        shortcut: '⌘2',
        disabled: !has,
        onClick: run(() => editor.zoomToSelection()),
      },
    ],
  ];
  const sections = readOnly ? [allSections[allSections.length - 1] as Item[]] : allSections;

  return (
    <div
      ref={ref}
      className="absolute z-20 w-56 rounded-md border border-ink-600 bg-ink-800 p-1 shadow-2xl"
      style={{ left: Math.min(position.x, window.innerWidth - 260), top: position.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((items, i) => (
        <div key={i} className={i > 0 ? 'mt-1 border-t border-ink-700 pt-1' : ''}>
          {items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={it.onClick}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] text-ink-100 hover:bg-ink-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span>{it.label}</span>
              {it.shortcut && <span className="text-[11px] text-ink-400">{it.shortcut}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
