import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { I18nProvider } from '../i18n';

/** Renders a component the way the app does: data layer and translations around it. */
export function renderApp(ui: ReactElement, options?: RenderOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>{ui}</I18nProvider>
      </QueryClientProvider>,
      options,
    ),
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}
type Reply = { status: number; body?: unknown };
type Handler = (call: Call) => Reply | Promise<Reply>;

/**
 * Replaces `fetch` with a scripted API: each `METHOD /path` maps to a handler returning
 * `{ status, body }`. Anything unscripted fails the test instead of reaching the network.
 */
export function mockApi(routes: Record<string, Handler | Reply>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(input).replace(/^\/api/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unscripted request: ${method} ${path}`);
    const reply = typeof route === 'function' ? await route({ method, path, body }) : route;
    if (reply.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body ?? null), { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
