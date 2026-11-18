import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

export class UnauthorizedError extends Error {}

function apiUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) {
    throw new Error(`Invalid API path: ${path}`);
  }
  const base = typeof location !== 'undefined' && location.origin !== 'null' ? location.origin : 'http://localhost';
  const url = new URL(`/api${path}`, base);
  if (url.origin !== base || !url.pathname.startsWith('/api/')) {
    throw new Error(`Invalid API path: ${path}`);
  }
  return `${url.pathname}${url.search}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    // The session cookie is sent automatically (same origin).
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // A deferred deletion may fire while the page is going away: keepalive lets the request outlive it.
    keepalive: method === 'DELETE',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new UnauthorizedError(data?.error ?? 'Not signed in');
  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
  return data as T;
}

/** Sends a file as the raw request body (a receipt), with its own content type. */
async function upload<T>(path: string, file: Blob): Promise<T> {
  const res = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new UnauthorizedError(data?.error ?? 'Not signed in');
  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
  return data as T;
}

export const api = {
  upload,
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string, body?: unknown) => request<void>('DELETE', path, body),
};

/** Lets any page surface an error in the app-level banner. */
export const ErrorContext = createContext<(error: unknown) => void>(() => {});

const STATIC_KEYS = new Set(['me', 'ai', 'seasons', 'starter']);
let lastActionAt = 0;

/** True right after a local mutation so the SSE echo does not trigger a second refetch wave. */
export const recentlyActed = () => Date.now() - lastActionAt < 500;
export const kitchenQuery = (query: { queryKey: readonly unknown[] }) => !STATIC_KEYS.has(String(query.queryKey[0]));

/**
 * Runs a write against the API, then refreshes kitchen queries: stock, plan and
 * shopping list depend on each other, so a blanket refresh keeps them in sync.
 */
export function useAction() {
  const queryClient = useQueryClient();
  const report = useContext(ErrorContext);
  const mutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      lastActionAt = Date.now();
      return queryClient.invalidateQueries({ predicate: kitchenQuery });
    },
    onError: report,
  });
  return { run: mutation.mutateAsync, pending: mutation.isPending };
}
