export interface BenchRow {
  suite: string;
  metric: string;
  nodes: number;
  value: number;
  unit: string;
  note?: string;
}

export function formatTable(rows: BenchRow[]): string {
  const header = '| Suite | Metric | Nodes | Value | Unit | Note |\n|---|---|---:|---:|---|---|';
  const lines = rows.map(
    (r) =>
      `| ${r.suite} | ${r.metric} | ${r.nodes.toLocaleString()} | ${fmt(r.value)} | ${r.unit} | ${r.note ?? ''} |`,
  );
  return `${header}\n${lines.join('\n')}`;
}

function fmt(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(3);
}

export function envLine(): string {
  const node = typeof process !== 'undefined' ? process.version : 'browser';
  return `Environment: Node ${node}, ${typeof process !== 'undefined' ? `${process.platform} ${process.arch}` : ''} — ${new Date().toISOString()}`;
}

/** Median of timings from `runs` executions of `fn` (ms). */
export function timeMedian(fn: () => void, runs = 5): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}
