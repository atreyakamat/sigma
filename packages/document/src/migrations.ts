import { SCHEMA_VERSION } from './schema';

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry of document migrations keyed by the version they upgrade FROM. A migration for version N
 * converts a version-N document into version N+1. Add one entry per schema bump.
 */
export const MIGRATIONS: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  // Example for the next bump:
  // [1, (doc) => ({ ...doc, schemaVersion: 2 })],
]);

export class UnsupportedSchemaError extends Error {
  constructor(public readonly version: unknown) {
    super(`Unsupported document schemaVersion: ${String(version)} (current is ${SCHEMA_VERSION})`);
    this.name = 'UnsupportedSchemaError';
  }
}

/** Upgrades a raw document object to the current schema version. Does not validate the result. */
export function migrateDocument(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  let doc = input as Record<string, unknown>;
  const raw = doc.schemaVersion;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new UnsupportedSchemaError(raw);
  }
  let version: number = raw;
  if (version > SCHEMA_VERSION) throw new UnsupportedSchemaError(version);
  while (version < SCHEMA_VERSION) {
    const migrate = MIGRATIONS.get(version);
    if (!migrate) throw new UnsupportedSchemaError(version);
    doc = migrate(doc);
    version = doc.schemaVersion as number;
  }
  return doc;
}
