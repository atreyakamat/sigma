import { createContext, useContext } from 'react';
import type { Editor } from '@sigma/engine';
import type { DefaultTools } from '@sigma/tools';
import type { WorkspaceRole } from '@sigma/validation';

export interface EditorContextValue {
  editor: Editor;
  tools: DefaultTools;
  /** True when the current user may not modify this document. */
  readOnly: boolean;
  role: WorkspaceRole;
  meta: { documentId: string; projectId: string; workspaceId: string };
  /** Opened through a share link: no account, no presence/comments, read-only, polled for updates. */
  shared?: boolean;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorContext must be used inside EditorPage');
  return ctx;
}

export function useEditor(): Editor {
  return useEditorContext().editor;
}

export function useReadOnly(): boolean {
  return useEditorContext().readOnly;
}
