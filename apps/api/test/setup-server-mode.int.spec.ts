import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from './helpers';

describe('setup endpoint outside desktop mode', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());
  it('reports that no setup is needed and refuses to create accounts', async () => {
    const status = await request(app.getHttpServer()).get('/api/v1/setup/status');
    expect(status.body).toEqual({ desktop: false, needsSetup: false });
    const res = await request(app.getHttpServer())
      .post('/api/v1/setup')
      .set('Origin', ORIGIN)
      .send({ name: 'X', email: 'x@example.com', password: 'Tangerine-Harbour-42' });
    expect(res.status).toBe(404);
    const reset = await request(app.getHttpServer())
      .post('/api/v1/setup/local-reset')
      .set('Origin', ORIGIN)
      .set('x-sigma-local', 'anything')
      .send({ password: 'Tangerine-Harbour-42' });
    expect(reset.status).toBe(404);
  });
});
