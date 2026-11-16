import { Star } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const field =
  'h-9 min-w-0 rounded-lg border border-control bg-surface px-3 text-sm text-ink placeholder:text-muted hover:border-muted focus:border-accent focus-visible:outline-2 disabled:opacity-45';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${field} ${className}`} {...props} />;
}

/**
 * Three levels. primary: filled, the one main action of a screen. secondary: outlined, everything else.
 * active: a soft accent pill for a chosen filter or option (never for an action). ghost and danger are quiet.
 */
type Variant = 'primary' | 'secondary' | 'active' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'border border-accent bg-accent text-accent-ink hover:bg-accent-400 active:bg-accent-300',
  secondary: 'border border-control text-ink hover:border-muted hover:bg-ink/5 active:bg-ink/10',
  active: 'border border-accent/60 bg-accent/15 text-accent-soft hover:bg-accent/25 active:bg-accent/30',
  ghost: 'text-muted hover:bg-ink/5 hover:text-ink',
  danger: 'border border-transparent text-danger hover:bg-danger/10',
};

/** 44px tall on touch screens (the minimum for a thumb), denser from 640px up; `compact` is the filter size. */
export function Button({
  variant = 'secondary',
  compact = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; compact?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex ${compact ? 'h-10 px-3 sm:h-8' : 'h-11 px-4 sm:h-9 sm:px-3'} shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted disabled:opacity-70 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** A card whose body folds away behind its title: the one pattern for optional forms and settings. */
export function Accordion({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <summary className="flex min-h-11 cursor-pointer items-center py-0.5 font-medium sm:min-h-0 sm:block">{summary}</summary>
      {children}
    </details>
  );
}

/**
 * A card that folds away. Open by default on wide screens, closed on phones, where a long settings page
 * would otherwise be one endless scroll. The inner card keeps its logic; only its title is replaced by the summary.
 */
export function Fold({ title, children }: { title: ReactNode; children: ReactNode }) {
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  return (
    <details open={wide} className="group rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium sm:min-h-0 sm:block">{title}</summary>
      <div className="mt-3 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&>section>header:not(:has(button))]:hidden [&>section>header>h2]:hidden">
        {children}
      </div>
    </details>
  );
}

/** Folded on phones to keep a page short, always open (and without its summary) from 1024px up. */
export function Disclose({ summary, children, className = '' }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  return (
    <details open={wide} className={`group rounded-xl border border-line px-3 py-2.5 lg:border-0 lg:p-0 ${className}`}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium lg:hidden">{summary}</summary>
      <div className="mt-3 lg:mt-0">{children}</div>
    </details>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger' | 'accent'; children: ReactNode }) {
  const tones = {
    muted: 'bg-ink/5 text-muted',
    warn: 'bg-warn/12 text-warn',
    danger: 'bg-danger/12 text-danger',
    accent: 'bg-accent/15 text-accent-soft',
  };
  return <span className={`rounded-md px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

/** Five stars: read-only when `onChange` is missing. Clicking the current rating clears it. */
export function Stars({
  value,
  onChange,
  label,
  size = 16,
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  label?: (n: number) => string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={onChange ? 'group' : 'img'}
      aria-label={onChange ? undefined : `${value ?? 0}/5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star size={size} weight={n <= (value ?? 0) ? 'fill' : 'regular'} className={n <= (value ?? 0) ? 'text-warn' : 'text-muted'} />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            aria-label={label?.(n) ?? String(n)}
            aria-pressed={n === value}
            className="cursor-pointer rounded p-1 hover:bg-ink/5 max-sm:p-1.5"
            onClick={() => onChange(n === value ? null : n)}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}
