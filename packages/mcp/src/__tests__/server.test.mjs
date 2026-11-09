import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOLS, createSigmaMcpServer } from '../server.mjs';

/** Fake SIGMA API recording every request. */
function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname}${u.search}`;
    calls.push({ key, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const hit = routes[key];
    if (!hit)
      return new Response(JSON.stringify({ message: 'Not found', statusCode: 404 }), {
        status: 404,
        statusText: 'Not Found',
      });
    if (hit instanceof Response) return hit;
    return new Response(typeof hit === 'string' ? hit : JSON.stringify(hit), { status: 200 });
  };
  return { fetchImpl, calls };
}

async function connect(routes) {
  const { fetchImpl, calls } = fakeApi(routes);
  const server = createSigmaMcpServer({
    url: 'http://sigma.test/',
    token: 'sgm_test',
    fetch: fetchImpl,
    version: '9.9.9',
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

describe('SIGMA MCP server', () => {
  it('lists its tools with schemas and descriptions', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'sigma_get_outline',
        'sigma_apply_ops',
        'sigma_export_png',
        'sigma_create_document',
      ]),
    );
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('creates a document, applies ops with the bearer token, and returns the browser URL', async () => {
    const { client, calls } = await connect({
      'POST /api/v1/projects/p1/documents': { id: 'd1', name: 'Landing' },
      'POST /api/v1/documents/d1/ops': {
        revision: 1,
        applied: 2,
        results: [
          { ok: true, id: 'n1' },
          { ok: true, id: 'n2' },
        ],
      },
    });
    const created = await client.callTool({
      name: 'sigma_create_document',
      arguments: { projectId: 'p1', name: 'Landing' },
    });
    expect(JSON.parse(created.content[0].text)).toEqual({
      id: 'd1',
      name: 'Landing',
      url: 'http://sigma.test/file/d1',
    });
    const ops = [
      { op: 'add', type: 'FRAME', ref: 'home', name: 'Home', width: 390, height: 844 },
      { op: 'add', type: 'TEXT', parent: '$home', text: 'Hello' },
    ];
    const applied = await client.callTool({
      name: 'sigma_apply_ops',
      arguments: { documentId: 'd1', ops },
    });
    expect(JSON.parse(applied.content[0].text)).toMatchObject({
      applied: 2,
      url: 'http://sigma.test/file/d1',
    });
    expect(calls[1].body).toEqual({ ops });
    expect(calls[1].headers.Authorization).toBe('Bearer sgm_test');
  });

  it('returns rendered PNGs as image content', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { client, calls } = await connect({
      'GET /api/v1/documents/d1/export.png?scale=2&frame=f1': new Response(png, { status: 200 }),
    });
    const res = await client.callTool({
      name: 'sigma_export_png',
      arguments: { documentId: 'd1', frameId: 'f1', scale: 2 },
    });
    expect(res.content[0]).toEqual({
      type: 'image',
      mimeType: 'image/png',
      data: png.toString('base64'),
    });
    expect(calls[0].key).toContain('frame=f1');
  });

  it('reports API failures as tool errors the model can read', async () => {
    const { client } = await connect({});
    const res = await client.callTool({
      name: 'sigma_get_outline',
      arguments: { documentId: 'missing' },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/404/);
    const unknown = await client.callTool({ name: 'nope', arguments: {} });
    expect(unknown.isError).toBe(true);
  });
});
