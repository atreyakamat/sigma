import {
  ChevronDown,
  Command,
  HelpCircle,
  Play,
  Share2,
  Workflow,
  PenTool,
  Pencil,
  History,
  MessageSquare,
  Circle,
  Download,
  Frame,
  Hand,
  Hexagon,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Redo2,
  Square,
  Star,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useEditor, useEditorContext } from '../editor-context';
import { PresenceAvatars } from '../../collaboration/PresenceLayer';
import { useProject, useWorkspace } from '../../../lib/queries';
import { useActiveTool, useDocumentRevision, useHistoryState } from '../hooks';
import { useEditorUi } from '../store';
import { ExportMenu } from './ExportMenu';
import { ShareDialog } from './ShareDialog';

const SHAPES = [
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { id: 'line', label: 'Line', key: 'L', icon: Minus },
  { id: 'polygon', label: 'Polygon', key: '', icon: Hexagon },
  { id: 'star', label: 'Star', key: '', icon: Star },
];

export function Toolbar() {
  const editor = useEditor();
  const { readOnly, shared = false } = useEditorContext();
  const [shareOpen, setShareOpen] = useState(false);
  const active = useActiveTool();
  const history = useHistoryState();
  const revision = useDocumentRevision();
  const [canUndo, canRedo, undoName, redoName] = history.split('|');
  const {
    toggleLeft,
    toggleRight,
    leftOpen,
    rightOpen,
    exportOpen,
    setExportOpen,
    setPaletteOpen,
    setShortcutsOpen,
    setVersionsOpen,
    commentMode,
    setCommentMode,
    presenceUsers,
    presenceConnected,
    prototypeMode,
    setPrototypeMode,
  } = useEditorUi();
  const navigate = useNavigate();
  const [shapeOpen, setShapeOpen] = useState(false);
  const [lastShape, setLastShape] = useState('rectangle');
  const shapeRef = useRef<HTMLDivElement>(null);
  void revision;

  useEffect(() => {
    if (!shapeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!shapeRef.current?.contains(e.target as Node)) setShapeOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [shapeOpen]);

  const shapeActive = SHAPES.some((s) => s.id === active);
  const Shape = SHAPES.find((s) => s.id === (shapeActive ? active : lastShape)) ?? SHAPES[0]!;

  const ToolButton = ({
    id,
    label,
    keyHint,
    children,
  }: {
    id: string;
    label: string;
    keyHint?: string;
    children: React.ReactNode;
  }) => (
    <button
      className="icon-btn"
      data-active={active === id}
      title={keyHint ? `${label} (${keyHint})` : label}
      onClick={() => editor.tools.activate(id)}
    >
      {children}
    </button>
  );

  return (
    <header className="flex items-center justify-between border-b border-ink-700 bg-ink-850 px-2">
      <div className="flex items-center gap-1">
        <Link
          to="/"
          className="mr-1 flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink-700"
          title="Back to files"
        >
          <img src="/favicon.svg" alt="SIGMA" className="h-5 w-5" />
        </Link>
        <button
          className="icon-btn"
          data-active={leftOpen}
          onClick={toggleLeft}
          title="Toggle left panel"
        >
          <PanelLeft size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <ToolButton id="select" label="Select" keyHint="V">
          <MousePointer2 size={15} />
        </ToolButton>
        {!readOnly && (
          <>
            <ToolButton id="frame" label="Frame" keyHint="F">
              <Frame size={15} />
            </ToolButton>
            <div className="relative flex" ref={shapeRef}>
              <button
                className="icon-btn rounded-r-none"
                data-active={shapeActive}
                title={`${Shape.label}${Shape.key ? ` (${Shape.key})` : ''}`}
                onClick={() => {
                  setLastShape(Shape.id);
                  editor.tools.activate(Shape.id);
                }}
              >
                <Shape.icon size={15} />
              </button>
              <button
                className="icon-btn w-4 rounded-l-none"
                data-active={shapeActive}
                onClick={() => setShapeOpen((o) => !o)}
                title="More shapes"
              >
                <ChevronDown size={11} />
              </button>
              {shapeOpen && (
                <div className="absolute left-0 top-9 z-20 w-40 rounded-md border border-ink-600 bg-ink-800 p-1 shadow-xl">
                  {SHAPES.map((s) => (
                    <button
                      key={s.id}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[12px] hover:bg-ink-700"
                      onClick={() => {
                        setLastShape(s.id);
                        editor.tools.activate(s.id);
                        setShapeOpen(false);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <s.icon size={13} /> {s.label}
                      </span>
                      <span className="text-ink-400">{s.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ToolButton id="text" label="Text" keyHint="T">
              <Type size={15} />
            </ToolButton>
            <ToolButton id="pen" label="Pen" keyHint="P">
              <PenTool size={15} />
            </ToolButton>
            <ToolButton id="pencil" label="Pencil" keyHint="⇧P">
              <Pencil size={15} />
            </ToolButton>
            <ToolButton id="image" label="Place image">
              <ImageIcon size={15} />
            </ToolButton>
          </>
        )}
        <ToolButton id="hand" label="Hand" keyHint="H or Space">
          <Hand size={15} />
        </ToolButton>
        {!readOnly && (
          <>
            <span className="mx-1 h-5 w-px bg-ink-700" />
            <button
              className="icon-btn"
              disabled={canUndo !== 'true'}
              onClick={() => editor.history.undo()}
              title={undoName ? `Undo ${undoName} (⌘Z)` : 'Undo (⌘Z)'}
            >
              <Undo2 size={15} />
            </button>
            <button
              className="icon-btn"
              disabled={canRedo !== 'true'}
              onClick={() => editor.history.redo()}
              title={redoName ? `Redo ${redoName} (⇧⌘Z)` : 'Redo (⇧⌘Z)'}
            >
              <Redo2 size={15} />
            </button>
          </>
        )}
      </div>

      <DocumentTitle />

      <div className="flex items-center gap-1">
        {!shared && (
          <>
            <PresenceAvatars users={presenceUsers} connected={presenceConnected} />
            <span className="mx-1 h-5 w-px bg-ink-700" />
            <button
              className="icon-btn"
              data-active={commentMode}
              title="Add comment (C)"
              onClick={() => setCommentMode(!commentMode)}
            >
              <MessageSquare size={15} />
            </button>
          </>
        )}
        <button
          className="icon-btn"
          data-active={prototypeMode}
          title="Prototype connections"
          onClick={() => setPrototypeMode(!prototypeMode)}
        >
          <Workflow size={15} />
        </button>
        {!shared && (
          <>
            <button
              className="icon-btn"
              title="Preview prototype"
              data-testid="preview-button"
              onClick={() =>
                void navigate(`${window.location.pathname.replace(/\/$/, '')}/preview`)
              }
            >
              <Play size={15} />
            </button>
            <button
              className="icon-btn"
              title="Version history"
              onClick={() => setVersionsOpen(true)}
            >
              <History size={15} />
            </button>
          </>
        )}
        {!readOnly && (
          <button
            className="icon-btn"
            title="Share"
            data-testid="share-button"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={15} />
          </button>
        )}
        {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
        <button
          className="icon-btn"
          title="Command palette (⌘K)"
          onClick={() => setPaletteOpen(true)}
        >
          <Command size={15} />
        </button>
        <button
          className="icon-btn"
          title="Keyboard shortcuts (?)"
          onClick={() => setShortcutsOpen(true)}
        >
          <HelpCircle size={15} />
        </button>
        <div className="relative">
          <button
            className="flex h-7 items-center gap-1.5 rounded-md bg-ink-700 px-2.5 text-[12px] font-medium hover:bg-ink-600"
            onClick={() => setExportOpen(!exportOpen)}
          >
            <Download size={13} /> Export
          </button>
          {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} />}
        </div>
        <button
          className="icon-btn"
          data-active={rightOpen}
          onClick={toggleRight}
          title="Toggle inspector"
        >
          <PanelRight size={15} />
        </button>
      </div>
    </header>
  );
}

function DocumentTitle() {
  const editor = useEditor();
  const { readOnly, meta, shared = false } = useEditorContext();
  const ws = useWorkspace(meta.workspaceId);
  const project = useProject(meta.projectId);
  const revision = useDocumentRevision();
  void revision;
  const { saveStatus } = useEditorUi();
  const [editing, setEditing] = useState(false);
  const status = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
    offline: 'Offline — edits kept locally',
  }[saveStatus];
  if (shared)
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-medium">{editor.graph.name}</span>
        <span
          className="rounded bg-accent-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-300"
          data-testid="shared-view"
        >
          Shared view
        </span>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <Link to={`/w/${meta.workspaceId}`} className="text-ink-400 hover:text-ink-200">
        {ws.data?.name ?? '…'}
      </Link>
      <span className="text-ink-600">/</span>
      <Link
        to={`/w/${meta.workspaceId}/p/${meta.projectId}`}
        className="text-ink-400 hover:text-ink-200"
      >
        {project.data?.name ?? '…'}
      </Link>
      <span className="text-ink-600">/</span>
      {editing && !readOnly ? (
        <input
          autoFocus
          className="field h-6 w-56"
          defaultValue={editor.graph.name}
          onBlur={(e) => {
            editor.graph.setName(e.target.value.trim() || 'Untitled');
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <button
          className="rounded px-2 py-1 font-medium hover:bg-ink-700"
          onClick={() => !readOnly && setEditing(true)}
          title={readOnly ? '' : 'Rename'}
        >
          {editor.graph.name}
        </button>
      )}
      {readOnly ? (
        <span
          className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-300"
          data-testid="view-only"
        >
          View only
        </span>
      ) : (
        <span
          className={`text-[11px] ${saveStatus === 'error' ? 'text-red-300' : 'text-ink-400'}`}
          data-testid="save-status"
        >
          {status}
        </span>
      )}
    </div>
  );
}
