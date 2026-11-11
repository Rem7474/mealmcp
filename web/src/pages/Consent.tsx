import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { Button, Card } from '../ui';

interface RequestInfo {
  clientName: string;
  redirectTo: string;
  scopes: string[];
}

/**
 * Last step of "connect an AI to MealMCP": the MCP client sent the browser here
 * (through /authorize) and the user, already logged in, approves or refuses.
 */
export function Consent({ userName, householdName }: { userName: string; householdName: string }) {
  const request = new URLSearchParams(location.search).get('request') ?? '';
  const info = useQuery({ queryKey: ['oauth-request', request], queryFn: () => api.get<RequestInfo>(`/oauth/requests/${request}`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await api.post<{ redirectTo: string }>(`/oauth/requests/${request}/decision`, { approve });
      // Back to the application, carrying the authorization code (or the refusal).
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-center text-2xl font-bold text-accent">MealMCP</h1>
      {info.isLoading ? null : info.error ? (
        <Card title="Demande introuvable">
          <p className="text-sm">Cette demande d’autorisation a expiré ou n’existe pas. Relancez la connexion depuis l’application.</p>
        </Card>
      ) : (
        <Card title="Autoriser l’accès ?">
          <p>
            <strong>{info.data!.clientName}</strong> demande l’accès à MealMCP.
          </p>
          <ul className="my-3 list-disc space-y-1 pl-5 text-sm">
            <li>Lire et modifier les recettes, le planning, les courses et le stock du foyer « {householdName} ».</li>
            <li>Agir en votre nom ({userName}).</li>
          </ul>
          <p className="text-sm text-muted">
            Après votre choix, vous serez redirigé vers <code className="break-all">{info.data!.redirectTo}</code>. Ne continuez que si vous reconnaissez cette application.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => decide(true)}>
              Autoriser
            </Button>
            <Button disabled={busy} onClick={() => decide(false)}>
              Refuser
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">Vous pourrez retirer cet accès à tout moment depuis l’onglet Compte.</p>
        </Card>
      )}
    </main>
  );
}
