import type { NextFunction, Request, Response } from 'express';

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const counters = new Map<string, number>();
const hist = new Map<string, { buckets: number[]; sum: number; count: number }>();
const startedAt = Date.now();

function routeOf(req: Request): string {
  const r = (req as Request & { route?: { path?: string } }).route?.path;
  if (r) return `${(req.baseUrl ?? '') + r}`;
  // Collapse ids so cardinality stays bounded.
  return (req.originalUrl ?? req.url)
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}

/** Express middleware recording request counts and latencies. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = routeOf(req);
    const key = `method="${req.method}",route="${route}",status="${res.statusCode}"`;
    counters.set(key, (counters.get(key) ?? 0) + 1);
    const hkey = `method="${req.method}",route="${route}"`;
    const h = hist.get(hkey) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => {
      if (seconds <= b) h.buckets[i]!++;
    });
    h.sum += seconds;
    h.count++;
    hist.set(hkey, h);
  });
  next();
}

/** Prometheus text exposition of the collected metrics plus process gauges. */
export function renderMetrics(): string {
  const lines: string[] = [
    '# HELP sigma_http_requests_total HTTP requests by method, route and status',
    '# TYPE sigma_http_requests_total counter',
  ];
  for (const [k, v] of counters) lines.push(`sigma_http_requests_total{${k}} ${v}`);
  lines.push(
    '# HELP sigma_http_request_duration_seconds Request latency',
    '# TYPE sigma_http_request_duration_seconds histogram',
  );
  for (const [k, h] of hist) {
    BUCKETS.forEach((b, i) =>
      lines.push(`sigma_http_request_duration_seconds_bucket{${k},le="${b}"} ${h.buckets[i]}`),
    );
    lines.push(`sigma_http_request_duration_seconds_bucket{${k},le="+Inf"} ${h.count}`);
    lines.push(`sigma_http_request_duration_seconds_sum{${k}} ${h.sum}`);
    lines.push(`sigma_http_request_duration_seconds_count{${k}} ${h.count}`);
  }
  const mem = process.memoryUsage();
  lines.push(
    '# TYPE sigma_process_resident_memory_bytes gauge',
    `sigma_process_resident_memory_bytes ${mem.rss}`,
  );
  lines.push(
    '# TYPE sigma_process_heap_used_bytes gauge',
    `sigma_process_heap_used_bytes ${mem.heapUsed}`,
  );
  lines.push(
    '# TYPE sigma_process_uptime_seconds gauge',
    `sigma_process_uptime_seconds ${(Date.now() - startedAt) / 1000}`,
  );
  return lines.join('\n') + '\n';
}
