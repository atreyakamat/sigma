import { execSync } from 'node:child_process';
import { Client } from 'pg';

const DEFAULT = 'postgresql://sigma:sigma@localhost:5432/sigma_test?schema=public';

/** Creates the test database if needed and applies migrations. Fails fast when Postgres is down. */
export default async function setup(): Promise<void> {
  const url = new URL(process.env['DATABASE_URL'] ?? DEFAULT);
  const dbName = url.pathname.slice(1);
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(
      `Integration tests need PostgreSQL at ${admin.host}. Start it with: docker compose -f infrastructure/docker/docker-compose.yml up -d postgres\n${(e as Error).message}`,
    );
  }
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}
