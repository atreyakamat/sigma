import { useQuery } from '@tanstack/react-query';
import { Component, Upload } from 'lucide-react';
import type { NodeJSON, SceneNode } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { LibraryComponentContentDto, LibraryComponentDto } from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../components/ui/toast';
import { http } from '../../../lib/api';
import { useApiMutation } from '../../../lib/queries';
import { useEditorContext } from '../editor-context';
import { useDocumentRevision } from '../hooks';

export const libraryKey = (workspaceId: string) => ['library', workspaceId] as const;

/** Components in this document and the workspace library; click to insert an instance. */
export function ComponentsPanel() {
  const { editor, meta, role, readOnly } = useEditorContext();
  const revision = useDocumentRevision();
  void revision;
  const library = useQuery({
    queryKey: libraryKey(meta.workspaceId),
    queryFn: () => http.get<LibraryComponentDto[]>(`/workspaces/${meta.workspaceId}/library`),
  });
  const publish = useApiMutation(
    (ids: string[]) =>
      http.post<LibraryComponentDto[]>(`/documents/${meta.documentId}/library/publish`, {
        componentIds: ids,
      }),
    [libraryKey(meta.workspaceId)],
    (r) => toast.success(`Published ${r.length} component${r.length === 1 ? '' : 's'}`),
  );

  const local: Extract<SceneNode, { type: 'COMPONENT' }>[] = [];
  for (const page of editor.graph.pageIds)
    editor.graph.traverse(page, (n) => {
      if (n.type === 'COMPONENT' && !editor.graph.isDerived(n.id)) local.push(n);
    });

  const insertLocal = (id: NodeId) => {
    const c = editor.viewport.screenToWorld({
      x: editor.viewport.width / 2,
      y: editor.viewport.height / 2,
    });
    const master = editor.graph.requireNode(id);
    editor.ops.createInstance(id, editor.currentPageId, {
      x: Math.round(c.x - master.size.width / 2),
      y: Math.round(c.y - master.size.height / 2),
    });
  };
  const insertFromLibrary = async (item: LibraryComponentDto) => {
    // A local master already imported from this library entry is reused; otherwise copy it in.
    let masterId =
      local.find((c) => (c.metadata as { library?: { id?: string } }).library?.id === item.id)
        ?.id ?? null;
    if (!masterId) {
      const full = await http.get<LibraryComponentContentDto>(`/library/${item.id}`);
      const node = full.content as NodeJSON;
      const c = editor.viewport.screenToWorld({ x: 40, y: 40 });
      const ids = editor.ops.insertJSON(
        [
          {
            ...node,
            transform: { ...node.transform, x: Math.round(c.x), y: Math.round(c.y) },
            metadata: {
              ...node.metadata,
              library: {
                id: item.id,
                workspaceId: item.workspaceId,
                sourceDocumentId: item.documentId,
                componentId: item.componentId,
                version: item.version,
              },
            },
          },
        ],
        editor.currentPageId,
      );
      masterId = ids[0] ?? null;
      if (!masterId) return;
    }
    insertLocal(masterId);
  };

  return (
    <div className="p-2 text-[12px]">
      <div className="panel-title px-1">
        <span>This file</span>
        {!readOnly && local.length > 0 && roleHas(role, 'document.write') && (
          <button
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-300 hover:bg-ink-700"
            title="Publish all components to the workspace library"
            onClick={() => publish.mutate(local.map((c) => c.id))}
          >
            <Upload size={11} className="mr-1 inline" />
            Publish all
          </button>
        )}
      </div>
      {local.length === 0 && (
        <div className="px-2 pb-2 text-ink-500">
          Select layers and press ⌥⌘K (or use ⌘K → “Create component”).
        </div>
      )}
      <ul>
        {local.map((c) => (
          <li
            key={c.id}
            className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-ink-750"
            data-testid={`component-${c.name}`}
          >
            <Component size={13} className="text-accent-400" />
            <button
              className="min-w-0 flex-1 truncate text-left"
              title="Select master"
              onClick={() => {
                editor.selection.set([c.id]);
                editor.zoomToSelection();
              }}
            >
              {c.name}
              {Object.keys(c.variantProps).length > 0 && (
                <span className="ml-1 text-[10px] text-ink-500">
                  {Object.entries(c.variantProps)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </span>
              )}
            </button>
            {!readOnly && (
              <Button
                variant="ghost"
                className="h-6 px-2 opacity-0 group-hover:opacity-100"
                onClick={() => insertLocal(c.id)}
              >
                Insert
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="panel-title mt-2 px-1">
        <span>Workspace library</span>
      </div>
      {library.data?.length === 0 && (
        <div className="px-2 pb-2 text-ink-500">Nothing published yet.</div>
      )}
      <ul>
        {library.data?.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-ink-750"
            data-testid={`library-${item.name}`}
          >
            <Component size={13} className="text-emerald-400" />
            <span className="min-w-0 flex-1 truncate" title={item.description}>
              {item.name} <span className="text-[10px] text-ink-500">v{item.version}</span>
            </span>
            {!readOnly && (
              <Button
                variant="ghost"
                className="h-6 px-2 opacity-0 group-hover:opacity-100"
                onClick={() => void insertFromLibrary(item)}
              >
                Insert
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
