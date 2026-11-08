import type { NodeId } from '@sigma/shared';
import type { Editor } from './editor';

/** Registers the editor's default keyboard shortcuts. Tool shortcuts are registered separately. */
export function registerDefaultShortcuts(editor: Editor): () => void {
  const k = editor.keymap;
  const sel = () => editor.selection.ids;
  const offs = [
    k.register('mod+z', () => editor.history.undo(), 'Undo'),
    k.register('mod+shift+z', () => editor.history.redo(), 'Redo'),
    k.register('mod+y', () => editor.history.redo(), 'Redo'),
    k.register('delete', () => editor.ops.deleteSelection(), 'Delete'),
    k.register('backspace', () => editor.ops.deleteSelection(), 'Delete'),
    k.register('mod+d', () => void editor.ops.duplicateNodes(sel()), 'Duplicate'),
    k.register('mod+g', () => void editor.ops.groupSelection(), 'Group'),
    k.register('mod+shift+g', () => editor.ops.ungroupSelection(), 'Ungroup'),
    k.register('mod+alt+f', () => void editor.ops.frameSelection(), 'Frame selection'),
    k.register(
      'mod+alt+k',
      () => void editor.ops.createComponentFromSelection(),
      'Create component',
    ),
    k.register(
      'shift+a',
      () => {
        for (const id of sel()) {
          const n = editor.graph.getNode(id);
          if (n && 'layout' in n)
            editor.ops.setLayout(id, { mode: n.layout.mode === 'NONE' ? 'VERTICAL' : 'NONE' });
        }
      },
      'Toggle auto layout',
    ),
    k.register(
      'mod+a',
      () => {
        const page = editor.currentPageId;
        if (!page) return;
        editor.selection.set(
          editor.graph
            .getChildren(page)
            .filter((n) => n.visible && !n.locked)
            .map((n) => n.id),
        );
      },
      'Select all',
    ),
    k.register('escape', () => editor.selection.clear(), 'Deselect'),
    k.register('up', () => editor.ops.nudgeSelection(0, -1), 'Nudge up'),
    k.register('down', () => editor.ops.nudgeSelection(0, 1), 'Nudge down'),
    k.register('left', () => editor.ops.nudgeSelection(-1, 0), 'Nudge left'),
    k.register('right', () => editor.ops.nudgeSelection(1, 0), 'Nudge right'),
    k.register('shift+up', () => editor.ops.nudgeSelection(0, -10), 'Nudge up 10'),
    k.register('shift+down', () => editor.ops.nudgeSelection(0, 10), 'Nudge down 10'),
    k.register('shift+left', () => editor.ops.nudgeSelection(-10, 0), 'Nudge left 10'),
    k.register('shift+right', () => editor.ops.nudgeSelection(10, 0), 'Nudge right 10'),
    k.register('mod+]', () => editor.ops.bringForward(sel()), 'Bring forward'),
    k.register('mod+[', () => editor.ops.sendBackward(sel()), 'Send backward'),
    k.register('mod+alt+]', () => editor.ops.bringToFront(sel()), 'Bring to front'),
    k.register('mod+alt+[', () => editor.ops.sendToBack(sel()), 'Send to back'),
    k.register('mod+shift+h', () => editor.ops.flipSelection('horizontal'), 'Flip horizontal'),
    k.register('mod+shift+v', () => editor.ops.flipSelection('vertical'), 'Flip vertical'),
    k.register(
      'mod+shift+l',
      () => {
        const ids = sel();
        const anyUnlocked = ids.some((id) => !editor.graph.getNode(id)?.locked);
        editor.ops.setLocked(ids, anyUnlocked);
      },
      'Toggle lock',
    ),
    k.register(
      'mod+shift+.',
      () => {
        const ids = sel();
        const anyVisible = ids.some((id) => editor.graph.getNode(id)?.visible);
        editor.ops.setVisible(ids, !anyVisible);
      },
      'Toggle visibility',
    ),
    k.register('mod+c', () => editor.clipboard.copy(), 'Copy'),
    k.register('mod+x', () => editor.clipboard.cut(), 'Cut'),
    k.register('mod+v', () => void editor.clipboard.paste(), 'Paste'),
    k.register('mod+0', () => editor.zoomTo(1), 'Zoom to 100%'),
    k.register('mod+1', () => editor.zoomToFit(), 'Zoom to fit'),
    k.register('mod+2', () => editor.zoomToSelection(), 'Zoom to selection'),
    k.register('mod+=', () => editor.viewport.zoomBy(1.25, editor.lastPointerScreen), 'Zoom in'),
    k.register('mod++', () => editor.viewport.zoomBy(1.25, editor.lastPointerScreen), 'Zoom in'),
    k.register('mod+-', () => editor.viewport.zoomBy(0.8, editor.lastPointerScreen), 'Zoom out'),
    k.register(
      "mod+'",
      () => editor.updateSettings({ showPixelGrid: !editor.settings.showPixelGrid }),
      'Toggle pixel grid',
    ),
    k.register(
      'mod+shift+r',
      () => editor.updateSettings({ showRulers: !editor.settings.showRulers }),
      'Toggle rulers',
    ),
    k.register(
      'mod+shift+\\',
      () => editor.updateSettings({ showGrid: !editor.settings.showGrid }),
      'Toggle grid',
    ),
    k.register(
      'enter',
      () => {
        const id = editor.selection.first as NodeId | null;
        const type = id ? editor.graph.getNode(id)?.type : undefined;
        if (id && type === 'TEXT') editor.requestTextEdit(id);
        else if (
          id &&
          (type === 'VECTOR' ||
            type === 'RECTANGLE' ||
            type === 'ELLIPSE' ||
            type === 'POLYGON' ||
            type === 'STAR' ||
            type === 'LINE')
        )
          editor.ops.editVector(id);
        else if (id) {
          // Enter drills into a group/frame: select its first child.
          const child = editor.graph.getChildIds(id)[0];
          if (child) editor.selection.set([child]);
        }
      },
      'Edit text / enter group',
    ),
    k.register(
      'shift+enter',
      () => {
        const id = editor.selection.first as NodeId | null;
        const parent = id ? editor.graph.getParent(id) : null;
        if (parent && parent.type !== 'PAGE') editor.selection.set([parent.id]);
      },
      'Select parent',
    ),
  ];
  return () => offs.forEach((off) => off());
}
