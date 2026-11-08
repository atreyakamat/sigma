import type { Color } from './schema';

export function rgba(r: number, g: number, b: number, a = 1): Color {
  return { r: r / 255, g: g / 255, b: b / 255, a };
}

/** Parses #RGB, #RRGGBB or #RRGGBBAA. Returns null for invalid input. */
export function hexToColor(hex: string, alpha?: number): Color | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (h.length === 6) {
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
      a: alpha ?? 1,
    };
  }
  return {
    r: ((n >>> 24) & 255) / 255,
    g: ((n >> 16) & 255) / 255,
    b: ((n >> 8) & 255) / 255,
    a: alpha ?? (n & 255) / 255,
  };
}

const to2 = (v: number): string =>
  Math.round(v * 255)
    .toString(16)
    .padStart(2, '0');

export function colorToHex(c: Color, withAlpha = false): string {
  const base = `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
  return withAlpha ? base + to2(c.a) : base;
}

export function colorToCss(c: Color, opacityMultiplier = 1): string {
  const a = Math.max(0, Math.min(1, c.a * opacityMultiplier));
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
}

export const COLORS = {
  black: { r: 0, g: 0, b: 0, a: 1 } satisfies Color,
  white: { r: 1, g: 1, b: 1, a: 1 } satisfies Color,
  transparent: { r: 0, g: 0, b: 0, a: 0 } satisfies Color,
  defaultFill: { r: 0.851, g: 0.851, b: 0.851, a: 1 } satisfies Color,
  defaultFrame: { r: 1, g: 1, b: 1, a: 1 } satisfies Color,
};
