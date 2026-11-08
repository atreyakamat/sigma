import type { ApiError } from '@sigma/validation';

export class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** Called on any 401 so the app can drop the session and show the login page. */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function messageOf(body: unknown, fallback: string): string {
  const m = (body as ApiError | null)?.message;
  if (Array.isArray(m)) return m.join('; ');
  return typeof m === 'string' ? m : fallback;
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiRequestError(res.status, messageOf(body, `Request failed (${res.status})`), body);
  }
  return body as T;
}

export const http = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} }),
  put: <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json }),
  patch: <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json }),
  delete: <T = void>(path: string) => api<T>(path, { method: 'DELETE' }),
};
