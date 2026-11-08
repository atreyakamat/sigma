import { useMemo, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { useEditor } from '../editor-context';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map(
      (p) =>
        ({
          mod: IS_MAC ? '⌘' : 'Ctrl',
          shift: '⇧',
          alt: IS_MAC ? '⌥' : 'Alt',
          up: '↑',
          down: '↓',
          left: '←',
          right: '→',
          space: 'Space',
          escape: 'Esc',
          enter: '↵',
          backspace: '⌫',
          delete: 'Del',
        })[p] ?? p.toUpperCase(),
    )
    .join(IS_MAC ? '' : '+');
}

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return editor.keymap
      .list()
      .filter((r) => r.description && !seen.has(r.combo) && seen.add(r.combo))
      .filter(
        (r) =>
          !q ||
          r.description.toLowerCase().includes(q.toLowerCase()) ||
          r.combo.includes(q.toLowerCase()),
      )
      .sort((a, b) => a.description.localeCompare(b.description));
  }, [editor, q]);
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width="w-[36rem]">
      <input
        className="field mb-3 h-8"
        placeholder="Filter shortcuts"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="max-h-[55vh] overflow-y-auto scrollbar-thin">
        <table className="w-full text-[12px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.combo} className="border-t border-ink-700">
                <td className="py-1.5 text-ink-200">{r.description}</td>
                <td className="py-1.5 text-right">
                  <kbd className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] text-ink-300">
                    {formatCombo(r.combo)}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-ink-500">
          Also: hold Space to pan, ⌘/Ctrl + scroll to zoom, double-click a group to enter it,
          double-click text to edit, ⌘K for the command palette.
        </p>
      </div>
    </Modal>
  );
}
