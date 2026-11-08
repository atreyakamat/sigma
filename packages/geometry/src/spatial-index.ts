import type { Rect } from './rect';
import { rect as R } from './rect';

/**
 * Uniform-grid spatial hash for broad-phase queries.
 *
 * Chosen over an R-tree for the first milestone because it is tiny, has O(1) insert/remove,
 * and is fast enough for tens of thousands of objects with mostly similar sizes. The interface is
 * narrow so a packed R-tree can replace it later without touching callers (see ADR-0006).
 */
/** Inclusive AABB overlap so that point queries on an exact edge still match (broad phase). */
function intersectsInclusive(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

export class SpatialIndex<T extends string = string> {
  private cells = new Map<string, Set<T>>();
  private bounds = new Map<T, Rect>();

  constructor(private readonly cellSize = 256) {}

  get size(): number {
    return this.bounds.size;
  }

  has(id: T): boolean {
    return this.bounds.has(id);
  }

  getBounds(id: T): Rect | undefined {
    return this.bounds.get(id);
  }

  insert(id: T, r: Rect): void {
    if (this.bounds.has(id)) this.remove(id);
    this.bounds.set(id, r);
    this.forEachCell(r, (key) => {
      let set = this.cells.get(key);
      if (!set) {
        set = new Set();
        this.cells.set(key, set);
      }
      set.add(id);
    });
  }

  update(id: T, r: Rect): void {
    const prev = this.bounds.get(id);
    if (prev && R.equals(prev, r)) return;
    this.insert(id, r);
  }

  remove(id: T): void {
    const r = this.bounds.get(id);
    if (!r) return;
    this.bounds.delete(id);
    this.forEachCell(r, (key) => {
      const set = this.cells.get(key);
      if (!set) return;
      set.delete(id);
      if (set.size === 0) this.cells.delete(key);
    });
  }

  clear(): void {
    this.cells.clear();
    this.bounds.clear();
  }

  /** Ids whose bounds intersect the query rect (exact AABB test after cell lookup). */
  search(query: Rect): T[] {
    const seen = new Set<T>();
    const out: T[] = [];
    this.forEachCell(query, (key) => {
      const set = this.cells.get(key);
      if (!set) return;
      for (const id of set) {
        if (seen.has(id)) continue;
        seen.add(id);
        const b = this.bounds.get(id);
        if (b && intersectsInclusive(b, query)) out.push(id);
      }
    });
    return out;
  }

  /** Ids whose bounds contain the point. */
  searchPoint(x: number, y: number, tolerance = 0): T[] {
    return this.search({
      x: x - tolerance,
      y: y - tolerance,
      width: tolerance * 2,
      height: tolerance * 2,
    });
  }

  private forEachCell(r: Rect, fn: (key: string) => void): void {
    const s = this.cellSize;
    const minX = Math.floor(r.x / s);
    const minY = Math.floor(r.y / s);
    const maxX = Math.floor((r.x + Math.max(r.width, 0)) / s);
    const maxY = Math.floor((r.y + Math.max(r.height, 0)) / s);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) fn(`${cx}:${cy}`);
    }
  }
}
