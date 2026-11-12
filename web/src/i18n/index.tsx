import { createContext, Fragment, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { en, type Messages } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const dictionaries: Record<Lang, Messages> = { en, fr };
const STORAGE_KEY = 'mealmcp.lang';

/** "recipes.ingredientCount_one" and "..._other" are one key, "recipes.ingredientCount". */
type Strip<K> = K extends `${infer B}_one` | `${infer B}_other` ? B : K;
export type MessageKey = Strip<keyof Messages>;
type Params = Record<string, string | number>;

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    /* storage unavailable (private mode): fall back to the browser language */
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

// Module-level so plain helpers (date and number formatting) follow the current language too.
let current: Lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const locale = () => (current === 'fr' ? 'fr-FR' : 'en-GB');

function lookup(lang: Lang, key: MessageKey, params?: Params): string {
  const dict = dictionaries[lang] as Record<string, string>;
  let template = dict[key];
  if (template === undefined && params && typeof params.n === 'number') {
    template = dict[`${key}_${new Intl.PluralRules(lang).select(params.n)}`] ?? dict[`${key}_other`];
  }
  return (template ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`));
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
  /** Like `t`, but placeholders may be React nodes (bold text, <code>, …). */
  rich: (key: MessageKey, nodes: Record<string, ReactNode>) => ReactNode;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);

  const setLang = useCallback((next: Lang) => {
    current = next; // before the re-render, so formatting helpers already see it
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisted: still applies to this visit */
    }
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => lookup(lang, key, params),
      rich: (key, nodes) =>
        lookup(lang, key)
          .split(/(\{\w+\})/)
          .map((part, i) => {
            const name = /^\{(\w+)\}$/.exec(part)?.[1];
            return <Fragment key={i}>{name && name in nodes ? nodes[name] : part}</Fragment>;
          }),
    }),
    [lang, setLang],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

export const useT = () => useI18n().t;

/** Server error messages are English; the common ones shown to people are translated here. */
const SERVER_ERRORS: [match: string, key: MessageKey][] = [
  ['Invalid email or password', 'err.invalidLogin'],
  ['This account could not be created', 'err.cannotRegister'],
  ['This invite code is invalid', 'err.inviteInvalid'],
  ['password is incorrect', 'err.wrongPassword'],
  ['Remove the other members of the household first', 'err.ownerHasMembers'],
  ['Registration is closed', 'err.registrationClosed'],
  ['Too many attempts', 'err.tooMany'],
  ['Password must be at least 10 characters', 'err.passwordShort'],
  ['Only the household owner can', 'err.ownerOnly'],
];

export function localizeError(t: I18n['t'], message: string): string {
  const hit = SERVER_ERRORS.find(([match]) => message.includes(match));
  return hit ? t(hit[1]) : message;
}

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('lang.label')} className={`flex rounded-lg border border-line p-0.5 text-xs ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          title={l.label}
          onClick={() => setLang(l.code)}
          className={`cursor-pointer rounded-md px-2 py-1 uppercase ${lang === l.code ? 'bg-accent/20 text-ink' : 'text-muted hover:text-ink'}`}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}
