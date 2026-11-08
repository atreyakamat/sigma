import { Plus, Trash2 } from 'lucide-react';
import type { NodeId } from '@sigma/shared';
import { useEditor, useReadOnly } from '../editor-context';
import { useCurrentPageId, useDocumentRevision } from '../hooks';

export function PagesPanel() {
  const editor = useEditor();
  const readOnly = useReadOnly();
  const current = useCurrentPageId();
  const revision = useDocumentRevision();
  void revision;
  const pages = editor.graph.pages;
  return (
    <div>
      <div className="panel-title">
        <span>Pages</span>
        {!readOnly && (
          <button
            className="icon-btn h-6 w-6"
            title="Add page"
            onClick={() => editor.ops.addPage()}
          >
            <Plus size={13} />
          </button>
        )}
      </div>
      <ul>
        {pages.map((p) => (
          <li
            key={p.id}
            className={`group flex h-7 items-center gap-2 px-3 text-[12px] ${p.id === current ? 'bg-select-500/25' : 'hover:bg-ink-750'}`}
            onClick={() => editor.setPage(p.id)}
            onDoubleClick={() => {
              if (readOnly) return;
              const name = prompt('Rename page', p.name);
              if (name && name.trim()) editor.ops.rename(p.id, name.trim());
            }}
          >
            <span className="flex-1 truncate">{p.name}</span>
            <button
              className="icon-btn h-5 w-5 opacity-0 group-hover:opacity-100"
              disabled={pages.length <= 1 || readOnly}
              title="Delete page"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete page "${p.name}" and everything on it?`))
                  editor.ops.deletePage(p.id as NodeId);
              }}
            >
              <Trash2 size={11} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
