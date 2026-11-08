import { useEffect } from 'react';

export function Modal({
  title,
  onClose,
  children,
  width = 'w-[28rem]',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`max-h-full overflow-y-auto rounded-xl border border-ink-600 bg-ink-850 p-5 shadow-2xl ${width}`}
      >
        <h2 className="mb-4 text-[14px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-[12px]">
      <span className="mb-1 block text-ink-300">{label}</span>
      {children}
    </label>
  );
}
