import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['LOGIN_RATE_LIMIT'] = '10';

describe('login rate limit', () => {
  let app: INestApplication;
  let helpers: typeof import('./helpers');
  beforeAll(async () => {
    helpers = await import('./helpers');
    app = await helpers.createApp();
  });
  afterAll(() => app.close());

  it('returns 429 after 10 attempts per minute', async () => {
    const c = new helpers.Client(app);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await c.login('limit@sigma.local', 'bad-password-x')).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[11]).toBe(429);
  });
});
