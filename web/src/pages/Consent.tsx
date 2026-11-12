import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { LanguageSwitch, localizeError, useI18n } from '../i18n';
import { Button, Card } from '../ui';

interface RequestInfo {
  clientName: string;
  redirectTo: string;
  scopes: string[];
}

/**
 * Last step of "connect an AI to MealMCP": the MCP client sent the browser here
 * (through /authorize) and the user, already signed in, approves or refuses.
 */
export function Consent({ userName, householdName }: { userName: string; householdName: string }) {
  const { t, rich } = useI18n();
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
      setError(localizeError(t, err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-accent">MealMCP</h1>
        <LanguageSwitch />
      </div>
      {info.isLoading ? null : info.error ? (
        <Card title={t('consent.notFound.title')}>
          <p className="text-sm">{t('consent.notFound.text')}</p>
        </Card>
      ) : (
        <Card title={t('consent.title')}>
          <p>{rich('consent.asking', { name: <strong>{info.data!.clientName}</strong> })}</p>
          <ul className="my-3 list-disc space-y-1 pl-5 text-sm">
            <li>{t('consent.scope.data', { household: householdName })}</li>
            <li>{t('consent.scope.actAs', { user: userName })}</li>
          </ul>
          <p className="text-sm text-muted">
            {rich('consent.redirect', { url: <code className="break-all">{info.data!.redirectTo}</code> })}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => decide(true)}>
              {t('consent.allow')}
            </Button>
            <Button disabled={busy} onClick={() => decide(false)}>
              {t('consent.deny')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">{t('consent.revokeHint')}</p>
        </Card>
      )}
    </main>
  );
}
