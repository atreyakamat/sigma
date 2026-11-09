import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Applies the SQL migrations in `dir` (one folder per migration containing `migration.sql`, the
 * layout Prisma generates) that have not been recorded yet. Each migration runs in its own
 * transaction, so a failure leaves the database exactly as the previous migration left it.
 * Used where shipping the Prisma CLI is not practical (the desktop app).
 */
export async function applyMigrations(
  databaseUrl: string,
  dir: string,
): Promise<{ applied: string[] }> {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_sigma_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    // A database first migrated by the Prisma CLI (server installs) already has these applied.
    const prismaTable = await client.query("SELECT to_regclass('public._prisma_migrations') AS t");
    const done = new Set<string>(
      (await client.query('SELECT "name" FROM "_sigma_migrations"')).rows.map(
        (r: { name: string }) => r.name,
      ),
    );
    if ((prismaTable.rows[0] as { t: string | null }).t) {
      const rows = await client.query(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      for (const r of rows.rows as { migration_name: string }[]) done.add(r.migration_name);
    }
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO "_sigma_migrations" ("name") VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${name} failed: ${(e as Error).message}`, { cause: e });
      }
      applied.push(name);
    }
  } finally {
    await client.end();
  }
  return { applied };
}
