import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@sigma/engine';
import type { PresenceClientMessage, PresenceServerMessage, PresenceUser } from '@sigma/validation';

export interface PresenceState {
  users: PresenceUser[];
  connected: boolean;
}

function wsUrl(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;
  return `${base.replace(/^http/, 'ws')}/api/v1/presence`;
}

/**
 * Live presence for one document: who is here, their cursors and selections, and "saved"
 * notifications. Reconnects with backoff; sends awareness at most every 50 ms.
 */
export function usePresence(
  editor: Editor,
  documentId: string,
  selfId: string,
  onSaved: (revision: number, by: { userId: string; userName: string }) => void,
): PresenceState {
  const [state, setState] = useState<PresenceState>({ users: [], connected: false });
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSent = 0;
    let pending: PresenceClientMessage | null = null;
    const users = new Map<string, PresenceUser>();
    const publish = () =>
      setState({ users: [...users.values()], connected: ws?.readyState === WebSocket.OPEN });

    const send = (msg: PresenceClientMessage) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const awareness = () => {
      const msg: PresenceClientMessage = {
        type: 'awareness',
        pageId: editor.currentPageId,
        cursor: editor.lastPointerWorld,
        selection: [...editor.selection.ids],
      };
      const now = performance.now();
      if (now - lastSent >= 50) {
        lastSent = now;
        pending = null;
        send(msg);
      } else {
        pending = msg;
        if (!timer)
          timer = setTimeout(
            () => {
              timer = null;
              if (pending) {
                lastSent = performance.now();
                send(pending);
                pending = null;
              }
            },
            50 - (now - lastSent),
          );
      }
    };

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        retry = 1000;
        send({ type: 'join', documentId });
        publish();
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as PresenceServerMessage;
        if (msg.type === 'presence') {
          users.clear();
          for (const u of msg.users) if (u.userId !== selfId) users.set(u.userId, u);
          publish();
        } else if (msg.type === 'awareness') {
          if (msg.user.userId !== selfId) {
            users.set(msg.user.userId, msg.user);
            publish();
          }
        } else if (msg.type === 'leave') {
          users.delete(msg.userId);
          publish();
        } else if (msg.type === 'saved') {
          if (msg.userId !== selfId)
            onSavedRef.current(msg.revision, { userId: msg.userId, userName: msg.userName });
        }
      };
      ws.onclose = () => {
        users.clear();
        publish();
        if (!closed) setTimeout(connect, (retry = Math.min(retry * 2, 15_000)));
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    const offs = [editor.events.on('selection', awareness), editor.events.on('page', awareness)];
    const onMove = () => awareness();
    const host = document.querySelector('[data-testid="canvas-host"]');
    host?.addEventListener('pointermove', onMove);
    const onLeave = () =>
      send({
        type: 'awareness',
        pageId: editor.currentPageId,
        cursor: null,
        selection: [...editor.selection.ids],
      });
    host?.addEventListener('pointerleave', onLeave);
    return () => {
      closed = true;
      offs.forEach((o) => o());
      host?.removeEventListener('pointermove', onMove);
      host?.removeEventListener('pointerleave', onLeave);
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [editor, documentId, selfId]);

  return state;
}
