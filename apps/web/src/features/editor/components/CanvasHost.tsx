import { useEffect, useRef, useState } from 'react';
import type { NodeId } from '@sigma/shared';
import { decodeImageFile, importSvg } from '@sigma/import-export';
import { toast } from '../../../components/ui/toast';
import { useEditorContext } from '../editor-context';
import { useEditorEvent } from '../hooks';
import { useEditorUi } from '../store';
import { ContextMenu } from './ContextMenu';
import { TextEditOverlay } from './TextEditOverlay';

/** Mounts the engine's canvases and hosts DOM overlays (text editing, context menu, drop zone). */
export function CanvasHost() {
  const { editor, tools, readOnly, meta } = useEditorContext();
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
  useEffect(() => {
    const open = () => svgInput.current?.click();
    window.addEventListener('sigma:import-svg', open);
    return () => window.removeEventListener('sigma:import-svg', open);
  }, []);
  const svgInput = useRef<HTMLInputElement>(null);

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
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
          const { nodes, width, height } = importSvg(await file.text());
          const screen = at ?? { x: editor.viewport.width / 2, y: editor.viewport.height / 2 };
          const world = editor.viewport.screenToWorld(screen);
          const ids = editor.ops.insertJSON(nodes, editor.currentPageId, {
            x: Math.round(world.x - width / 2),
            y: Math.round(world.y - height / 2),
          });
          if (ids.length > 1) editor.ops.groupSelection();
          toast.success(
            `Imported ${nodes.length} layer${nodes.length === 1 ? '' : 's'} from ${file.name}`,
          );
          continue;
        }
        const img = await decodeImageFile(file);
        let src = img.dataUrl;
        let assetId: string | null = null;
        try {
          const form = new FormData();
          form.append('file', file, file.name);
          const res = await fetch(`/api/v1/workspaces/${meta.workspaceId}/assets`, {
            method: 'POST',
            body: form,
            credentials: 'include',
          });
          if (res.ok) {
            const asset = (await res.json()) as { id: string; url: string };
            src = asset.url;
            assetId = asset.id;
          } else {
            toast.info('Upload failed; the image is embedded in the file instead');
          }
        } catch {
          /* offline: keep the embedded data URL */
        }
        const pending = {
          src,
          assetId,
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
      <input
        ref={svgInput}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void placeFiles(e.target.files);
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
