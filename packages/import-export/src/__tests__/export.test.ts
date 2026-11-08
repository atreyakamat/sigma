import { describe, expect, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { SceneGraph, createNodeProps } from '@sigma/document';
import { exportSvg, parseDocumentFile, serializeDocument, sniffImageMime } from '../index';

describe('exportSvg', () => {
  it('exports a page with shapes, transforms and text', () => {
    const g = SceneGraph.createEmpty();
    const page = g.pageIds[0] as NodeId;
    const frame = g.insertNode(
      createNodeProps('FRAME', {
        name: 'F',
        transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 200, height: 100 },
      }),
      page,
    );
    g.insertNode(
      createNodeProps('RECTANGLE', {
        name: 'R',
        transform: { x: 5, y: 5, rotation: 45, scaleX: 1, scaleY: 1 },
        size: { width: 50, height: 20 },
        style: {
          fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
          strokes: [
            {
              paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } },
              width: 2,
              align: 'CENTER',
            },
          ],
          cornerRadius: 4,
        },
      }),
      frame,
    );
    g.insertNode(createNodeProps('ELLIPSE', { size: { width: 30, height: 30 } }), frame);
    g.insertNode(
      createNodeProps('TEXT', { characters: 'Hi <there>', size: { width: 80, height: 20 } }),
      frame,
    );
    g.insertNode(createNodeProps('LINE', { size: { width: 40, height: 0 } }), frame);
    g.insertNode(createNodeProps('STAR', { size: { width: 40, height: 40 } }), frame);
    const svg = exportSvg(g, [page]);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('viewBox="10 10 200 100"');
    expect(svg).toContain('<rect x="0" y="0" width="50" height="20" rx="4" fill="#ff0000"/>');
    expect(svg).toContain('matrix(0.707 0.707 -0.707 0.707 5 5)');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('Hi &lt;there&gt;');
    expect(svg).toContain('<line');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('clipPath'); // frame clips content
    expect(exportSvg(g, [page], { prolog: true }).startsWith('<?xml')).toBe(true);
  });

  it('exports a single node positioned at its world location', () => {
    const g = SceneGraph.createEmpty();
    const page = g.pageIds[0] as NodeId;
    const r = g.insertNode(
      createNodeProps('RECTANGLE', {
        transform: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: 10, height: 10 },
      }),
      page,
    );
    const svg = exportSvg(g, [r]);
    expect(svg).toContain('viewBox="100 50 10 10"');
  });
});

describe('document file', () => {
  it('round-trips and validates', () => {
    const g = SceneGraph.createEmpty('Doc');
    const text = serializeDocument(g.toJSON());
    expect(parseDocumentFile(text)).toEqual(g.toJSON());
    expect(() => parseDocumentFile('{')).toThrow(/JSON/);
    expect(() => parseDocumentFile('{"schemaVersion":1}')).toThrow();
  });
});

describe('sniffImageMime', () => {
  it('detects formats from magic bytes, not extensions', () => {
    expect(
      sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])),
    ).toBe('image/png');
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp');
    expect(
      sniffImageMime(
        new TextEncoder().encode(
          '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        ),
      ),
    ).toBe('image/svg+xml');
    expect(sniffImageMime(new TextEncoder().encode('<html><script>'))).toBeNull();
    expect(sniffImageMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('design tokens', () => {
  it('extracts named colors, typography and radii and renders CSS', async () => {
    const { extractDesignTokens, tokensToCss } = await import('../design-tokens');
    const g = SceneGraph.createEmpty();
    const page = g.pageIds[0] as NodeId;
    const red = { r: 1, g: 0, b: 0, a: 1 };
    g.insertNode(
      createNodeProps('RECTANGLE', {
        name: 'Primary button',
        size: { width: 10, height: 10 },
        style: { fills: [{ type: 'SOLID', color: red }], cornerRadius: 8 },
      }),
      page,
    );
    g.insertNode(
      createNodeProps('RECTANGLE', {
        name: 'Primary button',
        size: { width: 10, height: 10 },
        style: { fills: [{ type: 'SOLID', color: red }], cornerRadius: 8 },
      }),
      page,
    );
    g.insertNode(
      createNodeProps('ELLIPSE', {
        name: 'Dot',
        size: { width: 10, height: 10 },
        style: { fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 0.5 }] },
      }),
      page,
    );
    g.insertNode(
      createNodeProps('TEXT', {
        name: 'Heading',
        characters: 'Hi',
        textStyle: { fontSize: 32, fontWeight: 700 },
      }),
      page,
    );
    const t = extractDesignTokens(g.toJSON());
    expect(t.colors[0]).toMatchObject({ name: 'primary-button', hex: '#ff0000', usages: 2 });
    expect(t.colors[1]).toMatchObject({ name: 'dot', alpha: 0.5 });
    expect(t.typography[0]).toMatchObject({ name: 'heading', fontSize: 32, fontWeight: 700 });
    expect(t.radii[0]).toMatchObject({ value: 8, usages: 2 });
    const css = tokensToCss(t);
    expect(css).toContain('--color-primary-button: #ff0000;');
    expect(css).toContain('--color-dot: rgba(0, 0, 255, 0.5);');
    expect(css).toContain('--font-heading: 700 32px/1.2 "Inter"');
    expect(css).toContain('--radius-8: 8px;');
  });
});
