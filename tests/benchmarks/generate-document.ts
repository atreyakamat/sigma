import type { DocumentJSON, NodeJSON } from '@sigma/document';

/** Deterministic PRNG (mulberry32) so benchmark documents are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchmarkDocumentOptions {
  /** Total number of non-page nodes. */
  nodeCount: number;
  /** Nodes per frame (frames are laid out on a grid). */
  perFrame?: number;
  seed?: number;
}

/**
 * Builds a document resembling a real design file: a grid of 400×300 frames, each filled with a
 * mix of rectangles (60%), ellipses (20%), text (15%) and lines (5%), with fills and some strokes.
 */
export function generateBenchmarkDocument({
  nodeCount,
  perFrame = 24,
  seed = 42,
}: BenchmarkDocumentOptions): DocumentJSON {
  const rand = rng(seed);
  const frames: NodeJSON[] = [];
  const frameCount = Math.max(1, Math.ceil(nodeCount / perFrame));
  const cols = Math.ceil(Math.sqrt(frameCount));
  let remaining = nodeCount;
  let id = 0;
  const nextId = (p: string) => `${p}${(id++).toString(36)}`;
  for (let f = 0; f < frameCount && remaining > 0; f++) {
    const children: NodeJSON[] = [];
    const inThis = Math.min(perFrame - 1, remaining - 1);
    for (let i = 0; i < inThis; i++) {
      const r = rand();
      const x = Math.round(rand() * 340);
      const y = Math.round(rand() * 240);
      const w = Math.round(20 + rand() * 120);
      const h = Math.round(20 + rand() * 80);
      const color = { r: rand(), g: rand(), b: rand(), a: 1 };
      const base = {
        transform: {
          x,
          y,
          rotation: rand() < 0.1 ? Math.round(rand() * 90) : 0,
          scaleX: 1,
          scaleY: 1,
        },
        size: { width: w, height: h },
      };
      const stroke =
        rand() < 0.3
          ? [
              {
                paint: { type: 'SOLID' as const, color: { r: 0, g: 0, b: 0, a: 1 } },
                width: 1 + Math.round(rand() * 2),
                align: 'INSIDE' as const,
              },
            ]
          : [];
      if (r < 0.6) {
        children.push({
          id: nextId('r'),
          type: 'RECTANGLE',
          name: `Rect ${i}`,
          ...base,
          style: {
            fills: [{ type: 'SOLID', color }],
            strokes: stroke,
            cornerRadius: rand() < 0.4 ? 8 : 0,
          },
        } as NodeJSON);
      } else if (r < 0.8) {
        children.push({
          id: nextId('e'),
          type: 'ELLIPSE',
          name: `Ellipse ${i}`,
          ...base,
          style: { fills: [{ type: 'SOLID', color }], strokes: stroke },
        } as NodeJSON);
      } else if (r < 0.95) {
        children.push({
          id: nextId('t'),
          type: 'TEXT',
          name: `Text ${i}`,
          ...base,
          characters: `Label ${i}`,
          textStyle: { fontSize: 12 + Math.round(rand() * 12) },
          autoResize: 'NONE',
          style: { fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }] },
        } as NodeJSON);
      } else {
        children.push({
          id: nextId('l'),
          type: 'LINE',
          name: `Line ${i}`,
          transform: base.transform,
          size: { width: w, height: 0 },
          style: { strokes: [{ paint: { type: 'SOLID', color }, width: 2, align: 'CENTER' }] },
        } as NodeJSON);
      }
    }
    frames.push({
      id: nextId('f'),
      type: 'FRAME',
      name: `Screen ${f + 1}`,
      transform: {
        x: (f % cols) * 460,
        y: Math.floor(f / cols) * 360,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      size: { width: 400, height: 300 },
      style: { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
      children,
    } as NodeJSON);
    remaining -= inThis + 1;
  }
  return {
    schemaVersion: 1,
    id: `bench-${nodeCount}`,
    name: `Benchmark ${nodeCount}`,
    metadata: {},
    pages: [{ id: 'page-1', type: 'PAGE', name: 'Page 1', children: frames } as NodeJSON],
  };
}

export const BENCHMARK_SIZES = [100, 1_000, 10_000] as const;
