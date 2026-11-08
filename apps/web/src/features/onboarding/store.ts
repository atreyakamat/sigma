import { create } from 'zustand';

export const CHECKLIST_STEPS = [
  {
    id: 'frame',
    title: 'Draw a frame',
    hint: 'Press F and drag on the canvas, or pick a device preset from ⌘K.',
  },
  {
    id: 'shape',
    title: 'Add a shape',
    hint: 'Press R for a rectangle or O for an ellipse, then drag.',
  },
  { id: 'text', title: 'Write some text', hint: 'Press T and click anywhere, then type.' },
  {
    id: 'style',
    title: 'Change a fill or stroke',
    hint: 'Select a layer and edit Fill in the inspector.',
  },
  { id: 'group', title: 'Group two layers', hint: 'Shift-click two layers, then press ⌘G.' },
  {
    id: 'export',
    title: 'Export your work',
    hint: 'Open Export in the toolbar and download a PNG or SVG.',
  },
] as const;
export type StepId = (typeof CHECKLIST_STEPS)[number]['id'];

export const HINTS: Record<string, { title: string; body: string }> = {
  rotate: { title: 'Precise rotation', body: 'Hold Shift while rotating to snap to 15° steps.' },
  resize: {
    title: 'Resize tricks',
    body: 'Shift keeps proportions, Alt resizes from the center. Drag any edge, not just the corners.',
  },
  move: {
    title: 'Snapping',
    body: 'Objects snap to neighbours while you drag. Hold ⌘/Ctrl to move freely, Shift to lock an axis.',
  },
  text: {
    title: 'Editing text',
    body: 'Double-click text to edit it. Esc or ⌘↵ commits. Enter on a selected text layer also opens it.',
  },
  multiselect: {
    title: 'Working with several layers',
    body: 'Shift-click adds to the selection, ⌘G groups, the inspector aligns and distributes.',
  },
  group: {
    title: 'Inside a group',
    body: 'Double-click a group to select its children; Shift+↵ selects the parent again.',
  },
  palette: {
    title: 'Command palette',
    body: 'Press ⌘K / Ctrl+K anytime to search every action by name.',
  },
};

interface OnboardingState {
  userId: string | null;
  done: Set<StepId>;
  dismissed: boolean;
  seenHints: Set<string>;
  activeHint: { id: string; title: string; body: string } | null;
  load(userId: string): void;
  complete(step: StepId): void;
  dismiss(): void;
  reset(): void;
  showHint(id: string): void;
  closeHint(): void;
}

const key = (userId: string) => `sigma:onboarding:${userId}`;
function persist(s: OnboardingState): void {
  if (!s.userId) return;
  try {
    localStorage.setItem(
      key(s.userId),
      JSON.stringify({ done: [...s.done], dismissed: s.dismissed, seenHints: [...s.seenHints] }),
    );
  } catch {
    /* storage may be unavailable */
  }
}

/** Per-user onboarding progress (checklist + one-time hints), persisted in the browser. */
export const useOnboarding = create<OnboardingState>((set, get) => ({
  userId: null,
  done: new Set(),
  dismissed: false,
  seenHints: new Set(),
  activeHint: null,
  load: (userId) => {
    let done: StepId[] = [];
    let dismissed = false;
    let seenHints: string[] = [];
    try {
      const raw = localStorage.getItem(key(userId));
      if (raw)
        ({
          done = [],
          dismissed = false,
          seenHints = [],
        } = JSON.parse(raw) as { done?: StepId[]; dismissed?: boolean; seenHints?: string[] });
    } catch {
      /* ignore */
    }
    set({
      userId,
      done: new Set(done),
      dismissed,
      seenHints: new Set(seenHints),
      activeHint: null,
    });
  },
  complete: (step) => {
    if (get().done.has(step)) return;
    const done = new Set(get().done);
    done.add(step);
    set({ done });
    persist(get());
  },
  dismiss: () => {
    set({ dismissed: true });
    persist(get());
  },
  reset: () => {
    set({ done: new Set(), dismissed: false, seenHints: new Set() });
    persist(get());
  },
  showHint: (id) => {
    const hint = HINTS[id];
    if (!hint || get().seenHints.has(id)) return;
    const seenHints = new Set(get().seenHints);
    seenHints.add(id);
    set({ seenHints, activeHint: { id, ...hint } });
    persist(get());
  },
  closeHint: () => set({ activeHint: null }),
}));
