import type { EditorKeyEvent, Modifiers } from './types';

export type ShortcutHandler = (event: EditorKeyEvent) => boolean | void;

interface Binding {
  combo: string;
  handler: ShortcutHandler;
  description: string;
}

/** Normalizes "Mod+Shift+Z" style combos into a canonical key: "mod+shift+z". */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const key = parts.pop() ?? '';
  const mods = new Set(
    parts.map((p) => (p === 'cmd' || p === 'command' || p === 'ctrl' ? 'mod' : p)),
  );
  const order = ['mod', 'shift', 'alt'];
  return [...order.filter((m) => mods.has(m)), key].join('+');
}

export function comboFromEvent(key: string, modifiers: Modifiers): string {
  const parts: string[] = [];
  if (modifiers.mod) parts.push('mod');
  if (modifiers.shift) parts.push('shift');
  if (modifiers.alt) parts.push('alt');
  let k = key.toLowerCase();
  if (k === ' ') k = 'space';
  if (k === 'arrowup') k = 'up';
  if (k === 'arrowdown') k = 'down';
  if (k === 'arrowleft') k = 'left';
  if (k === 'arrowright') k = 'right';
  parts.push(k);
  return parts.join('+');
}

/** Keyboard shortcut registry. Later registrations for the same combo take precedence. */
export class Keymap {
  private bindings = new Map<string, Binding[]>();

  register(combo: string, handler: ShortcutHandler, description = ''): () => void {
    const key = normalizeCombo(combo);
    const binding: Binding = { combo: key, handler, description };
    const list = this.bindings.get(key) ?? [];
    list.push(binding);
    this.bindings.set(key, list);
    return () => {
      const l = this.bindings.get(key);
      if (!l) return;
      const i = l.indexOf(binding);
      if (i >= 0) l.splice(i, 1);
    };
  }

  /** Returns true if a binding handled the event. */
  handle(event: EditorKeyEvent): boolean {
    const combo = comboFromEvent(event.key, event.modifiers);
    const list = this.bindings.get(combo);
    if (!list || list.length === 0) return false;
    for (let i = list.length - 1; i >= 0; i--) {
      if ((list[i] as Binding).handler(event) !== false) return true;
    }
    return false;
  }

  list(): { combo: string; description: string }[] {
    const out: { combo: string; description: string }[] = [];
    for (const list of this.bindings.values())
      for (const b of list) out.push({ combo: b.combo, description: b.description });
    return out;
  }
}
