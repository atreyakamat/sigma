import { CheckCircle2, Circle, Lightbulb, X } from 'lucide-react';
import { useEffect } from 'react';
import { CreateNodeCommand } from '@sigma/history';
import { useAuth } from '../authentication/AuthProvider';
import { useEditor } from '../editor/editor-context';
import { CHECKLIST_STEPS, useOnboarding } from './store';

/** Binds engine events to checklist progress and one-time hints. */
export function useOnboardingBindings(enabled: boolean): void {
  const editor = useEditor();
  const { user } = useAuth();
  const { load, complete, showHint } = useOnboarding();
  useEffect(() => {
    if (user) load(user.id);
  }, [user, load]);
  useEffect(() => {
    if (!enabled) return;
    const offs = [
      editor.history.events.on('execute', ({ command }) => {
        const name = command.name;
        if (command instanceof CreateNodeCommand) {
          const type = editor.graph.getNode(command.nodeId)?.type;
          if (type === 'FRAME') complete('frame');
          else if (
            type === 'RECTANGLE' ||
            type === 'ELLIPSE' ||
            type === 'LINE' ||
            type === 'POLYGON' ||
            type === 'STAR'
          )
            complete('shape');
          else if (type === 'TEXT') {
            complete('text');
            showHint('text');
          }
          return;
        }
        if (name === 'Edit text') {
          complete('text');
          showHint('text');
        } else if (/fill|stroke|style/i.test(name)) complete('style');
        else if (name === 'Group') {
          complete('group');
          showHint('group');
        } else if (name === 'Rotate') showHint('rotate');
        else if (name === 'Resize') showHint('resize');
        else if (name.startsWith('Move')) showHint('move');
      }),
      editor.selection.events.on('change', ({ ids }) => {
        if (ids.length >= 2) showHint('multiselect');
      }),
    ];
    const t = setTimeout(() => showHint('palette'), 20_000);
    return () => {
      offs.forEach((o) => o());
      clearTimeout(t);
    };
  }, [editor, enabled, complete, showHint]);
}

export function OnboardingChecklist() {
  const { done, dismissed, dismiss } = useOnboarding();
  if (dismissed || done.size === CHECKLIST_STEPS.length) return null;
  const next = CHECKLIST_STEPS.find((s) => !done.has(s.id));
  return (
    <div
      className="pointer-events-auto w-72 rounded-xl border border-ink-600 bg-ink-850/95 p-3 shadow-2xl backdrop-blur"
      data-testid="onboarding-checklist"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold">
          Get started · {done.size}/{CHECKLIST_STEPS.length}
        </span>
        <button className="icon-btn h-6 w-6" title="Hide" onClick={dismiss}>
          <X size={12} />
        </button>
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded bg-ink-700">
        <div
          className="h-full bg-accent-500 transition-all"
          style={{ width: `${(done.size / CHECKLIST_STEPS.length) * 100}%` }}
        />
      </div>
      <ul className="space-y-1">
        {CHECKLIST_STEPS.map((s) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-[12px] ${done.has(s.id) ? 'text-ink-500 line-through' : 'text-ink-200'}`}
          >
            {done.has(s.id) ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : (
              <Circle size={14} className="text-ink-500" />
            )}
            {s.title}
          </li>
        ))}
      </ul>
      {next && (
        <p className="mt-2 rounded-md bg-ink-800 px-2 py-1.5 text-[11px] text-ink-300">
          {next.hint}
        </p>
      )}
    </div>
  );
}

export function HintToast() {
  const { activeHint, closeHint } = useOnboarding();
  useEffect(() => {
    if (!activeHint) return;
    const t = setTimeout(closeHint, 9000);
    return () => clearTimeout(t);
  }, [activeHint, closeHint]);
  if (!activeHint) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-80 items-start gap-2 rounded-xl border border-accent-500/40 bg-ink-850/95 p-3 text-[12px] shadow-2xl backdrop-blur"
      data-testid="hint"
    >
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-400" />
      <div className="flex-1">
        <div className="font-semibold">{activeHint.title}</div>
        <div className="mt-0.5 text-ink-300">{activeHint.body}</div>
      </div>
      <button className="icon-btn h-6 w-6" onClick={closeHint} title="Dismiss">
        <X size={12} />
      </button>
    </div>
  );
}
