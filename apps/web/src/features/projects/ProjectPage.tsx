import { Copy, FileUp, MoreHorizontal, Plus, Trash2, Type } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { importSvg, parseDocumentFile } from '@sigma/import-export';
import { SceneGraph } from '@sigma/document';
import type { DocumentSummaryDto } from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import { documentRepository } from '../../lib/api-document-repository';
import { keys, useApiMutation, useDocuments, useProject, useWorkspace } from '../../lib/queries';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function ProjectPage() {
  const { workspaceId = '', projectId = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace(workspaceId);
  const project = useProject(projectId);
  const docs = useDocuments(projectId);
  const fileInput = useRef<HTMLInputElement>(null);
  const role = ws.data?.role;
  const canWrite = roleHas(role, 'document.write');
  const inv = [keys.documents(projectId)];
  const create = useApiMutation(
    () => documentRepository.create(projectId, 'Untitled'),
    inv,
    (d) => navigate(`/file/${d.id}`),
  );
  const importFile = useApiMutation(
    async (file: File) => {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml') {
        const { nodes } = importSvg(text);
        const graph = SceneGraph.createEmpty(file.name.replace(/\.svg$/i, ''));
        const page = graph.pageIds[0]!;
        for (const n of nodes) graph.insertSubtreeJSON(n, page);
        return documentRepository.create(projectId, graph.name, graph.toJSON());
      }
      const content = parseDocumentFile(text);
      return documentRepository.create(projectId, content.name, content);
    },
    inv,
    (d) => navigate(`/file/${d.id}`),
  );
  const remove = useApiMutation((id: string) => documentRepository.remove(id), inv);
  const duplicate = useApiMutation((id: string) => documentRepository.duplicate(id), inv);
  const rename = useApiMutation(
    ({ id, name }: { id: string; name: string }) => documentRepository.rename(id, name),
    inv,
  );

  if (ws.isLoading || project.isLoading) return <div className="p-8 text-ink-400">Loading…</div>;
  if (!ws.data || !project.data) return <div className="p-8 text-ink-400">Project not found.</div>;

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader
        crumbs={[{ label: ws.data.name, to: `/w/${workspaceId}` }, { label: project.data.name }]}
        actions={
          canWrite ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.svg,application/json,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile.mutate(f);
                  e.target.value = '';
                }}
              />
              <Button variant="ghost" onClick={() => fileInput.current?.click()}>
                <FileUp size={14} /> Import .sigma.json / .svg
              </Button>
              <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus size={14} /> New design file
              </Button>
            </>
          ) : null
        }
      />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{project.data.name}</h1>
          <p className="mt-1 text-[12px] text-ink-400">
            {canWrite
              ? 'Files autosave while you edit.'
              : 'You have view-only access to this workspace.'}
          </p>
        </div>
        {docs.data?.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {docs.data.map((d) => (
              <FileCard
                key={d.id}
                doc={d}
                canWrite={canWrite}
                onDelete={() => confirm(`Delete "${d.name}"?`) && remove.mutate(d.id)}
                onDuplicate={() => duplicate.mutate(d.id)}
                onRename={() => {
                  const n = prompt('Rename file', d.name);
                  if (n && n.trim()) rename.mutate({ id: d.id, name: n.trim() });
                }}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-600 py-20 text-center text-ink-400">
            {docs.isLoading ? 'Loading…' : 'No design files yet.'}
          </div>
        )}
      </main>
    </div>
  );
}

function FileCard({
  doc,
  canWrite,
  onDelete,
  onDuplicate,
  onRename,
}: {
  doc: DocumentSummaryDto;
  canWrite: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onRename: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <li className="group relative overflow-hidden rounded-xl border border-ink-700 bg-ink-850 transition-colors hover:border-ink-500">
      <Link to={`/file/${doc.id}`} className="block">
        <div className="flex h-36 items-center justify-center bg-[linear-gradient(135deg,#1c1c22,#24242b)]">
          {doc.thumbnailUrl ? (
            <img src={doc.thumbnailUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-ink-500">Empty canvas</span>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="truncate text-[13px] font-medium">{doc.name}</div>
          <div className="mt-0.5 text-[11px] text-ink-400">
            Edited {timeAgo(doc.updatedAt)} · {Math.max(0, doc.nodeCount - 1)} layers
          </div>
        </div>
      </Link>
      {canWrite && (
        <>
          <button
            className="icon-btn absolute right-2 top-2 bg-ink-900/70 opacity-0 group-hover:opacity-100 data-[open=true]:opacity-100"
            data-open={menu}
            onClick={() => setMenu((m) => !m)}
            aria-label="File actions"
          >
            <MoreHorizontal size={14} />
          </button>
          {menu && (
            <div
              className="absolute right-2 top-10 z-10 w-40 rounded-md border border-ink-600 bg-ink-800 p-1 shadow-xl"
              onMouseLeave={() => setMenu(false)}
            >
              {[
                { icon: <Type size={13} />, label: 'Rename', fn: onRename },
                { icon: <Copy size={13} />, label: 'Duplicate', fn: onDuplicate },
                { icon: <Trash2 size={13} />, label: 'Delete', fn: onDelete, danger: true },
              ].map((it) => (
                <button
                  key={it.label}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-ink-700 ${it.danger ? 'text-red-300' : ''}`}
                  onClick={() => {
                    setMenu(false);
                    it.fn();
                  }}
                >
                  {it.icon} {it.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}
export { toast };
