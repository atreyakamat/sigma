import type { INestApplication } from '@nestjs/common';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient } from './helpers';
import type { Client } from './helpers';

interface Recorded {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

/** Scripted provider: each request gets the next canned response for its path. */
function mockProvider(
  script: (req: Recorded, index: number) => unknown,
): Promise<{ server: Server; url: string; requests: Recorded[] }> {
  const requests: Recorded[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rec: Recorded = {
        path: req.url ?? '',
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>,
      };
      requests.push(rec);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(script(rec, requests.length - 1)));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        requests,
      }),
    ),
  );
}

describe('document ops, AI providers and the assistant', () => {
  let app: INestApplication;
  let admin: Client;
  let editor: Client & { id: string; email: string };
  let viewer: Client & { id: string; email: string };
  let docId: string;
  const servers: Server[] = [];
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    const ws = (await admin.get('/workspaces')).body[0];
    editor = await userClient(app, admin, 'Eve');
    viewer = await userClient(app, admin, 'Vic');
    await admin.post(`/workspaces/${ws.id}/members`, { email: editor.email, role: 'EDITOR' });
    await admin.post(`/workspaces/${ws.id}/members`, { email: viewer.email, role: 'VIEWER' });
    const project = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body;
    docId = (await admin.post(`/projects/${project.id}/documents`, { name: 'AI doc' })).body.id;
  });
  afterAll(async () => {
    servers.forEach((s) => s.close());
    await app.close();
  });
  const layerNames = async () => {
    const outline = (await admin.get(`/documents/${docId}/outline`)).body as {
      pages: { children: { name: string; children?: { name: string }[] }[] }[];
    };
    return outline.pages[0]!.children.flatMap((c) => [
      c.name,
      ...(c.children ?? []).map((k) => k.name),
    ]);
  };

  it('applies validated ops over HTTP, reports per-op results, and enforces roles', async () => {
    const res = await editor.post(`/documents/${docId}/ops`, {
      ops: [
        { op: 'add', type: 'FRAME', ref: 'home', name: 'Home', width: 390, height: 844 },
        {
          op: 'add',
          type: 'RECTANGLE',
          parent: '$home',
          name: 'Card',
          fill: '#2563eb',
          width: 300,
          height: 120,
        },
        { op: 'update', id: 'does-not-exist', name: 'x' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(2);
    expect(res.body.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, false]);
    expect(res.body.revision).toBe(1);
    expect(await layerNames()).toEqual(['Home', 'Card']);
    expect(
      (
        await viewer.post(`/documents/${docId}/ops`, {
          ops: [{ op: 'delete', id: res.body.results[0].id }],
        })
      ).status,
    ).toBe(403);
    expect((await viewer.get(`/documents/${docId}/outline`)).status).toBe(200);
    expect(
      (
        await editor.post(`/documents/${docId}/ops`, {
          ops: [{ op: 'add', type: 'RECTANGLE', fill: 'blue' }],
        })
      ).status,
    ).toBe(400);
  });

  it('lets only administrators manage providers and never returns stored keys', async () => {
    expect((await editor.post('/admin/ai/providers', { name: 'X', kind: 'demo' })).status).toBe(
      403,
    );
    expect(
      (
        await admin.post('/admin/ai/providers', {
          name: 'Local',
          kind: 'openai_compatible',
          model: 'llama3.1',
        })
      ).status,
    ).toBe(400); // baseUrl required
    const demo = await admin.post('/admin/ai/providers', { name: 'Demo', kind: 'demo' });
    expect(demo.status).toBe(201);
    expect(demo.body).toMatchObject({ kind: 'demo', hasKey: false, isDefault: true });
    const keyed = await admin.post('/admin/ai/providers', {
      name: 'Claude',
      kind: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: 'sk-ant-secret-value',
    });
    expect(keyed.body.hasKey).toBe(true);
    expect(JSON.stringify(keyed.body)).not.toContain('sk-ant-secret-value');
    expect(JSON.stringify((await admin.get('/admin/ai/providers')).body)).not.toContain(
      'sk-ant-secret-value',
    );
    const visible = (await editor.get('/ai/providers')).body as {
      name: string;
      baseUrl?: string;
    }[];
    expect(visible.map((p) => p.name)).toEqual(['Demo', 'Claude']);
    expect(visible[0]).not.toHaveProperty('baseUrl');
    expect((await admin.delete(`/admin/ai/providers/${keyed.body.id}`)).status).toBe(204);
    expect((await admin.post(`/admin/ai/providers/${demo.body.id}/test`)).body.ok).toBe(true);
  });

  it('demo provider edits the file from plain commands; viewers get read-only help', async () => {
    const res = await editor.post(`/documents/${docId}/ai/chat`, {
      messages: [{ role: 'user', content: 'add a green circle named Avatar 96x96' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ applied: 1, provider: { kind: 'demo' } });
    expect(res.body.steps[0]).toMatchObject({ tool: 'apply_document_ops', isError: false });
    expect(await layerNames()).toContain('Avatar');
    const ro = await viewer.post(`/documents/${docId}/ai/chat`, {
      messages: [{ role: 'user', content: 'add a red rectangle' }],
    });
    expect(ro.status).toBe(200);
    expect(ro.body.applied).toBe(0);
    expect(ro.body.reply).toMatch(/view-only/);
    const list = await viewer.post(`/documents/${docId}/ai/chat`, {
      messages: [{ role: 'user', content: 'list layers' }],
    });
    expect(list.body.reply).toContain('Avatar');
  });

  it('drives an OpenAI-compatible provider through a tool call and back', async () => {
    const mock = await mockProvider((_req, i) =>
      i === 0
        ? {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'apply_document_ops',
                        arguments: JSON.stringify({
                          ops: [
                            {
                              op: 'add',
                              type: 'TEXT',
                              name: 'Headline',
                              text: 'Hello from the model',
                              fontSize: 28,
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {
            choices: [
              {
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'Added a headline.' },
              },
            ],
          },
    );
    servers.push(mock.server);
    const provider = (
      await admin.post('/admin/ai/providers', {
        name: 'Local model',
        kind: 'openai_compatible',
        model: 'test-model',
        baseUrl: `${mock.url}/v1`,
        apiKey: 'local-key',
      })
    ).body;
    const res = await editor.post(`/documents/${docId}/ai/chat`, {
      providerId: provider.id,
      messages: [{ role: 'user', content: 'Add a headline' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: 'Added a headline.', applied: 1 });
    expect(await layerNames()).toContain('Headline');
    expect(mock.requests).toHaveLength(2);
    expect(mock.requests[0]!.path).toBe('/v1/chat/completions');
    expect(mock.requests[0]!.headers['authorization']).toBe('Bearer local-key');
    const first = mock.requests[0]!.body as {
      model: string;
      tools: { function: { name: string } }[];
      messages: { role: string }[];
    };
    expect(first.model).toBe('test-model');
    expect(first.tools.map((t) => t.function.name)).toEqual([
      'get_document_outline',
      'apply_document_ops',
    ]);
    expect(first.messages[0]!.role).toBe('system');
    const second = mock.requests[1]!.body as {
      messages: { role: string; tool_call_id?: string; content: string }[];
    };
    const toolMsg = second.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.tool_call_id).toBe('call_1');
    expect(JSON.parse(toolMsg.content).applied).toBe(1);

    // Viewers are offered the read tool only.
    await viewer.post(`/documents/${docId}/ai/chat`, {
      providerId: provider.id,
      messages: [{ role: 'user', content: 'What is here?' }],
    });
    const viewerTools = (
      mock.requests[2]!.body as { tools: { function: { name: string } }[] }
    ).tools.map((t) => t.function.name);
    expect(viewerTools).toEqual(['get_document_outline']);
  });

  it('drives the Anthropic Messages API: tool_use, tool_result in one user turn, final text', async () => {
    const mock = await mockProvider((_req, i) =>
      i === 0
        ? {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 10 },
            content: [
              { type: 'text', text: 'Adding it now.' },
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'apply_document_ops',
                input: {
                  ops: [
                    { op: 'add', type: 'RECTANGLE', name: 'Claude made this', fill: '#8b5cf6' },
                  ],
                },
              },
            ],
          }
        : {
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5-5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
            content: [{ type: 'text', text: 'Done: one purple rectangle.' }],
          },
    );
    servers.push(mock.server);
    const provider = (
      await admin.post('/admin/ai/providers', {
        name: 'Claude via proxy',
        kind: 'anthropic',
        model: 'claude-opus-5-5',
        baseUrl: mock.url,
        apiKey: 'sk-ant-test',
      })
    ).body;
    const res = await editor.post(`/documents/${docId}/ai/chat`, {
      providerId: provider.id,
      messages: [{ role: 'user', content: 'Add a purple rectangle' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      reply: 'Done: one purple rectangle.',
      applied: 1,
      stopReason: 'end_turn',
    });
    expect(await layerNames()).toContain('Claude made this');
    expect(mock.requests[0]!.path).toBe('/v1/messages');
    // The SDK chooses the credential header; either form must carry the configured key.
    const h = mock.requests[0]!.headers;
    expect(h['x-api-key'] ?? h['authorization']).toContain('sk-ant-test');
    const first = mock.requests[0]!.body as {
      model: string;
      max_tokens: number;
      system: string;
      tools: { name: string; input_schema: unknown }[];
      tool_choice?: unknown;
      thinking?: unknown;
    };
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.tools.map((t) => t.name)).toEqual(['get_document_outline', 'apply_document_ops']);
    expect(first.tools[1]!.input_schema).toBeTruthy();
    expect(first.tool_choice).toBeUndefined(); // forced tool use is rejected by current models
    expect(first.thinking).toBeUndefined(); // adaptive by default
    const second = mock.requests[1]!.body as {
      messages: { role: string; content: { type: string; tool_use_id?: string }[] | string }[];
    };
    const last = second.messages[second.messages.length - 1]!;
    expect(last.role).toBe('user');
    expect((last.content as { type: string; tool_use_id?: string }[])[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
    });
    const assistantTurn = second.messages[second.messages.length - 2]!;
    expect((assistantTurn.content as { type: string }[]).map((b) => b.type)).toEqual([
      'text',
      'tool_use',
    ]);
  });

  it('turns provider failures into actionable errors', async () => {
    const provider = (
      await admin.post('/admin/ai/providers', {
        name: 'Unreachable',
        kind: 'openai_compatible',
        model: 'm',
        baseUrl: 'http://127.0.0.1:9/v1',
      })
    ).body;
    const res = await editor.post(`/documents/${docId}/ai/chat`, {
      providerId: provider.id,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/Could not reach/);
    const test = await admin.post(`/admin/ai/providers/${provider.id}/test`);
    expect(test.body).toMatchObject({ ok: false });
  });
});
