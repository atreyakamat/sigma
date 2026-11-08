/**
 * @sigma/shared — small, dependency-free primitives shared by every package.
 */

/** Branded identifier for scene-graph nodes. */
export type NodeId = string & { readonly __brand: 'NodeId' };
/** Branded identifier for documents. */
export type DocumentId = string & { readonly __brand: 'DocumentId' };

const ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/** Generates a compact, URL-safe random identifier (21 chars, same entropy class as nanoid). */
export function createId(size = 21): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < size; i++) id += ALPHABET[(bytes[i] as number) & 63];
  return id;
}

export function createNodeId(): NodeId {
  return createId() as NodeId;
}

export function createDocumentId(): DocumentId {
  return createId() as DocumentId;
}

export type Listener<T> = (event: T) => void;
export type Unsubscribe = () => void;

/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) (listener as Listener<Events[K]>)(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
