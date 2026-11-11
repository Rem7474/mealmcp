import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

export class UnauthorizedError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    // The session cookie is sent automatically (same origin).
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new UnauthorizedError(data?.error ?? 'Not signed in');
  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
};

/** Lets any page surface an error in the app-level banner. */
export const ErrorContext = createContext<(error: unknown) => void>(() => {});

/**
 * Runs a write against the API, then refreshes every query: stock, plan and
 * shopping list depend on each other, so a blanket refresh keeps them in sync.
 */
export function useAction() {
  const queryClient = useQueryClient();
  const report = useContext(ErrorContext);
  const mutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: report,
  });
  return { run: mutation.mutateAsync, pending: mutation.isPending };
}
