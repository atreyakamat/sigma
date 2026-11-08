import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, http, onUnauthorized } from '../api';
import { ConflictError, documentRepository } from '../api-document-repository';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(null);
});

describe('api client', () => {
  it('sends JSON with credentials and parses responses', async () => {
    const fetch = mockFetch(200, { ok: true });
    const res = await http.post<{ ok: boolean }>('/auth/login', { email: 'a@b.co', password: 'x' });
    expect(res).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/login');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.co', password: 'x' });
  });

  it('maps error bodies into ApiRequestError and joins validation messages', async () => {
    mockFetch(400, {
      statusCode: 400,
      message: ['email: Invalid', 'password: Too short'],
      error: 'Bad Request',
    });
    await expect(http.get('/x')).rejects.toMatchObject({
      statusCode: 400,
      message: 'email: Invalid; password: Too short',
    });
    mockFetch(500, undefined);
    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('invokes the unauthorized handler on 401', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    mockFetch(401, { statusCode: 401, message: 'Not signed in' });
    await expect(http.get('/auth/me')).rejects.toMatchObject({ statusCode: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204', async () => {
    mockFetch(204, undefined);
    await expect(http.delete('/documents/1')).resolves.toBeUndefined();
  });
});

describe('documentRepository.save', () => {
  it('throws ConflictError carrying the server revision on 409', async () => {
    mockFetch(409, { statusCode: 409, message: 'modified', revision: 7 });
    const doc = {
      schemaVersion: 1,
      id: 'd',
      name: 'D',
      metadata: {},
      pages: [{ id: 'p', type: 'PAGE' as const, name: 'P', children: [] }],
    };
    await expect(documentRepository.save('d', doc as never, 6)).rejects.toMatchObject({
      name: 'ConflictError',
      serverRevision: 7,
    });
    mockFetch(200, { revision: 7, updatedAt: 'now' });
    await expect(documentRepository.save('d', doc as never, 6)).resolves.toEqual({
      revision: 7,
      updatedAt: 'now',
    });
    expect(new ConflictError(1)).toBeInstanceOf(Error);
  });
});
