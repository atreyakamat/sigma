import { useEffect, useState } from 'react';
import type { Color } from '@sigma/document';
import { colorToHex, hexToColor } from '@sigma/document';

/** Numeric input that commits on Enter/blur, supports arrow nudging and mixed values. */
export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  className = '',
}: {
  label: string;
  value: number | 'mixed';
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  const fmt = (v: number | 'mixed') => (v === 'mixed' ? '' : String(Number(v.toFixed(2))));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = (raw: string) => {
    const expr = raw.replace(/[^0-9+\-*/.() ]/g, '');
    if (!expr.trim()) return setText(fmt(value));
    let v: number;
    try {
      v = Function(`"use strict";return (${expr})`)() as number;
    } catch {
      return setText(fmt(value));
    }
    if (typeof v !== 'number' || Number.isNaN(v)) return setText(fmt(value));
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (v !== value) onChange(v);
    setText(fmt(v));
  };
  return (
    <label
      className={`flex h-7 items-center rounded-md bg-ink-750 px-1.5 hover:ring-1 hover:ring-ink-600 focus-within:ring-1 focus-within:ring-accent-500 ${className}`}
    >
      <span className="w-4 shrink-0 text-[10px] text-ink-400">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent text-[12px] text-ink-100 outline-none"
        aria-label={label || undefined}
        value={text}
        placeholder={value === 'mixed' ? 'Mixed' : ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            e.currentTarget.blur();
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== 'mixed') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
            let v = value + d;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(Number(v.toFixed(4)));
          }
        }}
      />
      {suffix && <span className="text-[10px] text-ink-400">{suffix}</span>}
    </label>
  );
}

export function ColorField({
  color,
  opacity,
  onChange,
}: {
  color: Color;
  opacity: number;
  onChange: (color: Color, opacity: number) => void;
}) {
  const hex = colorToHex(color);
  const [text, setText] = useState(hex.slice(1).toUpperCase());
  useEffect(() => setText(hex.slice(1).toUpperCase()), [hex]);
  return (
    <div className="flex h-7 flex-1 items-center gap-1.5 rounded-md bg-ink-750 px-1.5 hover:ring-1 hover:ring-ink-600">
      <label
        className="relative h-4 w-4 shrink-0 cursor-pointer overflow-hidden rounded-sm ring-1 ring-ink-500"
        style={{ background: hex }}
      >
        <input
          type="color"
          value={hex}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) =>
            onChange({ ...(hexToColor(e.target.value) as Color), a: color.a }, opacity)
          }
        />
      </label>
      <input
        className="w-16 bg-transparent text-[12px] uppercase text-ink-100 outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const c = hexToColor(e.target.value);
          if (c) onChange({ ...c, a: color.a }, opacity);
          else setText(hex.slice(1).toUpperCase());
        }}
      />
      <NumberField
        label=""
        value={Math.round(opacity * 100)}
        min={0}
        max={100}
        suffix="%"
        className="w-[4.5rem] bg-transparent px-0 hover:ring-0"
        onChange={(v) => onChange(color, v / 100)}
      />
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-b border-ink-700 px-3 py-2.5">
      <div className="mb-2 flex h-5 items-center justify-between">
        <h3 className="text-[11px] font-semibold text-ink-200">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T | 'mixed';
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <select
      className={`field ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {value === 'mixed' && <option value="mixed">Mixed</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
