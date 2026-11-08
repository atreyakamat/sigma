import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import type { Editor } from '@sigma/engine';
import { BENCHMARK_SIZES, generateBenchmarkDocument } from './generate-document';
import type { BenchRow } from './report';
import { formatTable } from './report';

/**
 * Browser rendering benchmarks. Drives the real editor through `window.__sigma` (exposed in dev
 * builds) and reads the renderer's own frame statistics.
 */
test('render, pan, zoom, pointer and memory', async ({ page, browserName }) => {
  const rows: BenchRow[] = [];
  await page.goto('/');
  await page.getByRole('button', { name: 'New design file' }).first().click();
  await page.waitForURL(/\/file\//);
  await page.waitForFunction(() => Boolean((window as unknown as { __sigma?: unknown }).__sigma));

  for (const size of BENCHMARK_SIZES) {
    const doc = generateBenchmarkDocument({ nodeCount: size });
    const result = await page.evaluate(async (json) => {
      type Stats = { drawn: number; culled: number; durationMs: number; partial: boolean };
      const { editor } = (window as unknown as { __sigma: { editor: Editor } }).__sigma;
      const out: Record<string, number | string> = {};
      const t0 = performance.now();
      editor.loadDocument(json as never);
      out.load = performance.now() - t0;
      const median = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
      const frame = (): Stats => {
        editor.requestRender();
        editor.renderNow();
        return { ...editor['renderer']!.stats } as Stats;
      };

      editor.zoomToFit();
      const fit = Array.from({ length: 5 }, () => frame());
      out.fullFrameFit = median(fit.map((s) => s.durationMs));
      out.drawnFit = fit[0]!.drawn;
      out.culledFit = fit[0]!.culled;

      editor.zoomTo(1);
      editor.viewport.centerOn({ x: 400, y: 300 });
      const z1 = Array.from({ length: 5 }, () => frame());
      out.fullFrame100 = median(z1.map((s) => s.durationMs));
      out.drawn100 = z1[0]!.drawn;
      out.culled100 = z1[0]!.culled;

      // Pan: 30 frames of 10px steps at 100%.
      const pan: number[] = [];
      for (let i = 0; i < 30; i++) {
        editor.viewport.panBy(-10, 0);
        editor.renderNow();
        pan.push(editor['renderer']!.stats.durationMs);
      }
      out.panFrame = median(pan);

      // Partial redraw: move one node and render (dirty-region path).
      const page0 = editor.currentPageId!;
      const firstFrame = editor.graph.getChildIds(page0)[0]!;
      const node = editor.graph.getChildIds(firstFrame)[0]!;
      editor.zoomToFit();
      editor.renderNow();
      const partial: number[] = [];
      for (let i = 0; i < 20; i++) {
        editor.ops.moveNodes([node], { x: 1, y: 0 }, 'bench');
        editor.renderNow();
        partial.push(editor['renderer']!.stats.durationMs);
      }
      out.partialFrame = median(partial);
      out.partialWasPartial = editor['renderer']!.stats.partial ? 'yes' : 'no';

      // Pointer latency: synthetic pointermove over the canvas → hover hit test + overlay draw.
      const overlay = document.querySelector(
        '[data-testid="canvas-host"] canvas:last-child',
      ) as HTMLCanvasElement;
      const r = overlay.getBoundingClientRect();
      const lat: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t = performance.now();
        overlay.dispatchEvent(
          new PointerEvent('pointermove', {
            clientX: r.left + 100 + (i % 20) * 15,
            clientY: r.top + 100 + (i % 7) * 20,
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        );
        editor.renderNow();
        lat.push(performance.now() - t);
      }
      out.pointerLatency = median(lat);

      // Marquee-style selection of everything + overlay draw.
      const all = editor.graph.getDescendantIds(page0);
      const ts = performance.now();
      editor.selection.set(all);
      editor.renderNow();
      out.selectAllOverlay = performance.now() - ts;
      editor.selection.clear();

      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      out.heapMB = mem ? mem.usedJSHeapSize / 1024 / 1024 : -1;
      return out;
    }, doc);

    const n = size;
    rows.push({
      suite: 'render',
      metric: 'loadDocument',
      nodes: n,
      value: result.load as number,
      unit: 'ms',
    });
    rows.push({
      suite: 'render',
      metric: 'full frame, zoom-to-fit',
      nodes: n,
      value: result.fullFrameFit as number,
      unit: 'ms',
      note: `drawn ${result.drawnFit}, culled ${result.culledFit}`,
    });
    rows.push({
      suite: 'render',
      metric: 'full frame, 100% zoom',
      nodes: n,
      value: result.fullFrame100 as number,
      unit: 'ms',
      note: `drawn ${result.drawn100}, culled ${result.culled100}`,
    });
    rows.push({
      suite: 'render',
      metric: 'pan frame, 100% zoom',
      nodes: n,
      value: result.panFrame as number,
      unit: 'ms',
    });
    rows.push({
      suite: 'render',
      metric: 'partial frame (1 node moved)',
      nodes: n,
      value: result.partialFrame as number,
      unit: 'ms',
      note: `dirty-region: ${result.partialWasPartial}`,
    });
    rows.push({
      suite: 'interaction',
      metric: 'pointermove → hover + overlay',
      nodes: n,
      value: result.pointerLatency as number,
      unit: 'ms',
    });
    rows.push({
      suite: 'interaction',
      metric: 'select all + overlay draw',
      nodes: n,
      value: result.selectAllOverlay as number,
      unit: 'ms',
    });
    rows.push({
      suite: 'memory',
      metric: 'JS heap used',
      nodes: n,
      value: result.heapMB as number,
      unit: 'MB',
      note: 'Chromium performance.memory',
    });
  }

  const md = `# Browser rendering benchmarks\n\nBrowser: ${browserName} (Playwright headless), viewport 1600×1000, ${new Date().toISOString()}\n\nMedians over repeated frames. "drawn/culled" are the renderer's counts for one frame.\n\n${formatTable(rows)}\n`;
  mkdirSync('results', { recursive: true });
  writeFileSync('results/browser-latest.md', md);
  // eslint-disable-next-line no-console
  console.log(`\n${md}`);
});
