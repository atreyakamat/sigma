import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, ORIGIN } from './helpers';
import type { Client } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QzwAEjDAGACgFA/8IPBrlAAAAAElFTkSuQmCC',
  'base64',
);

describe('server-side thumbnails and asset-backed images', () => {
  let app: INestApplication;
  let admin: Client;
  let docId: string;
  let wsId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    wsId = (await admin.get('/workspaces')).body[0].id;
    const project = (await admin.post(`/workspaces/${wsId}/projects`, { name: 'P' })).body;
    docId = (await admin.post(`/projects/${project.id}/documents`, { name: 'Thumbs' })).body.id;
  });
  afterAll(() => app.close());

  it('generates a thumbnail on save when the client sends none, and renders asset images in exports', async () => {
    const up = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${wsId}/assets`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .attach('file', PNG, { filename: 'pixel.png', contentType: 'image/png' });
    const assetUrl = up.body.url as string;
    const doc = (await admin.get(`/documents/${docId}`)).body;
    const content = {
      ...doc.content,
      pages: [
        {
          ...doc.content.pages[0],
          children: [
            {
              id: 'r',
              type: 'RECTANGLE',
              name: 'R',
              size: { width: 40, height: 40 },
              style: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] },
            },
            {
              id: 'img',
              type: 'IMAGE',
              name: 'Pixel',
              transform: { x: 50, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
              size: { width: 20, height: 20 },
              image: { type: 'IMAGE', src: assetUrl, assetId: up.body.id },
            },
          ],
        },
      ],
    };
    expect(
      (await admin.put(`/documents/${docId}/content`, { content, baseRevision: doc.revision }))
        .status,
    ).toBe(200);
    const after = (await admin.get(`/documents/${docId}`)).body;
    expect(after.thumbnailUrl).toMatch(/^data:image\/png;base64,/);
    const png = await request(app.getHttpServer())
      .get(`/api/v1/documents/${docId}/export.png?scale=1`)
      .set('Cookie', admin.cookie)
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      });
    expect(png.status).toBe(200);
    expect((png.body as Buffer).length).toBeGreaterThan(100);
  });
});
