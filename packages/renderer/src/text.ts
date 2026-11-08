import type { TextProps, TextStyle } from '@sigma/document';

export interface TextLine {
  text: string;
  width: number;
}

export interface TextLayout {
  lines: TextLine[];
  width: number;
  height: number;
  lineHeightPx: number;
  fontSizePx: number;
}

export function cssFont(style: TextStyle, scale = 1): string {
  const italic = style.fontStyle === 'ITALIC' ? 'italic ' : '';
  return `${italic}${style.fontWeight} ${style.fontSize * scale}px "${style.fontFamily}", system-ui, sans-serif`;
}

export function applyTextTransform(text: string, transform: TextStyle['textTransform']): string {
  switch (transform) {
    case 'UPPERCASE':
      return text.toUpperCase();
    case 'LOWERCASE':
      return text.toLowerCase();
    case 'CAPITALIZE':
      return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    default:
      return text;
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** Measures text width in CSS px; falls back to an estimate outside the browser. */
export function measureTextWidth(text: string, style: TextStyle): number {
  const ctx = getMeasureContext();
  const spacing = style.letterSpacing * Math.max(0, text.length - 1);
  if (!ctx) return text.length * style.fontSize * 0.55 + spacing;
  ctx.font = cssFont(style);
  return ctx.measureText(text).width + spacing;
}

/**
 * Lays out text into lines. For autoResize WIDTH_AND_HEIGHT no wrapping occurs (only explicit
 * newlines); otherwise words wrap at `maxWidth`.
 */
export function layoutText(
  node: Pick<TextProps, 'characters' | 'textStyle' | 'autoResize' | 'size'>,
): TextLayout {
  const style = node.textStyle;
  const text = applyTextTransform(node.characters, style.textTransform);
  const lineHeightPx = style.fontSize * style.lineHeight;
  const lines: TextLine[] = [];
  const paragraphs = text.split('\n');
  const wrap = node.autoResize !== 'WIDTH_AND_HEIGHT';
  const maxWidth = wrap ? Math.max(1, node.size.width) : Infinity;

  for (const paragraph of paragraphs) {
    if (!wrap || measureTextWidth(paragraph, style) <= maxWidth) {
      lines.push({ text: paragraph, width: measureTextWidth(paragraph, style) });
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let current = '';
    for (const word of words) {
      const candidate = current + word;
      if (current && measureTextWidth(candidate.trimEnd(), style) > maxWidth) {
        lines.push({ text: current.trimEnd(), width: measureTextWidth(current.trimEnd(), style) });
        current = word.trim() ? word : '';
      } else {
        current = candidate;
      }
    }
    lines.push({ text: current.trimEnd(), width: measureTextWidth(current.trimEnd(), style) });
  }

  const width = lines.reduce((m, l) => Math.max(m, l.width), 0);
  return {
    lines,
    width,
    height: lines.length * lineHeightPx,
    lineHeightPx,
    fontSizePx: style.fontSize,
  };
}
