import type { PresenceUser } from '@sigma/validation';
import { useEditor } from '../editor/editor-context';
import { useEditorValue } from '../editor/hooks';

/** Remote cursors and selection outlines drawn as DOM over the canvas. */
export function PresenceLayer({ users }: { users: PresenceUser[] }) {
  const editor = useEditor();
  const vp = useEditorValue(
    (e) => `${e.viewport.zoom}:${e.viewport.offsetX}:${e.viewport.offsetY}:${e.currentPageId}`,
    ['viewport', 'page', 'change'],
  );
  void vp;
  const page = editor.currentPageId;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {users
        .filter((u) => u.pageId === page)
        .map((u) => {
          const sel = u.selection
            .filter((id) => editor.graph.hasNode(id as never))
            .map((id) =>
              editor.viewport.worldRectToScreen(editor.graph.getWorldBounds(id as never)),
            );
          const c = u.cursor ? editor.viewport.worldToScreen(u.cursor) : null;
          return (
            <div key={u.userId}>
              {sel.map((r, i) => (
                <div
                  key={i}
                  className="absolute rounded-sm"
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    height: r.height,
                    border: `1.5px solid ${u.color}`,
                  }}
                >
                  {i === 0 && (
                    <span
                      className="absolute -top-4 left-0 rounded px-1 text-[10px] text-white"
                      style={{ background: u.color }}
                    >
                      {u.name}
                    </span>
                  )}
                </div>
              ))}
              {c && (
                <div
                  className="absolute transition-transform duration-75"
                  style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
                  data-testid={`cursor-${u.userId}`}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path d="M2 2l5 13 2-5 5-2z" fill={u.color} stroke="#fff" strokeWidth="1.2" />
                  </svg>
                  <span
                    className="ml-3 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] text-white"
                    style={{ background: u.color }}
                  >
                    {u.name}
                  </span>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

export function PresenceAvatars({
  users,
  connected,
}: {
  users: PresenceUser[];
  connected: boolean;
}) {
  return (
    <div
      className="flex items-center"
      title={
        connected ? `${users.length} other${users.length === 1 ? '' : 's'} here` : 'Reconnecting…'
      }
      data-testid="presence-avatars"
    >
      {users.slice(0, 5).map((u) => (
        <span
          key={u.userId}
          className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-ink-850 first:ml-0"
          style={{ background: u.color }}
          title={u.name}
        >
          {u.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {users.length > 5 && (
        <span className="ml-1 text-[10px] text-ink-400">+{users.length - 5}</span>
      )}
      {!connected && <span className="ml-1 h-2 w-2 rounded-full bg-amber-400" />}
    </div>
  );
}
