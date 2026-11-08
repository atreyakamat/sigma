import { create } from 'zustand';

interface Toast {
  id: number;
  kind: 'error' | 'success' | 'info';
  text: string;
}
interface ToastState {
  toasts: Toast[];
  push(kind: Toast['kind'], text: string): void;
  dismiss(id: number): void;
}
let seq = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      kind === 'error' ? 7000 : 3500,
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  error: (text: string) => useToasts.getState().push('error', text),
  success: (text: string) => useToasts.getState().push('success', text),
  info: (text: string) => useToasts.getState().push('info', text),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-[12px] shadow-xl ${t.kind === 'error' ? 'border-red-500/40 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100' : 'border-ink-600 bg-ink-800 text-ink-100'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
