import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ErrorContext } from './api';
import { LanguageSwitch, localizeError, useT } from './i18n';
import { useLiveUpdates } from './live';
import { Account } from './pages/Account';
import { Budget } from './pages/Budget';
import { AuthPage, fetchMe, meKey } from './pages/AuthPage';
import { Consent } from './pages/Consent';
import { Planning } from './pages/Planning';
import { Recipes } from './pages/Recipes';
import { Shopping } from './pages/Shopping';
import { Stock } from './pages/Stock';
import type { User } from './types';

const TABS = ['planning', 'recipes', 'shopping', 'stock', 'budget', 'account'] as const;
type TabId = (typeof TABS)[number];

const initialTab = (): TabId => TABS.find((id) => id === location.hash.slice(1)) ?? 'planning';

function Page({ tab, user }: { tab: TabId; user: User }) {
  switch (tab) {
    case 'planning':
      return <Planning />;
    case 'recipes':
      return <Recipes />;
    case 'shopping':
      return <Shopping />;
    case 'stock':
      return <Stock />;
    case 'budget':
      return <Budget user={user} />;
    case 'account':
      return <Account user={user} />;
  }
}

export function App() {
  const t = useT();
  const me = useQuery({ queryKey: meKey, queryFn: fetchMe });

  if (me.isLoading) return null;
  if (me.error || !me.data)
    return (
      <p role="alert" className="p-8 text-center text-danger">
        {t('app.unreachable')}
      </p>
    );
  if (!me.data.user) return <AuthPage registrationOpen={me.data.registrationOpen} />;

  const { user } = me.data;
  // An MCP client sent the browser here to ask for access (see server/src/auth/oauth.ts).
  if (location.pathname === '/consent') return <Consent userName={user.name} householdName={user.householdName} />;
  return <Shell user={user} />;
}

function Shell({ user }: { user: User }) {
  const t = useT();
  const live = useLiveUpdates();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  const select = (id: TabId) => {
    setTab(id);
    setError(null);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <ErrorContext.Provider value={report}>
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4">
          <h1 className="py-3 text-lg font-bold text-accent">MealMCP</h1>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {TABS.map((id) => (
              <button
                key={id}
                onClick={() => select(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`cursor-pointer border-b-2 px-3 py-3 text-sm font-medium ${
                  tab === id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t(`tab.${id}`)}
              </button>
            ))}
          </nav>
          <span
            role="status"
            title={live ? t('app.live') : t('app.liveOff')}
            aria-label={live ? t('app.live') : t('app.liveOff')}
            className={`size-2 rounded-full ${live ? 'bg-accent' : 'bg-warn'}`}
          />
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-danger px-3 py-2 text-sm text-danger">
            <span>{localizeError(t, error)}</span>
            <button className="cursor-pointer text-muted hover:text-ink" onClick={() => setError(null)}>
              {t('app.close')}
            </button>
          </div>
        )}
        <Page tab={tab} user={user} />
      </main>
    </ErrorContext.Provider>
  );
}
