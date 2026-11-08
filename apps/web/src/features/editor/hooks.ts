import { useEffect, useReducer, useRef } from 'react';
import type { Editor, EditorEvents } from '@sigma/engine';
import { useEditor } from './editor-context';

type EventName = keyof EditorEvents;

/**
 * Re-computes `select(editor)` whenever any of the listed editor events fire. Values are compared
 * with Object.is, so return stable references (node objects are immutable) to avoid rerenders.
 */
export function useEditorValue<T>(select: (editor: Editor) => T, events: EventName[]): T {
  const editor = useEditor();
  const [, force] = useReducer((n: number) => n + 1, 0);
  const valueRef = useRef<T>(select(editor));
  const selectRef = useRef(select);
  selectRef.current = select;
  const next = select(editor);
  if (!Object.is(next, valueRef.current)) valueRef.current = next;

  useEffect(() => {
    const offs = events.map((name) =>
      editor.events.on(name, () => {
        const v = selectRef.current(editor);
        if (!Object.is(v, valueRef.current)) {
          valueRef.current = v;
          force();
        }
      }),
    );
    return () => offs.forEach((off) => off());
  }, [editor, events.join('|')]);

  return valueRef.current;
}

/** Subscribes to an editor event for side effects. */
export function useEditorEvent<K extends EventName>(
  name: K,
  handler: (event: EditorEvents[K]) => void,
): void {
  const editor = useEditor();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => editor.events.on(name, (e) => ref.current(e)), [editor, name]);
}

export function useSelectionIds() {
  return useEditorValue((e) => e.selection.ids, ['selection', 'change', 'document']);
}

export function useSelectedNodes() {
  const ids = useSelectionIds();
  const revision = useEditorValue((e) => e.graph.revision, ['change', 'document']);
  const editor = useEditor();
  void revision;
  return ids.map((id) => editor.graph.getNode(id)).filter((n): n is NonNullable<typeof n> => !!n);
}

export function useHistoryState() {
  const editor = useEditor();
  return useEditorValue(
    () =>
      `${editor.history.canUndo}|${editor.history.canRedo}|${editor.history.undoName ?? ''}|${editor.history.redoName ?? ''}`,
    ['history', 'document'],
  );
}

export function useActiveTool() {
  return useEditorValue((e) => e.tools.activeId, ['tool']);
}

export function useViewportState() {
  return useEditorValue((e) => `${e.viewport.zoom}`, ['viewport']);
}

export function useDocumentRevision() {
  return useEditorValue((e) => e.graph.revision, ['change', 'document', 'page']);
}

export function useCurrentPageId() {
  return useEditorValue((e) => e.currentPageId, ['page', 'document']);
}

export function useEditorSettings() {
  return useEditorValue((e) => e.settings, ['settings']);
}
