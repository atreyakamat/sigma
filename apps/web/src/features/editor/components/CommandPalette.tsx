import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorCommand } from '../commands';
import { fuzzyScore } from '../commands';

const RECENT_KEY = 'sigma:palette:recent';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: EditorCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, score: fuzzyScore(query, `${c.title} ${c.keywords ?? ''} ${c.group}`) }))
      .filter((r): r is { c: EditorCommand; score: number } => r.score !== null);
    if (!query) {
      const rank = (c: EditorCommand) => {
        const i = recent.indexOf(c.id);
        return i === -1 ? 1000 : i;
      };
      scored.sort((a, b) => rank(a.c) - rank(b.c));
    } else {
      scored.sort((a, b) => a.score - b.score);
    }
    return scored.map((r) => r.c).slice(0, 40);
  }, [commands, query, recent]);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => setIndex(0), [query]);

  const run = (c: EditorCommand) => {
    if (c.enabled && !c.enabled()) return;
    const next = [c.id, ...recent.filter((id) => id !== c.id)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    onClose();
    c.run();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-[34rem] overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl"
      >
        <input
          ref={input}
          className="h-12 w-full border-b border-ink-700 bg-transparent px-4 text-[14px] outline-none placeholder:text-ink-500"
          placeholder="Type a command… (tools, arrange, view, export)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, results.length - 1));
            else if (e.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0));
            else if (e.key === 'Enter' && results[index]) run(results[index]);
            else if (e.key === 'Escape') onClose();
          }}
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1 scrollbar-thin" role="listbox">
          {results.length === 0 && <li className="px-4 py-3 text-ink-500">No matching command</li>}
          {results.map((c, i) => {
            const disabled = c.enabled ? !c.enabled() : false;
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(c)}
                className={`flex cursor-default items-center gap-3 px-4 py-1.5 text-[12px] ${i === index ? 'bg-accent-500/20' : ''} ${disabled ? 'opacity-40' : ''}`}
              >
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-ink-500">
                  {c.group}
                </span>
                <span className="flex-1">{c.title}</span>
                {!query && recent.includes(c.id) && (
                  <span className="text-[10px] text-ink-500">recent</span>
                )}
                {c.shortcut && (
                  <kbd className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">
                    {c.shortcut}
                  </kbd>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
