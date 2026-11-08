import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-400',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600',
  ghost: 'text-ink-300 hover:bg-ink-700 hover:text-ink-100',
  danger: 'bg-red-600/90 text-white hover:bg-red-500',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}
