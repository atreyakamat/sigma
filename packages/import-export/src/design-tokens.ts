import type { Color, DocumentJSON, NodeJSON, TextStyle } from '@sigma/document';
import { colorToHex } from '@sigma/document';

export interface ColorToken {
  name: string;
  hex: string;
  /** Alpha 0..1 when not fully opaque. */
  alpha: number;
  usages: number;
  /** Layer names that use it (first few). */
  usedBy: string[];
}
export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  usages: number;
  usedBy: string[];
}
export interface SpacingToken {
  name: string;
  value: number;
  usages: number;
}
export interface DesignTokens {
  colors: ColorToken[];
  typography: TypographyToken[];
  radii: SpacingToken[];
  generatedAt: string;
  document: { id: string; name: string };
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'token';

/**
 * Extracts reusable values from a document: solid colors (fills and strokes), text styles and
 * corner radii. Names come from the layer that uses the value most, so a rectangle called
 * "Primary button" yields `--color-primary-button`.
 */
export function extractDesignTokens(
  doc: DocumentJSON,
  options: { approvedOnly?: boolean } = {},
): DesignTokens {
  const colors = new Map<string, ColorToken & { byName: Map<string, number> }>();
  const type = new Map<string, TypographyToken & { byName: Map<string, number> }>();
  const radii = new Map<number, SpacingToken>();

  const addColor = (c: Color, opacity: number, layer: string): void => {
    const alpha = Math.round(c.a * opacity * 100) / 100;
    const key = `${colorToHex(c)}@${alpha}`;
    const entry = colors.get(key) ?? {
      name: '',
      hex: colorToHex(c),
      alpha,
      usages: 0,
      usedBy: [],
      byName: new Map(),
    };
    entry.usages++;
    entry.byName.set(layer, (entry.byName.get(layer) ?? 0) + 1);
    colors.set(key, entry);
  };
  const visit = (node: NodeJSON): void => {
    if (options.approvedOnly && node.type === 'FRAME') {
      const review = (node.metadata as { review?: { state?: string } } | undefined)?.review;
      if (review?.state !== 'APPROVED') return;
    }
    if (node.type !== 'PAGE' && node.type !== 'GROUP') {
      for (const f of node.style.fills)
        if (f.visible && f.type === 'SOLID') addColor(f.color, f.opacity, node.name);
      for (const s of node.style.strokes)
        if (s.visible && s.paint.type === 'SOLID')
          addColor(s.paint.color, s.paint.opacity, node.name);
      const r = node.style.cornerRadius;
      const radius = typeof r === 'number' ? r : Math.max(...r);
      if (radius > 0) {
        const e = radii.get(radius) ?? { name: `radius-${radius}`, value: radius, usages: 0 };
        e.usages++;
        radii.set(radius, e);
      }
    }
    if (node.type === 'TEXT') {
      const t: TextStyle = node.textStyle;
      const key = `${t.fontFamily}|${t.fontSize}|${t.fontWeight}|${t.lineHeight}|${t.letterSpacing}`;
      const e = type.get(key) ?? {
        name: '',
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing,
        usages: 0,
        usedBy: [],
        byName: new Map(),
      };
      e.usages++;
      e.byName.set(node.name, (e.byName.get(node.name) ?? 0) + 1);
      type.set(key, e);
    }
    node.children?.forEach(visit);
  };
  doc.pages.forEach((p) => p.children?.forEach(visit));

  const finish = <T extends { name: string; usedBy: string[]; byName: Map<string, number> }>(
    items: T[],
    prefix: string,
  ) => {
    const used = new Set<string>();
    return items
      .sort(
        (a, b) =>
          (b as unknown as { usages: number }).usages - (a as unknown as { usages: number }).usages,
      )
      .map((e, i) => {
        const [top] = [...e.byName.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
        let name = top ? slug(top) : `${prefix}-${i + 1}`;
        if (used.has(name)) name = `${name}-${i + 1}`;
        used.add(name);
        const { byName, ...rest } = e;
        return { ...rest, name, usedBy: [...byName.keys()].slice(0, 5) };
      });
  };
  return {
    colors: finish([...colors.values()], 'color'),
    typography: finish([...type.values()], 'text'),
    radii: [...radii.values()].sort((a, b) => b.usages - a.usages),
    generatedAt: new Date().toISOString(),
    document: { id: doc.id, name: doc.name },
  };
}

export function tokensToCss(tokens: DesignTokens): string {
  const lines = [':root {'];
  for (const c of tokens.colors)
    lines.push(`  --color-${c.name}: ${c.alpha < 1 ? hexToRgba(c.hex, c.alpha) : c.hex};`);
  for (const t of tokens.typography) {
    lines.push(
      `  --font-${t.name}: ${t.fontWeight} ${t.fontSize}px/${t.lineHeight} "${t.fontFamily}", system-ui, sans-serif;`,
    );
    if (t.letterSpacing) lines.push(`  --tracking-${t.name}: ${t.letterSpacing}px;`);
  }
  for (const r of tokens.radii) lines.push(`  --${r.name}: ${r.value}px;`);
  lines.push('}');
  return `/* Generated by SIGMA from "${tokens.document.name}" at ${tokens.generatedAt} */\n${lines.join('\n')}\n`;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
