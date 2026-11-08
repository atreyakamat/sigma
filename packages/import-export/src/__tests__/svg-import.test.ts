import { describe, expect, it } from 'vitest';
import type { NodeJSON } from '@sigma/document';
import { importSvg } from '../svg-import';

const SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect x="10" y="10" width="50" height="30" rx="4" fill="#ff0000" stroke="#000" stroke-width="2"/>
  <circle cx="100" cy="50" r="20" fill="rgb(0, 0, 255)" fill-opacity="0.5"/>
  <g transform="translate(120 20) scale(2)">
    <path d="M0 0 L10 0 L10 10 Z" fill="none" stroke="#00ff00"/>
    <text x="0" y="30" font-size="12" font-family="Arial" fill="#333">Hello</text>
  </g>
  <line x1="0" y1="90" x2="200" y2="90" stroke="#999"/>
  <polygon points="150,80 170,80 160,95" style="fill:#abcdef;opacity:0.8"/>
  <ellipse cx="30" cy="70" rx="10" ry="5"/>
</svg>`;

describe('importSvg', () => {
  it('converts basic shapes, groups, transforms and styles into nodes', () => {
    const result = importSvg(SVG);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    const names = result.nodes.map((n) => n.type);
    expect(names).toEqual(['RECTANGLE', 'ELLIPSE', 'GROUP', 'LINE', 'VECTOR', 'ELLIPSE']);
    const rect = result.nodes[0]!;
    expect(rect.transform).toMatchObject({ x: 10, y: 10 });
    expect(rect.size).toEqual({ width: 50, height: 30 });
    expect(rect.style?.cornerRadius).toBe(4);
    expect(rect.style?.fills?.[0]).toMatchObject({ type: 'SOLID', color: { r: 1, g: 0, b: 0 } });
    expect(rect.style?.strokes?.[0]).toMatchObject({ width: 2, align: 'CENTER' });
    const circle = result.nodes[1]!;
    expect(circle.transform).toMatchObject({ x: 80, y: 30 });
    expect(circle.size).toEqual({ width: 40, height: 40 });
    expect(circle.style?.fills?.[0]).toMatchObject({
      type: 'SOLID',
      color: { r: 0, g: 0, b: 1 },
      opacity: 0.5,
    });
    const group = result.nodes[2]!;
    expect(group.children).toHaveLength(2);
    const path = group.children![0]!;
    expect(path.type).toBe('VECTOR');
    // translate(120 20) scale(2): path spans 0..20 world units inside the group.
    expect(path.transform).toMatchObject({ x: 120, y: 20 });
    expect(path.size).toEqual({ width: 20, height: 20 });
    expect(path.style?.fills).toHaveLength(0);
    expect(path.style?.strokes?.[0]).toMatchObject({ paint: { color: { r: 0, g: 1, b: 0 } } });
    const text = group.children![1]! as Extract<NodeJSON, { type: 'TEXT' }>;
    expect(text.type).toBe('TEXT');
    expect(text.characters).toBe('Hello');
    expect(text.textStyle?.fontSize).toBe(24); // scaled by 2
    const line = result.nodes[3]!;
    expect(line.size?.width).toBe(200);
    const poly = result.nodes[4]!;
    expect(poly.style?.opacity).toBe(0.8);
    expect(poly.transform).toMatchObject({ x: 150, y: 80 });
  });
  it('rejects non-SVG input', () => {
    expect(() => importSvg('<html></html>')).toThrow(/not an SVG/i);
  });
});
