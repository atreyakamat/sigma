import { useEffect, useRef, useState } from 'react';
import type { NodeId } from '@sigma/shared';
import { decodeImageFile } from '@sigma/import-export';
import { useEditorContext } from '../editor-context';
import { useEditorEvent } from '../hooks';
import { useEditorUi } from '../store';
import { ContextMenu } from './ContextMenu';
import { TextEditOverlay } from './TextEditOverlay';

/** Mounts the engine's canvases and hosts DOM overlays (text editing, context menu, drop zone). */
export function CanvasHost() {
  const { editor, tools, readOnly } = useEditorContext();
  const ref = useRef<HTMLDivElement>(null);
  const [editingText, setEditingText] = useState<NodeId | null>(null);
  const [dropping, setDropping] = useState(false);
  const { contextMenu, openContextMenu } = useEditorUi();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    editor.mount(el);
    editor.zoomToFit();
    return () => editor.unmount();
  }, [editor]);

  useEditorEvent('textEdit', ({ id }) => !readOnly && setEditingText(id));

  // Image tool asks the host for a file when activated with nothing pending.
  useEffect(() => {
    tools.image.onRequestImage = () => fileInput.current?.click();
    return () => {
      tools.image.onRequestImage = null;
    };
  }, [tools]);

  const placeFiles = async (files: FileList | File[], at?: { x: number; y: number }) => {
    for (const file of Array.from(files)) {
      try {
        const img = await decodeImageFile(file);
        const pending = {
          src: img.dataUrl,
          width: img.width,
          height: img.height,
          name: file.name.replace(/\.[^.]+$/, ''),
        };
        const screen = at ?? { x: editor.viewport.width / 2, y: editor.viewport.height / 2 };
        tools.image.placeAt(editor.viewport.screenToWorld(screen), pending);
        editor.tools.activate('select');
      } catch (e) {
        alert((e as Error).message);
      }
    }
  };

  return (
    <div
      className="relative h-full min-h-0 min-w-0 bg-ink-800"
      onContextMenu={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
        const hit = editor.hitTester.hitTest(editor.viewport.screenToWorld(screen), {
          tolerance: editor.worldTolerance(),
        });
        if (hit && !editor.selection.has(hit.id)) editor.selection.set([hit.id]);
        openContextMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const r = e.currentTarget.getBoundingClientRect();
        void placeFiles(e.dataTransfer.files, { x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      <div ref={ref} className="absolute inset-0" data-testid="canvas-host" />
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void placeFiles(e.target.files);
          else editor.tools.activate('select');
          e.target.value = '';
        }}
      />
      {editingText && <TextEditOverlay nodeId={editingText} onClose={() => setEditingText(null)} />}
      {contextMenu && <ContextMenu position={contextMenu} onClose={() => openContextMenu(null)} />}
      {dropping && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-500/10 text-[13px] text-accent-400">
          Drop images to place them
        </div>
      )}
    </div>
  );
}
