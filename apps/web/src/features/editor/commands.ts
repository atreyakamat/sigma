import type { Editor } from '@sigma/engine';
import type { DefaultTools } from '@sigma/tools';

export interface EditorCommand {
  id: string;
  title: string;
  group: 'Tools' | 'Edit' | 'Arrange' | 'View' | 'File' | 'Help';
  shortcut?: string;
  keywords?: string;
  enabled?: () => boolean;
  run: () => void;
}

export const FRAME_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'iPhone 15', width: 393, height: 852 },
  { name: 'Android', width: 412, height: 915 },
  { name: 'Tablet', width: 834, height: 1194 },
  { name: 'Desktop', width: 1440, height: 1024 },
  { name: 'Social square', width: 1080, height: 1080 },
  { name: 'Slide 16:9', width: 1920, height: 1080 },
];

export interface CommandHost {
  openExport(): void;
  openShortcuts(): void;
  openHistory(): void;
  openVersions(): void;
  saveCheckpoint(): void;
  readOnly: boolean;
}

/** Everything the command palette can run. Built from the engine so it stays in sync with it. */
export function buildCommands(
  editor: Editor,
  tools: DefaultTools,
  host: CommandHost,
): EditorCommand[] {
  const sel = () => editor.selection.ids;
  const hasSel = () => editor.selection.size > 0;
  const writable = () => !host.readOnly;
  const list: EditorCommand[] = [];

  for (const tool of editor.tools.list()) {
    if (host.readOnly && tool.id !== 'select' && tool.id !== 'hand') continue;
    list.push({
      id: `tool:${tool.id}`,
      title: `${tool.name} tool`,
      group: 'Tools',
      shortcut: tool.shortcut?.toUpperCase(),
      run: () => editor.tools.activate(tool.id),
    });
  }
  if (!host.readOnly) {
    for (const p of FRAME_PRESETS) {
      list.push({
        id: `frame:${p.name}`,
        title: `New frame: ${p.name} (${p.width}×${p.height})`,
        group: 'Tools',
        keywords: 'device preset artboard',
        run: () => {
          editor.defaults.frameSize = { width: p.width, height: p.height };
          const c = editor.viewport.screenToWorld({
            x: editor.viewport.width / 2,
            y: editor.viewport.height / 2,
          });
          editor.ops.createNode('FRAME', {
            name: p.name,
            transform: {
              x: Math.round(c.x - p.width / 2),
              y: Math.round(c.y - p.height / 2),
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            size: { width: p.width, height: p.height },
          });
        },
      });
    }
  }

  const edit: EditorCommand[] = [
    {
      id: 'undo',
      title: 'Undo',
      group: 'Edit',
      shortcut: '⌘Z',
      enabled: () => writable() && editor.history.canUndo,
      run: () => editor.history.undo(),
    },
    {
      id: 'redo',
      title: 'Redo',
      group: 'Edit',
      shortcut: '⇧⌘Z',
      enabled: () => writable() && editor.history.canRedo,
      run: () => editor.history.redo(),
    },
    {
      id: 'copy',
      title: 'Copy',
      group: 'Edit',
      shortcut: '⌘C',
      enabled: hasSel,
      run: () => editor.clipboard.copy(),
    },
    {
      id: 'paste',
      title: 'Paste',
      group: 'Edit',
      shortcut: '⌘V',
      enabled: () => writable() && !editor.clipboard.isEmpty,
      run: () => editor.clipboard.paste(),
    },
    {
      id: 'duplicate',
      title: 'Duplicate',
      group: 'Edit',
      shortcut: '⌘D',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.duplicateNodes(sel()),
    },
    {
      id: 'delete',
      title: 'Delete',
      group: 'Edit',
      shortcut: '⌫',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.deleteSelection(),
    },
    {
      id: 'select-all',
      title: 'Select all',
      group: 'Edit',
      shortcut: '⌘A',
      run: () =>
        editor.selection.set(editor.graph.getChildren(editor.currentPageId!).map((n) => n.id)),
    },
    {
      id: 'rename',
      title: 'Rename layer',
      group: 'Edit',
      enabled: () => writable() && editor.selection.size === 1,
      run: () => {
        const id = editor.selection.first!;
        const n = prompt('Rename layer', editor.graph.getNode(id)?.name);
        if (n?.trim()) editor.ops.rename(id, n.trim());
      },
    },
    {
      id: 'group',
      title: 'Group selection',
      group: 'Arrange',
      shortcut: '⌘G',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.groupSelection(),
    },
    {
      id: 'ungroup',
      title: 'Ungroup',
      group: 'Arrange',
      shortcut: '⇧⌘G',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.ungroupSelection(),
    },
    {
      id: 'frame-sel',
      title: 'Frame selection',
      group: 'Arrange',
      shortcut: '⌥⌘K',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.frameSelection(),
    },
    {
      id: 'front',
      title: 'Bring to front',
      group: 'Arrange',
      shortcut: '⌥⌘]',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.bringToFront(sel()),
    },
    {
      id: 'back',
      title: 'Send to back',
      group: 'Arrange',
      shortcut: '⌥⌘[',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.sendToBack(sel()),
    },
    {
      id: 'flip-h',
      title: 'Flip horizontal',
      group: 'Arrange',
      shortcut: '⇧⌘H',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.flipSelection('horizontal'),
    },
    {
      id: 'flip-v',
      title: 'Flip vertical',
      group: 'Arrange',
      shortcut: '⇧⌘V',
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.flipSelection('vertical'),
    },
    ...(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const).map((m) => ({
      id: `align-${m}`,
      title: `Align ${m.replace('hcenter', 'horizontal centers').replace('vcenter', 'vertical centers')}`,
      group: 'Arrange' as const,
      enabled: () => writable() && hasSel(),
      run: () => editor.ops.align(sel(), m),
    })),
    {
      id: 'dist-h',
      title: 'Distribute horizontally',
      group: 'Arrange',
      enabled: () => writable() && editor.selection.size >= 3,
      run: () => editor.ops.distribute(sel(), 'horizontal'),
    },
    {
      id: 'dist-v',
      title: 'Distribute vertically',
      group: 'Arrange',
      enabled: () => writable() && editor.selection.size >= 3,
      run: () => editor.ops.distribute(sel(), 'vertical'),
    },
    {
      id: 'lock',
      title: 'Lock / unlock selection',
      group: 'Arrange',
      shortcut: '⇧⌘L',
      enabled: () => writable() && hasSel(),
      run: () =>
        editor.ops.setLocked(
          sel(),
          sel().some((id) => !editor.graph.getNode(id)?.locked),
        ),
    },
    {
      id: 'hide',
      title: 'Show / hide selection',
      group: 'Arrange',
      shortcut: '⇧⌘.',
      enabled: () => writable() && hasSel(),
      run: () =>
        editor.ops.setVisible(
          sel(),
          sel().some((id) => !editor.graph.getNode(id)?.visible),
        ),
    },
    {
      id: 'zoom-fit',
      title: 'Zoom to fit',
      group: 'View',
      shortcut: '⌘1',
      run: () => editor.zoomToFit(),
    },
    {
      id: 'zoom-sel',
      title: 'Zoom to selection',
      group: 'View',
      shortcut: '⌘2',
      enabled: hasSel,
      run: () => editor.zoomToSelection(),
    },
    {
      id: 'zoom-100',
      title: 'Zoom to 100%',
      group: 'View',
      shortcut: '⌘0',
      run: () => editor.zoomTo(1),
    },
    {
      id: 'rulers',
      title: 'Toggle rulers',
      group: 'View',
      shortcut: '⇧⌘R',
      run: () => editor.updateSettings({ showRulers: !editor.settings.showRulers }),
    },
    {
      id: 'grid',
      title: 'Toggle layout grid',
      group: 'View',
      shortcut: '⇧⌘\\',
      run: () => editor.updateSettings({ showGrid: !editor.settings.showGrid }),
    },
    {
      id: 'pixel-grid',
      title: 'Toggle pixel grid',
      group: 'View',
      shortcut: "⌘'",
      run: () => editor.updateSettings({ showPixelGrid: !editor.settings.showPixelGrid }),
    },
    {
      id: 'snap',
      title: 'Toggle snapping to objects',
      group: 'View',
      run: () => editor.updateSettings({ snapToObjects: !editor.settings.snapToObjects }),
    },
    {
      id: 'add-page',
      title: 'Add page',
      group: 'File',
      enabled: writable,
      run: () => editor.ops.addPage(),
    },
    { id: 'export', title: 'Export PNG / SVG / JSON…', group: 'File', run: host.openExport },
    {
      id: 'checkpoint',
      title: 'Save a named version (checkpoint)…',
      group: 'File',
      enabled: writable,
      run: host.saveCheckpoint,
    },
    { id: 'versions', title: 'Version history…', group: 'File', run: host.openVersions },
    { id: 'history', title: 'Undo history panel', group: 'View', run: host.openHistory },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      group: 'Help',
      shortcut: '?',
      run: host.openShortcuts,
    },
  ];
  list.push(...edit);
  void tools;
  return list;
}

/** Simple subsequence fuzzy match with a score (lower is better); null when no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return t.indexOf(q);
  let ti = 0;
  let score = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx === -1) return null;
    score += idx - ti;
    ti = idx + 1;
  }
  return 100 + score;
}
