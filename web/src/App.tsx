import {
  BookOpen,
  CalendarBlank,
  CookingPot,
  House,
  IconContext,
  type IconWeight,
  Package,
  ShoppingCart,
  Wallet,
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ErrorContext, UnauthorizedError } from './api';
import { LanguageSwitch, localizeError, useT } from './i18n';
import { useLiveUpdates } from './live';
import { Account } from './pages/Account';
import { AuthPage, fetchMe, meKey } from './pages/AuthPage';
import { Budget } from './pages/Budget';
import { Consent } from './pages/Consent';
import { Home } from './pages/Home';
import { Planning } from './pages/Planning';
import { Recipes } from './pages/Recipes';
import { Shopping } from './pages/Shopping';
import { Stock } from './pages/Stock';
import type { User } from './types';
import { UndoHost } from './undo';

const TABS = ['home', 'planning', 'recipes', 'shopping', 'stock', 'budget', 'account'] as const;
type TabId = (typeof TABS)[number];
type NavItem = { id: Exclude<TabId, 'account'>; Icon: ComponentType<{ size?: number; className?: string; weight?: IconWeight }> };
// The account has no tab of its own: it sits behind the avatar.
const NAV: NavItem[] = [
  { id: 'home', Icon: House },
  { id: 'planning', Icon: CalendarBlank },
  { id: 'recipes', Icon: BookOpen },
  { id: 'shopping', Icon: ShoppingCart },
  { id: 'stock', Icon: Package },
  { id: 'budget', Icon: Wallet },
];
// The bar under the thumb has room for five: the budget is reached from the home page and from the account.
const PHONE_NAV = NAV.filter(({ id }) => id !== 'budget');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const initialTab = (): TabId => TABS.find((id) => id === location.hash.slice(1).split('/')[0]) ?? 'home';

function Page({ tab, user }: { tab: TabId; user: User }) {
  switch (tab) {
    case 'home':
      return <Home />;
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
  return (
    <IconContext.Provider value={{ weight: 'bold' }}>
      <Shell user={user} />
    </IconContext.Provider>
  );
}

function Shell({ user }: { user: User }) {
  const t = useT();
  const queryClient = useQueryClient();
  const live = useLiveUpdates();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [error, setError] = useState<string | null>(null);
  // Links such as #recipes/12 switch tab too.
  useEffect(() => {
    const sync = () => {
      setTab(initialTab());
      setError(null);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const report = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) {
        void queryClient.invalidateQueries({ queryKey: meKey });
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    },
    [queryClient],
  );
  const select = (id: TabId) => {
    setTab(id);
    setError(null);
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
  };

  return (
    <ErrorContext.Provider value={report}>
      <header className="sticky top-0 z-10 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4">
          <h1 className="flex flex-1 items-center gap-2 py-3 text-xl sm:flex-none">
            <CookingPot size={24} weight="duotone" className="text-accent" />
            {/* Phones say where you are; the brand is for wider screens. */}
            <span className="sm:hidden">{t(`tab.${tab}`)}</span>
            <span className="max-sm:hidden">MealMCP</span>
          </h1>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
            {NAV.map(({ id, Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => select(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  tab === id ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:bg-surface-high hover:text-ink'
                }`}
              >
                <Icon size={17} weight={tab === id ? 'fill' : 'bold'} className={tab === id ? 'text-accent' : ''} />
                {t(`tab.${id}`)}
              </button>
            ))}
          </nav>
          <span
            role="status"
            title={live ? t('app.live') : t('app.liveOff')}
            aria-label={live ? t('app.live') : t('app.liveOff')}
            className={`size-2 rounded-full ${live ? 'bg-herb max-sm:hidden' : 'bg-warn'}`}
          />
          <span className="hidden sm:block">
            <LanguageSwitch />
          </span>
          <button
            type="button"
            onClick={() => select('account')}
            title={t('tab.account')}
            aria-label={t('tab.account')}
            aria-current={tab === 'account' ? 'page' : undefined}
            className="-mr-1.5 grid size-11 cursor-pointer place-items-center rounded-full sm:mr-0 sm:size-8"
          >
            <span
              className={`grid size-8 place-items-center rounded-full text-xs font-bold ${
                tab === 'account' ? 'bg-accent-deep text-accent-soft ring-2 ring-accent' : 'bg-surface-high text-ink hover:bg-line'
              }`}
            >
              {initials(user.name)}
            </span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24 sm:pb-4">
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-danger bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            <span>{localizeError(t, error)}</span>
            <button type="button" className="cursor-pointer text-muted hover:text-ink" onClick={() => setError(null)}>
              {t('app.close')}
            </button>
          </div>
        )}
        {/* Phones: the language switch lives with the account instead of crowding the header. */}
        {tab === 'account' && (
          <div className="flex justify-end sm:hidden">
            <LanguageSwitch />
          </div>
        )}
        {/* Keyed by tab so that every page enters with the same staggered rise. */}
        <div key={tab} className="stagger space-y-4">
          <Page tab={tab} user={user} />
        </div>
      </main>
      <UndoHost />
      {/* Phones: the tabs move to a bar under the thumb. */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {PHONE_NAV.map(({ id, Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => select(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-1 pt-2 pb-1.5 text-xs font-medium ${tab === id ? 'text-ink' : 'text-muted'}`}
          >
            {/* The current tab is a filled pill around its icon, the way a native tab bar shows it. */}
            <span
              className={`grid h-8 w-16 place-items-center rounded-full transition-colors ${tab === id ? 'bg-accent/20 text-accent' : ''}`}
            >
              <Icon size={20} weight={tab === id ? 'fill' : 'bold'} />
            </span>
            {t(`tab.${id}`)}
          </button>
        ))}
      </nav>
    </ErrorContext.Provider>
  );
}
