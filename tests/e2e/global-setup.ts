import { execSync } from 'node:child_process';
import { request } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@sigma.local';
/** Password the suite sets for the admin after the forced first-login change. */
export const ADMIN_FINAL_PASSWORD = 'Admin-Password-2026!';

function passwordFromDockerLogs(): string | null {
  try {
    // eslint-disable-next-line no-control-regex
    const logs = execSync('docker compose logs api --no-log-prefix', { stdio: 'pipe' })
      .toString()
      .replace(/\x1b\[[0-9;]*m/g, '');
    const m = /Password:\s+(\S+)/.exec(logs);
    return m && m[1] !== '(from' ? (m[1] as string) : null;
  } catch {
    return null;
  }
}

/** Finds a working admin password (env, docker logs, or the one a previous run set) and exposes it. */
export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const candidates = [
    process.env.E2E_ADMIN_PASSWORD,
    ADMIN_FINAL_PASSWORD,
    passwordFromDockerLogs(),
  ].filter((p): p is string => !!p);
  const ctx = await request.newContext({ baseURL });
  for (const password of candidates) {
    const res = await ctx.post('/api/v1/auth/login', {
      data: { email: ADMIN_EMAIL, password },
      headers: { Origin: baseURL },
    });
    if (res.ok()) {
      process.env.E2E_ADMIN_PASSWORD = password;
      await ctx.dispose();
      return;
    }
  }
  await ctx.dispose();
  throw new Error(`Could not sign in as ${ADMIN_EMAIL} at ${baseURL}. Set E2E_ADMIN_PASSWORD.`);
}
