import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { NodeId } from '@sigma/shared';
import { Editor, exportPngDataUrl, registerDefaultShortcuts } from '@sigma/engine';
import { registerDefaultTools } from '@sigma/tools';
import { roleHas } from '@sigma/validation';
import type { DocumentJSON } from '@sigma/document';
import type { DocumentDto } from '@sigma/validation';
import { ApiRequestError, http } from '../../lib/api';
import { ConflictError, documentRepository } from '../../lib/api-document-repository';
import type { FrameLock, VersionDto } from '@sigma/validation';
import { toast } from '../../components/ui/toast';
import { useAuth } from '../authentication/AuthProvider';
import { SessionExpiredModal, useSessionState } from '../authentication/SessionExpiredModal';
import { PresenceLayer } from '../collaboration/PresenceLayer';
import { usePresence } from '../collaboration/usePresence';
import { CommentsLayer, CommentsPanel } from './comments/CommentsLayer';
import { ConnectionsLayer } from '../prototype/ConnectionsLayer';
import { VersionsPanel } from './components/VersionsPanel';
import { errorText } from '../../lib/queries';
import { HintToast, OnboardingChecklist, useOnboardingBindings } from '../onboarding/Onboarding';
import { buildCommands } from './commands';
import { CanvasHost } from './components/CanvasHost';
import { CommandPalette } from './components/CommandPalette';
import { ComponentsPanel } from './components/ComponentsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { Inspector } from './components/Inspector';
import { LayersPanel } from './components/LayersPanel';
import { PagesPanel } from './components/PagesPanel';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { EditorContext, useEditorContext } from './editor-context';
import type { EditorContextValue } from './editor-context';
import { useEditorUi } from './store';

const AUTOSAVE_DELAY_MS = 600;

/** Shortcuts that are safe in view-only mode. */
function registerViewOnlyShortcuts(editor: Editor): () => void {
  const k = editor.keymap;
  const offs = [
    k.register('escape', () => editor.selection.clear()),
    k.register('mod+a', () => {
      const page = editor.currentPageId;
      if (page) editor.selection.set(editor.graph.getChildren(page).map((n) => n.id));
    }),
    k.register('mod+0', () => editor.zoomTo(1)),
    k.register('mod+1', () => editor.zoomToFit()),
    k.register('mod+2', () => editor.zoomToSelection()),
    k.register('mod+=', () => editor.viewport.zoomBy(1.25, editor.lastPointerScreen)),
    k.register('mod+-', () => editor.viewport.zoomBy(0.8, editor.lastPointerScreen)),
    k.register('mod+shift+r', () =>
      editor.updateSettings({ showRulers: !editor.settings.showRulers }),
    ),
  ];
  return () => offs.forEach((o) => o());
}

export function EditorPage() {
  const { documentId: routeDocumentId, token: shareToken } = useParams<{
    documentId: string;
    token: string;
  }>();
  const [sharedDocumentId, setSharedDocumentId] = useState<string | null>(null);
  const documentId = shareToken ? sharedDocumentId : routeDocumentId;
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<EditorContextValue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<
    null | { kind: 'conflict' } | { kind: 'updated'; by: string }
  >(null);
  const { user } = useAuth();
  const [pendingOffline, setPendingOffline] = useState<{
    content: DocumentJSON;
    baseRevision: number;
  } | null>(null);
  const { leftOpen, rightOpen, setSaveStatus } = useEditorUi();
  const narrow = useNarrowScreen();
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!routeDocumentId && !shareToken) return;
    let cancelled = false;
    let editor: Editor | null = null;
    let unregister: (() => void) | null = null;
    setConflict(null);
    void (async () => {
      let doc: DocumentDto;
      try {
        if (shareToken) {
          const shared = await documentRepository.getShared(shareToken);
          doc = {
            id: shared.id,
            projectId: '',
            workspaceId: '',
            name: shared.name,
            revision: shared.revision,
            thumbnailUrl: null,
            nodeCount: 0,
            createdById: '',
            createdAt: shared.updatedAt,
            updatedAt: shared.updatedAt,
            content: shared.content,
            role: 'VIEWER',
          };
          setSharedDocumentId(shared.id);
        } else {
          doc = await documentRepository.get(routeDocumentId as string);
        }
      } catch (e) {
        if (!cancelled) setLoadError(errorText(e));
        return;
      }
      if (cancelled) return;
      const documentId = doc.id;
      revisionRef.current = doc.revision;
      const readOnly = shareToken ? true : !roleHas(doc.role, 'document.write');
      editor = new Editor({ document: doc.content });
      const tools = registerDefaultTools(editor);
      if (readOnly) {
        unregister = registerViewOnlyShortcuts(editor);
        // Only navigation tools are allowed; any other activation snaps back to select.
        editor.events.on('tool', ({ id }) => {
          if (id && id !== 'select' && id !== 'hand') editor?.tools.activate('select');
        });
      } else {
        unregister = registerDefaultShortcuts(editor);
      }
      const me = user?.id;
      editor.nodeGuard = (node) => {
        const lock = (node.metadata as { lock?: FrameLock }).lock;
        return !lock || lock.userId === me || new Date(lock.until).getTime() < Date.now();
      };
      try {
        const raw = shareToken ? null : localStorage.getItem(`sigma:pending:${documentId}`);
        if (raw) {
          const pending = JSON.parse(raw) as { content: DocumentJSON; baseRevision: number };
          if (pending.baseRevision === doc.revision) {
            editor.loadDocument(pending.content);
            localStorage.removeItem(`sigma:pending:${documentId}`);
            toast.info('Restored edits made while offline');
            setTimeout(() => editor?.graph.setName(editor.graph.name), 0);
          } else {
            setPendingOffline(pending);
          }
        }
      } catch {
        /* storage unavailable */
      }
      if (import.meta.env.DEV)
        (window as unknown as { __sigma?: unknown }).__sigma = { editor, tools };
      setCtx({
        editor,
        tools,
        readOnly,
        role: doc.role,
        meta: { documentId, projectId: doc.projectId, workspaceId: doc.workspaceId },
        shared: !!shareToken,
      });
    })();
    return () => {
      cancelled = true;
      unregister?.();
      editor?.dispose();
      setCtx(null);
    };
  }, [routeDocumentId, shareToken, user?.id]);

  // Share-link viewers have no socket: poll for new revisions and reload quietly.
  useEffect(() => {
    if (!ctx?.shared || !shareToken) return;
    const timer = setInterval(() => {
      void documentRepository
        .getShared(shareToken)
        .then((shared) => {
          if (shared.revision === revisionRef.current) return;
          const vp = ctx.editor.viewport.getState();
          ctx.editor.loadDocument(shared.content);
          ctx.editor.viewport.setState(vp);
          revisionRef.current = shared.revision;
        })
        .catch(() => undefined);
    }, 10_000);
    return () => clearInterval(timer);
  }, [ctx, shareToken]);

  // Autosave with optimistic concurrency; stops on conflict until the page is reloaded.
  useEffect(() => {
    if (!ctx || !documentId || ctx.readOnly) return;
    const { editor } = ctx;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const save = async () => {
      timer = null;
      if (stopped) return;
      if (useEditorUi.getState().realtime) {
        // Edits already reached the server's realtime room; it persists and reports `saved`.
        dirtyRef.current = false;
        try {
          localStorage.removeItem(`sigma:pending:${documentId}`);
        } catch {
          /* ignore */
        }
        return;
      }
      setSaveStatus('saving');
      try {
        const page = editor.currentPageId as NodeId;
        let thumbnail: string | null = null;
        try {
          thumbnail = editor.graph.getChildIds(page).length
            ? exportPngDataUrl(editor.graph, [page], { scale: 0.25, background: null })
            : null;
        } catch {
          thumbnail = null;
        }
        const res = await documentRepository.save(
          documentId,
          editor.toJSON(),
          revisionRef.current,
          thumbnail,
        );
        revisionRef.current = res.revision;
        dirtyRef.current = false;
        try {
          localStorage.removeItem(`sigma:pending:${documentId}`);
        } catch {
          /* ignore */
        }
        setSaveStatus('saved');
      } catch (e) {
        if (e instanceof ConflictError) {
          stopped = true;
          setConflict({ kind: 'conflict' });
          setSaveStatus('error');
        } else if (e instanceof ApiRequestError && e.statusCode === 401) {
          useSessionState.getState().setExpired(true);
          dirtyRef.current = true;
          setSaveStatus('error');
        } else if (e instanceof ApiRequestError) {
          setSaveStatus('error');
          toast.error(e.message);
        } else {
          // Network failure: keep the work in this browser and retry.
          try {
            localStorage.setItem(
              `sigma:pending:${documentId}`,
              JSON.stringify({ content: editor.toJSON(), baseRevision: revisionRef.current }),
            );
          } catch {
            /* storage unavailable */
          }
          setSaveStatus('offline');
          timer = setTimeout(() => void save(), 5000);
        }
      }
    };
    const retryNow = () => {
      if (dirtyRef.current && !timer) timer = setTimeout(() => void save(), 0);
    };
    window.addEventListener('online', retryNow);
    window.addEventListener('sigma:resume-save', retryNow);
    const schedule = () => {
      if (stopped) return;
      dirtyRef.current = true;
      if (useEditorUi.getState().realtime) setSaveStatus('saving');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    };
    const off = editor.events.on('change', schedule);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !stopped) e.preventDefault();
    };
    const onHide = () => {
      if (dirtyRef.current && timer) {
        clearTimeout(timer);
        void save();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      off();
      window.removeEventListener('online', retryNow);
      window.removeEventListener('sigma:resume-save', retryNow);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onHide);
      if (timer) {
        clearTimeout(timer);
        void save();
      }
    };
  }, [ctx, documentId, setSaveStatus]);

  const reloadFromServer = async (announce?: string) => {
    if (!ctx || !documentId) return;
    const doc = await documentRepository.get(documentId);
    const vp = ctx.editor.viewport.getState();
    ctx.editor.loadDocument(doc.content);
    ctx.editor.viewport.setState(vp);
    revisionRef.current = doc.revision;
    dirtyRef.current = false;
    setConflict(null);
    if (announce) toast.info(announce);
  };

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-300">
        <p>{loadError}</p>
        <button className="underline" onClick={() => void navigate('/')}>
          Back to workspaces
        </button>
      </div>
    );
  }
  if (!ctx)
    return (
      <div className="flex h-full items-center justify-center text-ink-400">Opening file…</div>
    );

  return (
    <EditorContext.Provider value={ctx}>
      <div className="grid h-full grid-rows-[44px_1fr_26px] bg-ink-900 text-ink-100">
        <Toolbar />
        <div
          className="relative grid h-full min-h-0"
          style={{
            gridTemplateColumns: narrow
              ? '1fr'
              : `${leftOpen ? '248px' : '0px'} 1fr ${rightOpen ? '256px' : '0px'}`,
          }}
        >
          <aside
            className={`min-h-0 overflow-hidden border-r border-ink-700 bg-ink-850 ${leftOpen ? '' : 'hidden'} ${narrow ? 'absolute inset-y-0 left-0 z-20 w-64 shadow-2xl' : ''}`}
          >
            <LeftSidebar />
          </aside>
          <CanvasHost />
          <aside
            className={`min-h-0 overflow-y-auto border-l border-ink-700 bg-ink-850 scrollbar-thin ${rightOpen ? '' : 'hidden'} ${narrow ? 'absolute inset-y-0 right-0 z-20 w-72 shadow-2xl' : ''}`}
          >
            <Inspector />
          </aside>
          {conflict && (
            <div
              role="alert"
              className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/50 bg-amber-950/95 px-4 py-2 text-[12px] text-amber-100 shadow-xl"
            >
              {conflict.kind === 'conflict'
                ? 'This file changed elsewhere. Autosave is paused; reload to continue from the latest version.'
                : `${conflict.by} saved a newer version. Reload to see it (your unsaved edits would be lost).`}
              <button
                className="rounded bg-amber-500 px-2 py-1 font-medium text-ink-900"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          )}
          {pendingOffline && (
            <div
              role="alert"
              className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-sky-500/50 bg-sky-950/95 px-4 py-2 text-[12px] text-sky-100 shadow-xl"
            >
              Edits you made offline could not be applied: the file changed on the server since.
              <button
                className="rounded bg-sky-500 px-2 py-1 font-medium text-ink-900"
                onClick={() => {
                  if (!ctx) return;
                  const serverRevision = revisionRef.current;
                  ctx.editor.loadDocument(pendingOffline.content);
                  revisionRef.current = serverRevision;
                  localStorage.removeItem(`sigma:pending:${documentId}`);
                  setPendingOffline(null);
                  toast.info(
                    'Offline edits applied on top of the server version; review and keep editing.',
                  );
                  setTimeout(() => ctx.editor.graph.setName(ctx.editor.graph.name), 0);
                }}
              >
                Apply my offline edits
              </button>
              <button
                className="rounded bg-ink-700 px-2 py-1"
                onClick={() => {
                  localStorage.removeItem(`sigma:pending:${documentId}`);
                  setPendingOffline(null);
                }}
              >
                Discard them
              </button>
            </div>
          )}
          {ctx.shared ? (
            <SharedOverlays />
          ) : (
            <CanvasOverlays
              readOnly={ctx.readOnly}
              isDirty={() => dirtyRef.current}
              onRevision={(revision) => {
                revisionRef.current = revision;
                if (useEditorUi.getState().realtime) {
                  dirtyRef.current = false;
                  setSaveStatus('saved');
                }
              }}
              onServerSaved={(by) => {
                if (useEditorUi.getState().realtime) return; // already in sync through the CRDT room
                if (dirtyRef.current) setConflict({ kind: 'updated', by });
                else void reloadFromServer(`${by} saved changes — file updated`);
              }}
            />
          )}
        </div>
        <StatusBar />
      </div>
      <Overlays onRestored={() => void reloadFromServer('Version restored')} />
      <SessionExpiredModal
        onSignedIn={() => window.dispatchEvent(new Event('sigma:resume-save'))}
      />
    </EditorContext.Provider>
  );
}

/** Command palette, shortcut help, onboarding checklist and hints. */
function Overlays({ onRestored }: { onRestored: () => void }) {
  const { editor, tools, readOnly, meta } = useEditorContext();
  const {
    paletteOpen,
    setPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    setExportOpen,
    setLeftTab,
    versionsOpen,
    setVersionsOpen,
    setCommentMode,
  } = useEditorUi();
  useEffect(() => {
    const onCheckpoint = () => {
      const label = prompt('Name this version');
      if (label?.trim())
        http
          .post<VersionDto>(`/documents/${meta.documentId}/versions`, { label: label.trim() })
          .then(() => toast.success('Checkpoint saved'))
          .catch((e) => toast.error((e as Error).message));
    };
    window.addEventListener('sigma:checkpoint', onCheckpoint);
    return () => window.removeEventListener('sigma:checkpoint', onCheckpoint);
  }, [meta.documentId]);
  useOnboardingBindings(!readOnly);
  const commands = useMemo(
    () =>
      buildCommands(editor, tools, {
        readOnly,
        openExport: () => setExportOpen(true),
        openShortcuts: () => setShortcutsOpen(true),
        openHistory: () => setLeftTab('history'),
        openVersions: () => setVersionsOpen(true),
        saveCheckpoint: () => window.dispatchEvent(new CustomEvent('sigma:checkpoint')),
        importSvg: () => window.dispatchEvent(new CustomEvent('sigma:import-svg')),
        openPreview: () =>
          window.location.assign(`${window.location.pathname.replace(/\/$/, '')}/preview`),
        togglePrototypeMode: () =>
          useEditorUi.setState((st) => ({ prototypeMode: !st.prototypeMode })),
      }),
    [editor, tools, readOnly, setExportOpen, setShortcutsOpen, setLeftTab, setVersionsOpen],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!useEditorUi.getState().paletteOpen);
      } else if (e.key === '?' && !editing) {
        e.preventDefault();
        setShortcutsOpen(!useEditorUi.getState().shortcutsOpen);
      } else if (e.key.toLowerCase() === 'c' && !editing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setCommentMode(!useEditorUi.getState().commentMode);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen, setShortcutsOpen, setCommentMode]);
  return (
    <>
      {versionsOpen && (
        <VersionsPanel
          onClose={() => setVersionsOpen(false)}
          onRestored={() => {
            setVersionsOpen(false);
            onRestored();
          }}
        />
      )}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {shortcutsOpen && <ShortcutsPanel onClose={() => setShortcutsOpen(false)} />}
      <div className="pointer-events-none fixed bottom-9 left-3 z-30 flex flex-col gap-2">
        <HintToast />
        {!readOnly && <OnboardingChecklist />}
      </div>
    </>
  );
}

function LeftSidebar() {
  const { leftTab, setLeftTab } = useEditorUi();
  const shared = useEditorContext().shared ?? false;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-ink-700 px-2">
        {(shared
          ? (['layers', 'pages'] as const)
          : (['layers', 'pages', 'components', 'comments', 'history'] as const)
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setLeftTab(tab)}
            className={`rounded px-2 py-1 text-[11px] font-medium capitalize ${leftTab === tab ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200'}`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {leftTab === 'layers' && <LayersPanel />}
        {leftTab === 'pages' && <PagesPanel />}
        {leftTab === 'history' && <HistoryPanel />}
        {leftTab === 'comments' && <CommentsPanel />}
        {leftTab === 'components' && <ComponentsPanel />}
      </div>
    </div>
  );
}

/** DOM layers over the canvas: remote cursors/selections and comment pins. */
function CanvasOverlays({
  onServerSaved,
  onRevision,
  isDirty,
  readOnly,
}: {
  onServerSaved: (by: string) => void;
  onRevision: (revision: number) => void;
  isDirty: () => boolean;
  readOnly: boolean;
}) {
  const { editor, meta } = useEditorContext();
  const { user } = useAuth();
  const presence = usePresence(
    editor,
    meta.documentId,
    user?.id ?? '',
    (_rev, by) => onServerSaved(by.userName),
    {
      readOnly,
      isDirty,
      onRevision,
      onActive: (active) => {
        useEditorUi.setState({ realtime: active });
        // Falling back to HTTP: flush anything edited since the socket dropped.
        if (!active) window.dispatchEvent(new Event('sigma:resume-save'));
      },
    },
  );
  useEffect(() => {
    useEditorUi.setState({ presenceUsers: presence.users, presenceConnected: presence.connected });
  }, [presence]);
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        left: useEditorUi.getState().leftOpen ? 248 : 0,
        right: useEditorUi.getState().rightOpen ? 256 : 0,
      }}
    >
      <PresenceLayer users={presence.users} />
      {useEditorUi((s) => s.prototypeMode) && <ConnectionsLayer />}
      <CommentsLayer />
    </div>
  );
}

/** Overlays for share-link viewers: prototype arrows only (no presence, no comments). */
function SharedOverlays() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        left: useEditorUi.getState().leftOpen ? 248 : 0,
        right: useEditorUi.getState().rightOpen ? 256 : 0,
      }}
    >
      {useEditorUi((s) => s.prototypeMode) && <ConnectionsLayer />}
    </div>
  );
}

/** Below 900px the side panels float over the canvas and start closed (phones and tablets). */
function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const apply = () => {
      setNarrow(mq.matches);
      if (mq.matches) useEditorUi.setState({ leftOpen: false, rightOpen: false });
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return narrow;
}
