import { create } from 'zustand';
import type { PresenceUser } from '@sigma/validation';

export type LeftTab = 'layers' | 'pages' | 'history' | 'comments' | 'components';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface EditorUiState {
  leftTab: LeftTab;
  leftOpen: boolean;
  rightOpen: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  contextMenu: { x: number; y: number } | null;
  exportOpen: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  versionsOpen: boolean;
  commentMode: boolean;
  showResolved: boolean;
  presenceUsers: PresenceUser[];
  presenceConnected: boolean;
  /** Realtime co-editing is synced: edits persist through the server, not HTTP autosave. */
  realtime: boolean;
  prototypeMode: boolean;
  setPrototypeMode(on: boolean): void;
  setCommentMode(on: boolean): void;
  setShowResolved(on: boolean): void;
  setPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setVersionsOpen(open: boolean): void;
  setLeftTab(tab: LeftTab): void;
  toggleLeft(): void;
  toggleRight(): void;
  setSaveStatus(status: SaveStatus): void;
  openContextMenu(pos: { x: number; y: number } | null): void;
  setExportOpen(open: boolean): void;
}

/** UI-only state. Nothing here is part of the document or the engine. */
export const useEditorUi = create<EditorUiState>((set) => ({
  leftTab: 'layers',
  leftOpen: true,
  rightOpen: true,
  saveStatus: 'idle',
  lastSavedAt: null,
  contextMenu: null,
  exportOpen: false,
  paletteOpen: false,
  shortcutsOpen: false,
  versionsOpen: false,
  commentMode: false,
  showResolved: false,
  presenceUsers: [],
  presenceConnected: false,
  realtime: false,
  prototypeMode: false,
  setPrototypeMode: (prototypeMode) => set({ prototypeMode }),
  setCommentMode: (commentMode) =>
    set({ commentMode, ...(commentMode ? { leftTab: 'comments', leftOpen: true } : {}) }),
  setShowResolved: (showResolved) => set({ showResolved }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setVersionsOpen: (versionsOpen) => set({ versionsOpen }),
  setLeftTab: (leftTab) => set({ leftTab, leftOpen: true }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setSaveStatus: (saveStatus) =>
    set({ saveStatus, ...(saveStatus === 'saved' ? { lastSavedAt: Date.now() } : {}) }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));
