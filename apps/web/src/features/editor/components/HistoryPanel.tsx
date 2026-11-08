import { useEffect, useRef, useState } from 'react';
import type { NodeId } from '@sigma/shared';
import { exportPngDataUrl } from '@sigma/engine';
import { useEditor } from '../editor-context';
import { useEditorValue } from '../hooks';

/** Undo history with thumbnails; click an entry to travel back or forward to it. */
export function HistoryPanel() {
  const editor = useEditor();
  const key = useEditorValue(
    (e) => `${e.history.length}|${e.history.canRedo}|${e.graph.revision}`,
    ['history', 'change', 'document'],
  );
  const thumbs = useRef(new Map<object, string>());
  const [, bump] = useState(0);
  void key;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = editor.history.events.on('execute', ({ command }) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const page = editor.currentPageId as NodeId;
          thumbs.current.set(
            command,
            editor.graph.getChildIds(page).length
              ? exportPngDataUrl(editor.graph, [page], { scale: 0.12, background: '#ffffff' })
              : '',
          );
          bump((n) => n + 1);
        } catch {
          /* thumbnails are best-effort */
        }
      }, 150);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [editor]);

  const entries = editor.history.entries();
  const redoCount = (editor.history as unknown as { redoStack: unknown[] }).redoStack?.length ?? 0;
  const goTo = (index: number) => {
    // index = number of undo entries that should remain applied
    let guard = 0;
    while (editor.history.length > index && guard++ < 500) editor.history.undo();
    while (editor.history.length < index && editor.history.canRedo && guard++ < 1000)
      editor.history.redo();
  };

  return (
    <div className="p-2">
      <div className="panel-title px-1">History</div>
      {entries.length === 0 && redoCount === 0 && (
        <div className="px-2 py-3 text-ink-500">Edits will appear here as you work.</div>
      )}
      <ul>
        {entries.map((e, i) => {
          const thumb = thumbs.current.get(e.command);
          const isCurrent = i === entries.length - 1;
          return (
            <li
              key={i}
              className={`mb-1 flex cursor-default items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-ink-750 ${isCurrent ? 'bg-ink-700/70' : ''}`}
              onClick={() => goTo(i + 1)}
            >
              <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-ink-800 ring-1 ring-ink-600">
                {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" /> : null}
              </div>
              <span className="flex-1 truncate">{e.command.name}</span>
              <span className="text-[10px] text-ink-500">r{e.revision}</span>
            </li>
          );
        })}
      </ul>
      {redoCount > 0 && (
        <button
          className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-ink-400 hover:bg-ink-750"
          onClick={() => goTo(entries.length + redoCount)}
        >
          {redoCount} undone {redoCount === 1 ? 'step' : 'steps'} — click to redo all
        </button>
      )}
    </div>
  );
}
