import { Grid3x3, Magnet, Maximize2, Minus, Plus, Ruler } from 'lucide-react';
import { useEditor } from '../editor-context';
import {
  useDocumentRevision,
  useEditorSettings,
  useEditorValue,
  useSelectionIds,
  useViewportState,
} from '../hooks';

export function StatusBar() {
  const editor = useEditor();
  const zoomKey = useViewportState();
  const settings = useEditorSettings();
  const selection = useSelectionIds();
  const revision = useDocumentRevision();
  const stats = useEditorValue((e) => e, ['render']);
  void zoomKey;
  void revision;
  void stats;
  const zoom = Math.round(editor.viewport.zoom * 100);
  const nodeCount = editor.currentPageId
    ? editor.graph.getDescendantIds(editor.currentPageId).length
    : 0;

  return (
    <footer className="flex items-center justify-between border-t border-ink-700 bg-ink-850 px-2 text-[11px] text-ink-400">
      <div className="flex items-center gap-3">
        <span>{nodeCount} layers</span>
        <span>{selection.length ? `${selection.length} selected` : 'Nothing selected'}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="icon-btn h-6 w-6"
          data-active={settings.showRulers}
          title="Rulers (⇧⌘R)"
          onClick={() => editor.updateSettings({ showRulers: !settings.showRulers })}
        >
          <Ruler size={13} />
        </button>
        <button
          className="icon-btn h-6 w-6"
          data-active={settings.showGrid}
          title="Layout grid (⇧⌘\\)"
          onClick={() => editor.updateSettings({ showGrid: !settings.showGrid })}
        >
          <Grid3x3 size={13} />
        </button>
        <button
          className="icon-btn h-6 w-6"
          data-active={settings.snapToObjects}
          title="Snap to objects"
          onClick={() => editor.updateSettings({ snapToObjects: !settings.snapToObjects })}
        >
          <Magnet size={13} />
        </button>
        <span className="mx-1 h-4 w-px bg-ink-700" />
        <button
          className="icon-btn h-6 w-6"
          title="Zoom out (⌘-)"
          onClick={() => editor.viewport.zoomBy(0.8)}
        >
          <Minus size={13} />
        </button>
        <input
          className="field h-6 w-14 text-center"
          value={`${zoom}%`}
          onChange={() => undefined}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const v = parseFloat(e.currentTarget.value);
              if (!Number.isNaN(v) && v > 0) editor.zoomTo(v / 100);
              e.currentTarget.blur();
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          readOnly={false}
        />
        <button
          className="icon-btn h-6 w-6"
          title="Zoom in (⌘+)"
          onClick={() => editor.viewport.zoomBy(1.25)}
        >
          <Plus size={13} />
        </button>
        <button
          className="icon-btn h-6 w-6"
          title="Zoom to fit (⌘1)"
          onClick={() => editor.zoomToFit()}
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </footer>
  );
}
