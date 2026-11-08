import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, it } from 'vitest';
import type { NodeId } from '@sigma/shared';
import { SceneGraph, parseDocumentJSON } from '@sigma/document';
import { Editor } from '@sigma/engine';
import { UpdateNodesCommand } from '@sigma/history';
import { BENCHMARK_SIZES, generateBenchmarkDocument, rng } from './generate-document';
import type { BenchRow } from './report';
import { envLine, formatTable, timeMedian } from './report';

const rows: BenchRow[] = [];

afterAll(() => {
  const md = `# Headless engine benchmarks\n\n${envLine()}\n\nMedian of 5 runs unless noted. Hit tests are 1,000 random world points against the page's spatial index.\n\n${formatTable(rows)}\n`;
  mkdirSync('results', { recursive: true });
  writeFileSync('results/headless-latest.md', md);
  // eslint-disable-next-line no-console
  console.log(`\n${md}`);
});

describe('headless engine benchmarks', () => {
  for (const size of BENCHMARK_SIZES) {
    it(`${size} nodes`, () => {
      const json = generateBenchmarkDocument({ nodeCount: size });

      rows.push({
        suite: 'document',
        metric: 'validate JSON (zod)',
        nodes: size,
        value: timeMedian(() => parseDocumentJSON(json)),
        unit: 'ms',
      });
      rows.push({
        suite: 'document',
        metric: 'load into SceneGraph',
        nodes: size,
        value: timeMedian(() => SceneGraph.fromJSON(json)),
        unit: 'ms',
      });

      const graph = SceneGraph.fromJSON(json);
      rows.push({
        suite: 'document',
        metric: 'serialize toJSON',
        nodes: size,
        value: timeMedian(() => graph.toJSON()),
        unit: 'ms',
      });
      rows.push({
        suite: 'document',
        metric: 'world bounds (all nodes, cold cache)',
        nodes: size,
        value: timeMedian(() => {
          const g = SceneGraph.fromJSON(json);
          for (const id of g.getDescendantIds(g.pageIds[0] as NodeId)) g.getWorldBounds(id);
        }),
        unit: 'ms',
      });

      const editor = new Editor({ document: json });
      const pageId = editor.currentPageId as NodeId;
      rows.push({
        suite: 'engine',
        metric: 'build spatial index',
        nodes: size,
        value: timeMedian(() => editor.hitTester.rebuild()),
        unit: 'ms',
      });

      const rand = rng(7);
      const bounds = editor.graph.getWorldBounds(pageId);
      const extent = editor.graph
        .getChildIds(pageId)
        .map((id) => editor.graph.getWorldBounds(id))
        .reduce(
          (a, b) => ({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.max(a.x + a.width, b.x + b.width),
            height: Math.max(a.y + a.height, b.y + b.height),
          }),
          { x: 0, y: 0, width: 0, height: 0 },
        );
      void bounds;
      const points = Array.from({ length: 1000 }, () => ({
        x: extent.x + rand() * (extent.width - extent.x),
        y: extent.y + rand() * (extent.height - extent.y),
      }));
      let hits = 0;
      const hitMs = timeMedian(() => {
        hits = 0;
        for (const p of points) if (editor.hitTester.hitTest(p, { tolerance: 2 })) hits++;
      });
      rows.push({
        suite: 'engine',
        metric: 'hit test ×1000 (spatial index)',
        nodes: size,
        value: hitMs,
        unit: 'ms',
        note: `${hits} hits`,
      });
      rows.push({
        suite: 'engine',
        metric: 'hit test, single query',
        nodes: size,
        value: hitMs / 1000,
        unit: 'ms',
      });

      const marquee = timeMedian(() =>
        editor.hitTester.nodesInRect({
          x: extent.x,
          y: extent.y,
          width: (extent.width - extent.x) / 2,
          height: (extent.height - extent.y) / 2,
        }),
      );
      rows.push({
        suite: 'engine',
        metric: 'marquee query (quarter of page)',
        nodes: size,
        value: marquee,
        unit: 'ms',
      });

      // Move 1 node (typical drag step) and move 10% of nodes (large multi-selection).
      const allIds = editor.graph
        .getDescendantIds(pageId)
        .filter((id) => editor.graph.getNode(id)?.type !== 'FRAME');
      const one = allIds[0] as NodeId;
      rows.push({
        suite: 'commands',
        metric: 'move 1 node (execute + index update)',
        nodes: size,
        value: timeMedian(() => editor.ops.moveNodes([one], { x: 1, y: 0 }), 20),
        unit: 'ms',
      });
      const tenPercent = allIds.slice(0, Math.max(1, Math.floor(allIds.length / 10)));
      rows.push({
        suite: 'commands',
        metric: `move ${tenPercent.length} nodes`,
        nodes: size,
        value: timeMedian(() =>
          editor.ops.moveNodes(tenPercent, { x: 1, y: 0 }, `bench:${Math.random()}`),
        ),
        unit: 'ms',
      });
      rows.push({
        suite: 'commands',
        metric: 'undo + redo (10% move)',
        nodes: size,
        value: timeMedian(() => {
          editor.history.undo();
          editor.history.redo();
        }),
        unit: 'ms',
      });
      rows.push({
        suite: 'commands',
        metric: 'restyle all nodes (one command)',
        nodes: size,
        value: timeMedian(() =>
          editor.history.execute(
            new UpdateNodesCommand(allIds, { style: { opacity: 0.9 } }, 'restyle'),
          ),
        ),
        unit: 'ms',
      });
      rows.push({
        suite: 'engine',
        metric: 'select all + bounds',
        nodes: size,
        value: timeMedian(() => {
          editor.selection.set(allIds);
          editor.selection.getBounds();
          editor.selection.clear();
        }),
        unit: 'ms',
      });

      const mem = process.memoryUsage().heapUsed / 1024 / 1024;
      rows.push({
        suite: 'memory',
        metric: 'heap used after benchmarks (process)',
        nodes: size,
        value: mem,
        unit: 'MB',
        note: 'includes test runner',
      });
    });
  }
});
