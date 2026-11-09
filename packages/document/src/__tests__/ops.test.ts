import { describe, expect, it } from 'vitest';
import { SceneGraph } from '../scene-graph';
import { applyDocumentOps, outlineDocument } from '../ops';
import type { DocumentOp } from '../ops';

const empty = () => SceneGraph.createEmpty('Doc').toJSON();

describe('applyDocumentOps', () => {
  it('adds nodes with refs, nests them, and reports created ids', () => {
    const ops: DocumentOp[] = [
      {
        op: 'add',
        type: 'FRAME',
        ref: 'screen',
        name: 'Home',
        x: 0,
        y: 0,
        width: 390,
        height: 844,
        fill: '#ffffff',
      },
      {
        op: 'add',
        type: 'RECTANGLE',
        parent: '$screen',
        name: 'Hero',
        x: 20,
        y: 40,
        width: 350,
        height: 200,
        fill: '#2563eb',
        cornerRadius: 16,
      },
      {
        op: 'add',
        type: 'TEXT',
        parent: '$screen',
        name: 'Title',
        x: 20,
        y: 260,
        text: 'Welcome',
        fontSize: 32,
        fill: '#111111',
      },
    ];
    const { content, results } = applyDocumentOps(empty(), ops);
    const frame = content.pages[0]!.children![0]!;
    expect(frame).toMatchObject({ type: 'FRAME', name: 'Home', size: { width: 390, height: 844 } });
    expect(frame.children!.map((c) => c.name)).toEqual(['Hero', 'Title']);
    const hero = frame.children![0] as unknown as {
      style: { fills: { color: { b: number } }[]; cornerRadius: number };
    };
    expect(hero.style.cornerRadius).toBe(16);
    expect(hero.style.fills[0]!.color.b).toBeCloseTo(0xeb / 255);
    const title = frame.children![1] as unknown as {
      characters: string;
      textStyle: { fontSize: number };
    };
    expect(title.characters).toBe('Welcome');
    expect(title.textStyle.fontSize).toBe(32);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(results[0]!.id).toBe(frame.id);
  });

  it('updates, moves, renames and deletes existing nodes', () => {
    const first = applyDocumentOps(empty(), [
      { op: 'add', type: 'FRAME', ref: 'a', name: 'A' },
      { op: 'add', type: 'FRAME', ref: 'b', name: 'B', x: 500 },
      { op: 'add', type: 'ELLIPSE', parent: '$a', ref: 'dot', name: 'Dot' },
    ]);
    const [a, b, dot] = first.results.map((r) => r.id!);
    const { content, results } = applyDocumentOps(first.content, [
      {
        op: 'update',
        id: dot!,
        name: 'Badge',
        x: 12,
        width: 48,
        height: 48,
        fill: '#ff0000',
        opacity: 0.5,
        visible: false,
      },
      { op: 'move', id: dot!, parent: b! },
      { op: 'delete', id: a! },
      { op: 'rename_document', name: 'Renamed' },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(content.name).toBe('Renamed');
    const frames = content.pages[0]!.children!;
    expect(frames.map((f) => f.name)).toEqual(['B']);
    expect(frames[0]!.children![0]).toMatchObject({
      name: 'Badge',
      visible: false,
      size: { width: 48, height: 48 },
      style: { opacity: 0.5 },
    });
  });

  it('reports per-op errors without applying the failing op, and keeps the document valid', () => {
    const { content, results } = applyDocumentOps(empty(), [
      { op: 'update', id: 'missing', name: 'x' },
      { op: 'add', type: 'RECTANGLE', parent: '$nope' },
      { op: 'add', type: 'RECTANGLE', fill: 'not-a-colour' },
      { op: 'add', type: 'RECTANGLE', name: 'Fine' },
    ]);
    expect(results.map((r) => r.ok)).toEqual([false, false, false, true]);
    expect(results[0]!.error).toMatch(/not found/i);
    expect(results[2]!.error).toMatch(/colou?r/i);
    expect(content.pages[0]!.children!.map((c) => c.name)).toEqual(['Fine']);
    expect(() => SceneGraph.fromJSON(content)).not.toThrow();
  });
});

describe('applyDocumentOps validity', () => {
  it('always produces schema-valid documents: defaults are filled and fields a type lacks are rejected', async () => {
    const { parseDocumentJSON } = await import('../schema');
    const { content, results } = applyDocumentOps(empty(), [
      {
        op: 'add',
        type: 'RECTANGLE',
        ref: 'r',
        name: 'Stroked',
        stroke: '#e2e8f0',
        strokeWidth: 2,
        cornerRadius: 8,
      },
      { op: 'add', type: 'TEXT', name: 'Bold', text: 'Hi', fontWeight: 700, fontSize: 20 },
      { op: 'add', type: 'ELLIPSE', name: 'Round', cornerRadius: 4 },
      { op: 'update', id: '$r', text: 'ignored on shapes', opacity: 0.4 },
      { op: 'add', type: 'LINE', name: 'Rule', width: 100, stroke: '#000000' },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, true]);
    expect(content.pages[0]!.children!.map((c) => c.name)).toEqual([
      'Stroked',
      'Bold',
      'Round',
      'Rule',
    ]);
    expect(content.pages[0]!.children![0]).toMatchObject({
      style: { cornerRadius: 8, opacity: 0.4, strokes: [{ width: 2, cap: 'BUTT' }] },
    });
    expect(() => parseDocumentJSON(content)).not.toThrow();
    expect(parseDocumentJSON(content)).toEqual(content); // nothing left for the parser to fill in
  });
});

describe('outlineDocument', () => {
  it('summarises pages and layers compactly with ids, geometry, text and fill', () => {
    const { content } = applyDocumentOps(empty(), [
      { op: 'add', type: 'FRAME', ref: 's', name: 'Home', width: 100, height: 50 },
      { op: 'add', type: 'TEXT', parent: '$s', name: 'T', text: 'Hi there', fill: '#00ff00' },
    ]);
    const outline = outlineDocument(content);
    expect(outline.name).toBe('Doc');
    const frame = outline.pages[0]!.children[0]!;
    expect(frame).toMatchObject({ type: 'FRAME', name: 'Home', w: 100, h: 50 });
    expect(frame.children![0]).toMatchObject({ type: 'TEXT', text: 'Hi there', fill: '#00ff00' });
    expect(typeof frame.id).toBe('string');
  });
  it('truncates very large documents and says so', () => {
    const ops: DocumentOp[] = Array.from({ length: 30 }, (_, i) => ({
      op: 'add',
      type: 'RECTANGLE',
      name: `R${i}`,
    }));
    const { content } = applyDocumentOps(empty(), ops);
    const outline = outlineDocument(content, { maxNodes: 10 });
    expect(outline.truncated).toBe(true);
    expect(outline.pages[0]!.children.length).toBeLessThanOrEqual(10);
  });
});
