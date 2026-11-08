import {
  ChevronDown,
  Component,
  ChevronRight,
  Eye,
  EyeOff,
  Frame,
  Group,
  Image as ImageIcon,
  Lock,
  Minus,
  PenTool,
  Square,
  Circle,
  Star,
  Type,
  Unlock,
  Hexagon,
} from 'lucide-react';
import { useState } from 'react';
import type { SceneNode } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import { useEditor, useReadOnly } from '../editor-context';
import { useCurrentPageId, useDocumentRevision, useEditorValue, useSelectionIds } from '../hooks';

const ICONS: Record<SceneNode['type'], React.ComponentType<{ size?: number }>> = {
  PAGE: Frame,
  FRAME: Frame,
  GROUP: Group,
  RECTANGLE: Square,
  ELLIPSE: Circle,
  LINE: Minus,
  POLYGON: Hexagon,
  STAR: Star,
  TEXT: Type,
  IMAGE: ImageIcon,
  VECTOR: PenTool,
  COMPONENT: Component,
  COMPONENT_SET: Component,
  INSTANCE: Component,
};

type DropPos = 'before' | 'after' | 'inside';

export function LayersPanel() {
  const editor = useEditor();
  const readOnly = useReadOnly();
  const pageId = useCurrentPageId();
  const revision = useDocumentRevision();
  const selection = useSelectionIds();
  const hover = useEditorValue((e) => e.selection.hover, ['hover']);
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());
  const [filter, setFilter] = useState('');
  const [drag, setDrag] = useState<{ id: NodeId; over: NodeId | null; pos: DropPos } | null>(null);
  void revision;
  if (!pageId) return null;

  const toggleCollapse = (id: NodeId) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows: { node: SceneNode; depth: number }[] = [];
  const q = filter.trim().toLowerCase();
  const visit = (id: NodeId, depth: number) => {
    // Layers list top-most first (reverse of draw order).
    const children = [...editor.graph.getChildIds(id)].reverse();
    for (const cid of children) {
      const node = editor.graph.requireNode(cid);
      const matches =
        !q || node.name.toLowerCase().includes(q) || node.type.toLowerCase().includes(q);
      if (matches) rows.push({ node, depth });
      if (!collapsed.has(cid) || q) visit(cid, depth + 1);
    }
  };
  visit(pageId, 0);

  const onDrop = () => {
    if (!drag || !drag.over || drag.over === drag.id) return setDrag(null);
    const target = editor.graph.requireNode(drag.over);
    const graph = editor.graph;
    if (drag.pos === 'inside') {
      editor.ops.reparent(drag.id, drag.over, graph.getChildIds(drag.over).length);
    } else {
      const parentId = target.parentId as NodeId;
      const siblings = graph.getChildIds(parentId);
      const ti = siblings.indexOf(drag.over);
      // List is reversed: "before" in the list means above = higher index.
      let index = drag.pos === 'before' ? ti + 1 : ti;
      const movingFromSameParent = graph.getNode(drag.id)?.parentId === parentId;
      if (movingFromSameParent && siblings.indexOf(drag.id) < index) index -= 1;
      editor.ops.reparent(drag.id, parentId, index);
    }
    setDrag(null);
  };

  return (
    <div className="flex flex-col">
      <div className="px-2 pt-2">
        <input
          className="field h-6"
          placeholder="Search layers"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <ul className="py-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {rows.length === 0 && (
          <li className="px-3 py-4 text-ink-500">
            {q ? 'No matching layers' : 'Draw something to see layers here'}
          </li>
        )}
        {rows.map(({ node, depth }) => {
          const Icon = ICONS[node.type];
          const selected = selection.includes(node.id);
          const hasChildren = node.childIds.length > 0;
          const isCollapsed = collapsed.has(node.id);
          const dropHere = drag?.over === node.id ? drag.pos : null;
          return (
            <li
              key={node.id}
              draggable={!readOnly}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                setDrag({ id: node.id, over: null, pos: 'after' });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!drag || drag.id === node.id || editor.graph.isAncestorOf(drag.id, node.id))
                  return;
                const r = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const canContain = node.type === 'FRAME' || node.type === 'GROUP';
                const pos: DropPos =
                  y < 0.25
                    ? 'before'
                    : y > 0.75
                      ? 'after'
                      : canContain
                        ? 'inside'
                        : y < 0.5
                          ? 'before'
                          : 'after';
                if (drag.over !== node.id || drag.pos !== pos)
                  setDrag({ ...drag, over: node.id, pos });
              }}
              onDragEnd={() => setDrag(null)}
              onMouseEnter={() => editor.selection.setHover(node.id)}
              onMouseLeave={() => editor.selection.setHover(null)}
              onClick={(e) => {
                if (e.shiftKey) editor.selection.toggle(node.id);
                else editor.selection.set([node.id]);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (readOnly) return;
                const name = prompt('Rename layer', node.name);
                if (name !== null && name.trim()) editor.ops.rename(node.id, name.trim());
              }}
              className={`group relative flex h-7 cursor-default items-center gap-1 pr-1 text-[12px] ${selected ? 'bg-select-500/25 text-ink-100' : hover === node.id ? 'bg-ink-700/60' : 'hover:bg-ink-750'} ${!node.visible ? 'opacity-50' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {dropHere === 'before' && (
                <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent-500" />
              )}
              {dropHere === 'after' && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent-500" />
              )}
              {dropHere === 'inside' && (
                <span className="pointer-events-none absolute inset-0 rounded border border-accent-500" />
              )}
              <button
                className={`flex h-4 w-4 items-center justify-center text-ink-400 ${hasChildren ? '' : 'invisible'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(node.id);
                }}
              >
                {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              </button>
              <Icon size={12} />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
              {!readOnly && (
                <>
                  <button
                    className={`icon-btn h-5 w-5 ${node.locked ? '' : 'opacity-0 group-hover:opacity-100'}`}
                    title={node.locked ? 'Unlock' : 'Lock'}
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.ops.setLocked([node.id], !node.locked);
                    }}
                  >
                    {node.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button
                    className={`icon-btn h-5 w-5 ${node.visible ? 'opacity-0 group-hover:opacity-100' : ''}`}
                    title={node.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation();
                      editor.ops.setVisible([node.id], !node.visible);
                    }}
                  >
                    {node.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
