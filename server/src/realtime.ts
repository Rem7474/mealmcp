import type { Response } from 'express';

/**
 * Tells open browser tabs that their household's data changed, so the dashboard
 * refreshes by itself when something else (the MCP server, another person, a
 * script) modifies it. Server-Sent Events over the existing HTTP server.
 *
 * In memory: it works for a single server process, which is how the app runs.
 */
export function createHub() {
  const clients = new Map<number, Set<Response>>();

  return {
    /** Registers an open event stream; returns the function that unregisters it. */
    subscribe(householdId: number, res: Response): () => void {
      const set = clients.get(householdId) ?? new Set<Response>();
      set.add(res);
      clients.set(householdId, set);
      return () => {
        set.delete(res);
        if (set.size === 0) clients.delete(householdId);
      };
    },

    /** Notifies every open tab of the household. Payloads carry no data: clients just refetch. */
    publish(householdId: number) {
      for (const res of clients.get(householdId) ?? []) res.write(`event: change\ndata: ${Date.now()}\n\n`);
    },

    connections: () => [...clients.values()].reduce((n, set) => n + set.size, 0),
  };
}

export type Hub = ReturnType<typeof createHub>;
