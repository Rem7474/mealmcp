import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { kitchenQuery, recentlyActed } from './api';

/**
 * Keeps the dashboard in sync with changes made elsewhere (the MCP server, another
 * person, a script): the server sends a "change" event on every write and we refetch.
 * Returns whether the live connection is currently open.
 */
export function useLiveUpdates(): boolean {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/events');
    let timer: number | undefined;
    let opened = false;
    // A burst of changes (e.g. an AI adding 30 items) becomes a single refetch.
    const refresh = (force = false) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!force && recentlyActed()) return;
        void queryClient.invalidateQueries({ predicate: kitchenQuery });
      }, 150);
    };
    source.addEventListener('change', () => refresh(false));
    source.onopen = () => {
      setConnected(true);
      if (opened) refresh(true); // reconnected: changes may have been missed meanwhile
      opened = true;
    };
    source.onerror = () => setConnected(false); // the browser retries by itself
    return () => {
      window.clearTimeout(timer);
      source.close();
    };
  }, [queryClient]);

  return connected;
}
