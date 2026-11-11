import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
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
import { BookOpen, CalendarBlank, CookingPot, Package, ShoppingCart, Wallet } from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { User } from './types';

const TABS = ['planning', 'recipes', 'shopping', 'stock', 'budget', 'account'] as const;
type TabId = (typeof TABS)[number];
// The account has no tab of its own: it sits behind the avatar.
const NAV: { id: Exclude<TabId, 'account'>; Icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'planning', Icon: CalendarBlank },
  { id: 'recipes', Icon: BookOpen },
  { id: 'shopping', Icon: ShoppingCart },
  { id: 'stock', Icon: Package },
  { id: 'budget', Icon: Wallet },
];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const initialTab = (): TabId => TABS.find((id) => id === location.hash.slice(1).split('/')[0]) ?? 'planning';

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
  // Links such as #recipes/12 switch tab too.
  useEffect(() => {
    const sync = () => setTab(initialTab());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  const select = (id: TabId) => {
    setTab(id);
    setError(null);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <ErrorContext.Provider value={report}>
      <header className="sticky top-0 z-10 bg-linear-to-b from-surface to-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 px-4">
          <h1 className="flex flex-1 items-center gap-2 py-3 text-base font-medium sm:flex-none">
            <CookingPot size={20} className="text-accent" />
            MealMCP
          </h1>
          <nav className="hidden flex-1 gap-0.5 self-stretch overflow-x-auto sm:flex">
            {NAV.map(({ id, Icon }) => (
              <button
                key={id}
                onClick={() => select(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`relative flex cursor-pointer items-center gap-2 px-3 text-sm ${tab === id ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                <Icon size={16} className={tab === id ? 'text-accent' : ''} />
                {t(`tab.${id}`)}
                {tab === id && <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
              </button>
            ))}
          </nav>
          <span
            role="status"
            title={live ? t('app.live') : t('app.liveOff')}
            aria-label={live ? t('app.live') : t('app.liveOff')}
            className={`size-2 rounded-full ${live ? 'bg-accent shadow-[0_0_8px_var(--accent)]' : 'bg-warn'}`}
          />
          <LanguageSwitch />
          <button
            onClick={() => select('account')}
            title={t('tab.account')}
            aria-label={t('tab.account')}
            aria-current={tab === 'account' ? 'page' : undefined}
            className={`grid size-8 cursor-pointer place-items-center rounded-full text-xs ${
              tab === 'account' ? 'bg-accent-deep text-accent-soft shadow-[0_0_0_1px_var(--accent),0_0_12px_var(--glow)]' : 'bg-line text-ink hover:bg-muted/40'
            }`}
          >
            {initials(user.name)}
          </button>
        </div>
        <div className="fade-rule absolute inset-x-0 bottom-0" />
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24 sm:pb-4">
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
      {/* Phones: the tabs move to a bar under the thumb. */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex bg-linear-to-t from-surface to-bg pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="fade-rule absolute inset-x-0 top-0" />
        {NAV.map(({ id, Icon }) => (
          <button
            key={id}
            onClick={() => select(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`relative flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] ${tab === id ? 'text-ink' : 'text-muted'}`}
          >
            <Icon size={20} className={tab === id ? 'text-accent' : ''} />
            {t(`tab.${id}`)}
            {tab === id && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
          </button>
        ))}
      </nav>
    </ErrorContext.Provider>
  );
}
