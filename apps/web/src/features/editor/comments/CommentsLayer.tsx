import { useQuery } from '@tanstack/react-query';
import { Check, MessageSquare, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CommentThreadDto } from '@sigma/validation';
import { roleHas } from '@sigma/validation';
import { Button } from '../../../components/ui/Button';
import { http } from '../../../lib/api';
import { useApiMutation } from '../../../lib/queries';
import { useAuth } from '../../authentication/AuthProvider';
import { useEditorContext } from '../editor-context';
import { useEditorValue } from '../hooks';
import { useEditorUi } from '../store';

export const commentsKey = (documentId: string) => ['comments', documentId] as const;
export const useComments = (documentId: string) =>
  useQuery({
    queryKey: commentsKey(documentId),
    queryFn: () => http.get<CommentThreadDto[]>(`/documents/${documentId}/comments`),
  });

/** Comment pins over the canvas, a composer for new threads, and thread popovers. */
export function CommentsLayer() {
  const { editor, meta, role } = useEditorContext();
  const { user } = useAuth();
  const { commentMode, setCommentMode, showResolved } = useEditorUi();
  const comments = useComments(meta.documentId);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    text: string;
    nodeId: string | null;
  } | null>(null);
  const vp = useEditorValue(
    (e) => `${e.viewport.zoom}:${e.viewport.offsetX}:${e.viewport.offsetY}:${e.currentPageId}`,
    ['viewport', 'page'],
  );
  void vp;
  const key = commentsKey(meta.documentId);
  const create = useApiMutation(
    (body: unknown) => http.post(`/documents/${meta.documentId}/comments`, body),
    [key],
    () => setDraft(null),
  );
  const update = useApiMutation(
    ({ id, body }: { id: string; body: unknown }) => http.patch(`/comments/${id}`, body),
    [key],
  );
  const remove = useApiMutation(
    (id: string) => http.delete(`/comments/${id}`),
    [key],
    () => setOpen(null),
  );
  const canModerate = roleHas(role, 'comment.moderate');

  // Comment mode: a click on the canvas places a new pin (capture phase so tools do not react).
  useEffect(() => {
    if (!commentMode) return;
    const host = document.querySelector('[data-testid="canvas-host"]') as HTMLElement | null;
    if (!host) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const r = host.getBoundingClientRect();
      const world = editor.viewport.screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
      const hit = editor.hitTester.hitTest(world, { tolerance: editor.worldTolerance() });
      setDraft({ x: world.x, y: world.y, text: '', nodeId: hit?.id ?? null });
      setOpen(null);
    };
    host.addEventListener('pointerdown', onDown, true);
    return () => host.removeEventListener('pointerdown', onDown, true);
  }, [commentMode, editor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (draft || commentMode)) {
        setDraft(null);
        setCommentMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, commentMode, setCommentMode]);

  const page = editor.currentPageId;
  const anchorFor = (d: { x: number; y: number; nodeId: string | null }) => {
    if (d.nodeId && editor.graph.hasNode(d.nodeId as never)) {
      const b = editor.graph.getWorldBounds(d.nodeId as never);
      return { pageId: page, nodeId: d.nodeId, x: d.x - b.x, y: d.y - b.y };
    }
    return { pageId: page, nodeId: null, x: d.x, y: d.y };
  };
  const threads = (comments.data ?? []).filter(
    (t) => t.anchor?.pageId === page && (showResolved || !t.resolved),
  );
  const toScreen = (x: number, y: number) => editor.viewport.worldToScreen({ x, y });
  /** Pins anchored to a node follow it: the stored point is relative to the node's bounds origin. */
  const anchorPoint = (a: { x: number; y: number; nodeId?: string | null }) => {
    if (a.nodeId && editor.graph.hasNode(a.nodeId as never)) {
      const b = editor.graph.getWorldBounds(a.nodeId as never);
      return toScreen(b.x + a.x, b.y + a.y);
    }
    return toScreen(a.x, a.y);
  };

  return (
    <div
      className={`absolute inset-0 ${commentMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
      data-testid="comments-layer"
    >
      {threads.map((t, i) => {
        const p = anchorPoint(t.anchor!);
        const isOpen = open === t.id;
        return (
          <div key={t.id} className="absolute" style={{ left: p.x, top: p.y }}>
            <button
              className={`pointer-events-auto -translate-x-1/2 -translate-y-full rounded-full rounded-bl-none border-2 border-white px-2 py-1 text-[11px] font-semibold text-white shadow-lg ${t.resolved ? 'bg-ink-500' : 'bg-accent-500'}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(isOpen ? null : t.id);
                setDraft(null);
              }}
              title={t.content}
              data-testid="comment-pin"
            >
              {i + 1}
            </button>
            {isOpen && (
              <div
                className="pointer-events-auto absolute left-3 top-1 z-20 w-72 rounded-xl border border-ink-600 bg-ink-850 p-3 text-[12px] shadow-2xl"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] text-ink-400">
                    {t.resolved ? 'Resolved' : 'Open'} · {t.replies.length + 1}{' '}
                    {t.replies.length ? 'messages' : 'message'}
                  </span>
                  <div className="flex">
                    {(canModerate || t.userId === user?.id) && (
                      <button
                        className="icon-btn h-6 w-6"
                        title={t.resolved ? 'Reopen' : 'Resolve'}
                        onClick={() => update.mutate({ id: t.id, body: { resolved: !t.resolved } })}
                      >
                        <Check size={12} />
                      </button>
                    )}
                    {(canModerate || t.userId === user?.id) && (
                      <button
                        className="icon-btn h-6 w-6"
                        title="Delete thread"
                        onClick={() => confirm('Delete this thread?') && remove.mutate(t.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    <button className="icon-btn h-6 w-6" onClick={() => setOpen(null)}>
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <Message name={t.userName} at={t.createdAt} text={t.content} />
                {t.replies.map((r) => (
                  <Message key={r.id} name={r.userName} at={r.createdAt} text={r.content} />
                ))}
                <ReplyBox onSubmit={(text) => create.mutate({ content: text, parentId: t.id })} />
              </div>
            )}
          </div>
        );
      })}
      {draft && (
        <div
          className="absolute"
          style={{ left: toScreen(draft.x, draft.y).x, top: toScreen(draft.x, draft.y).y }}
        >
          <div className="-translate-x-1/2 -translate-y-full rounded-full rounded-bl-none border-2 border-white bg-accent-500 px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
            <MessageSquare size={12} />
          </div>
          <div
            className="pointer-events-auto absolute left-3 top-1 z-20 w-72 rounded-xl border border-ink-600 bg-ink-850 p-3 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              autoFocus
              className="field h-20 resize-none py-1.5"
              placeholder="Leave a comment…"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setDraft(null);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.text.trim())
                  create.mutate({
                    content: draft.text.trim(),
                    anchor: anchorFor(draft),
                  });
              }}
              data-testid="comment-composer"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!draft.text.trim() || create.isPending}
                onClick={() =>
                  create.mutate({
                    content: draft.text.trim(),
                    anchor: anchorFor(draft),
                  })
                }
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Message({ name, at, text }: { name: string; at: string; text: string }) {
  return (
    <div className="mb-2">
      <div className="text-[11px]">
        <span className="font-semibold">{name}</span>{' '}
        <span className="text-ink-500">{new Date(at).toLocaleString()}</span>
      </div>
      <div className="whitespace-pre-wrap text-ink-200">{text}</div>
    </div>
  );
}

function ReplyBox({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="mt-2 flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) {
          onSubmit(text.trim());
          setText('');
        }
      }}
    >
      <input
        className="field h-7"
        placeholder="Reply…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <Button type="submit" variant="secondary" className="h-7 px-2" disabled={!text.trim()}>
        Send
      </Button>
    </form>
  );
}

/** Sidebar list of threads with jump-to and resolved toggle. */
export function CommentsPanel() {
  const { editor, meta } = useEditorContext();
  const comments = useComments(meta.documentId);
  const { showResolved, setShowResolved, setCommentMode, commentMode } = useEditorUi();
  const threads = (comments.data ?? []).filter((t) => showResolved || !t.resolved);
  return (
    <div className="p-2 text-[12px]">
      <div className="panel-title px-1">
        <span>Comments</span>
        <label className="flex items-center gap-1 text-[10px] normal-case tracking-normal">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />{' '}
          resolved
        </label>
      </div>
      <Button
        variant={commentMode ? 'primary' : 'secondary'}
        className="mb-2 w-full"
        onClick={() => setCommentMode(!commentMode)}
      >
        <MessageSquare size={13} />{' '}
        {commentMode ? 'Click the canvas to place… (Esc)' : 'Add a comment (C)'}
      </Button>
      {threads.length === 0 && <div className="px-1 text-ink-500">No comments yet.</div>}
      <ul>
        {threads.map((t, i) => (
          <li
            key={t.id}
            className="mb-1 cursor-default rounded px-2 py-1.5 hover:bg-ink-750"
            onClick={() => {
              if (t.anchor) {
                if (t.anchor.pageId !== editor.currentPageId)
                  editor.setPage(t.anchor.pageId as never);
                editor.viewport.centerOn({ x: t.anchor.x, y: t.anchor.y });
              }
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-1.5 text-[10px] text-white ${t.resolved ? 'bg-ink-500' : 'bg-accent-500'}`}
              >
                {i + 1}
              </span>
              <span className="font-medium">{t.userName}</span>
              <span className="text-[10px] text-ink-500">
                {t.replies.length ? `${t.replies.length} replies` : ''}
              </span>
            </div>
            <div className="truncate text-ink-300">{t.content}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
