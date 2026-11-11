import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

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
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' }), 150);
    };
    source.addEventListener('change', refresh);
    source.onopen = () => {
      setConnected(true);
      if (opened) refresh(); // reconnected: changes may have been missed meanwhile
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
