import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { DocumentJSON } from '@sigma/document';
import { SceneGraph, diffDocuments } from '@sigma/document';
import { exportPngDataUrl } from '@sigma/engine';
import type { NodeId } from '@sigma/shared';
import type { VersionContentDto, VersionDto } from '@sigma/validation';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { toast } from '../../../components/ui/toast';
import { http } from '../../../lib/api';
import { errorText, useApiMutation } from '../../../lib/queries';
import { useEditorContext } from '../editor-context';

function thumb(doc: DocumentJSON): string {
  try {
    const g = SceneGraph.fromJSON(doc);
    const page = g.pageIds[0] as NodeId;
    return g.getChildIds(page).length
      ? exportPngDataUrl(g, [page], { scale: 0.2, background: '#ffffff' })
      : '';
  } catch {
    return '';
  }
}

/** Version history: named checkpoints, automatic hourly snapshots, visual diff and restore. */
export function VersionsPanel({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: (revision: number) => void;
}) {
  const { editor, meta, readOnly } = useEditorContext();
  const key = ['versions', meta.documentId];
  const versions = useQuery({
    queryKey: key,
    queryFn: () => http.get<VersionDto[]>(`/documents/${meta.documentId}/versions`),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const create = useApiMutation(
    (l: string) => http.post<VersionDto>(`/documents/${meta.documentId}/versions`, { label: l }),
    [key],
    () => {
      setLabel('');
      toast.success('Checkpoint saved');
    },
  );
  const restore = useApiMutation(
    (id: string) =>
      http.post<{ revision: number }>(`/documents/${meta.documentId}/versions/${id}/restore`),
    [key],
    (r) => onRestored(r.revision),
  );
  const detail = useQuery({
    queryKey: ['version', meta.documentId, selected],
    queryFn: () =>
      http.get<VersionContentDto>(`/documents/${meta.documentId}/versions/${selected}`),
    enabled: !!selected,
  });

  const current = useMemo(() => editor.toJSON(), [editor]);
  const currentThumb = useMemo(() => thumb(current), [current]);
  const versionThumb = useMemo(
    () => (detail.data ? thumb(detail.data.content) : ''),
    [detail.data],
  );
  const diff = useMemo(
    () => (detail.data ? diffDocuments(detail.data.content, current) : null),
    [detail.data, current],
  );

  const fmt = (iso: string) => new Date(iso).toLocaleString();

  return (
    <Modal title="Version history" onClose={onClose} width="w-[56rem]">
      <div className="grid grid-cols-[18rem_1fr] gap-4">
        <div>
          {!readOnly && (
            <form
              className="mb-3 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim()) create.mutate(label.trim());
              }}
            >
              <input
                className="field h-8"
                placeholder="Name this version…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') onClose();
                }}
              />
              <Button
                type="submit"
                variant="primary"
                className="h-8"
                disabled={!label.trim() || create.isPending}
              >
                Save
              </Button>
            </form>
          )}
          <ul className="max-h-[55vh] overflow-y-auto scrollbar-thin" data-testid="versions-list">
            {versions.data?.length === 0 && (
              <li className="text-ink-500">
                No versions yet. Versions are saved automatically every hour while you edit, or by
                name here.
              </li>
            )}
            {versions.data?.map((v) => (
              <li
                key={v.id}
                className={`cursor-default rounded px-2 py-1.5 text-[12px] hover:bg-ink-750 ${selected === v.id ? 'bg-ink-700' : ''}`}
                onClick={() => setSelected(v.id)}
              >
                <div className="flex items-center justify-between">
                  <span className={v.automatic ? 'text-ink-400' : 'font-medium'}>
                    {v.label ?? 'Automatic'}
                  </span>
                  <span className="text-[10px] text-ink-500">r{v.revision}</span>
                </div>
                <div className="text-[11px] text-ink-500">
                  {fmt(v.createdAt)} · {v.createdByName} · {Math.max(0, v.nodeCount - 1)} layers
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          {!selected ? (
            <div className="flex h-full min-h-[20rem] items-center justify-center text-ink-500">
              Select a version to compare it with the current file.
            </div>
          ) : detail.isLoading || !detail.data ? (
            <div className="text-ink-400">
              {detail.error ? errorText(detail.error) : 'Loading…'}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <figure>
                  <figcaption className="mb-1 text-[11px] text-ink-400">
                    {detail.data.label ?? 'Automatic version'} · r{detail.data.revision}
                  </figcaption>
                  <div className="flex h-40 items-center justify-center rounded-md bg-ink-800 ring-1 ring-ink-700">
                    {versionThumb ? (
                      <img src={versionThumb} alt="" className="max-h-full max-w-full" />
                    ) : (
                      <span className="text-ink-500">empty</span>
                    )}
                  </div>
                </figure>
                <figure>
                  <figcaption className="mb-1 text-[11px] text-ink-400">Current</figcaption>
                  <div className="flex h-40 items-center justify-center rounded-md bg-ink-800 ring-1 ring-ink-700">
                    {currentThumb ? (
                      <img src={currentThumb} alt="" className="max-h-full max-w-full" />
                    ) : (
                      <span className="text-ink-500">empty</span>
                    )}
                  </div>
                </figure>
              </div>
              {diff && (
                <div className="mt-3 text-[12px]" data-testid="version-diff">
                  <div className="mb-1 text-ink-300">
                    Since this version:{' '}
                    <strong className="text-emerald-300">{diff.added} added</strong>,{' '}
                    <strong className="text-red-300">{diff.removed} removed</strong>,{' '}
                    <strong className="text-amber-300">{diff.modified} modified</strong>,{' '}
                    {diff.moved} moved
                  </div>
                  <ul className="max-h-40 overflow-y-auto rounded-md bg-ink-800 p-2 scrollbar-thin">
                    {diff.changes.length === 0 && <li className="text-ink-500">No differences.</li>}
                    {diff.changes.slice(0, 200).map((c) => (
                      <li key={c.id} className="flex items-center gap-2 py-0.5">
                        <span
                          className={`w-16 text-[10px] uppercase ${c.kind === 'added' ? 'text-emerald-300' : c.kind === 'removed' ? 'text-red-300' : 'text-amber-300'}`}
                        >
                          {c.kind}
                        </span>
                        <button
                          className="truncate hover:underline"
                          onClick={() =>
                            c.kind !== 'removed' &&
                            editor.graph.hasNode(c.id) &&
                            (editor.selection.set([c.id]), editor.zoomToSelection())
                          }
                        >
                          {c.name || c.type}
                        </button>
                        {c.fields.length > 0 && (
                          <span className="truncate text-[10px] text-ink-500">
                            {c.fields.join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!readOnly && (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="primary"
                    disabled={restore.isPending}
                    onClick={() =>
                      confirm(
                        'Restore this version? The current state is saved as a version first.',
                      ) && restore.mutate(selected)
                    }
                  >
                    Restore this version
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
