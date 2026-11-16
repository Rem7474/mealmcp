import { Plus, Star, X } from '@phosphor-icons/react';
import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect, useRef } from 'react';
import { useT } from './i18n';

const field =
  'h-11 min-w-0 rounded-lg border border-control bg-surface px-3 text-base text-ink sm:h-9 sm:text-sm placeholder:text-muted hover:border-muted focus:border-accent focus-visible:outline-2 disabled:opacity-45';

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
export function Fold({ title, children, open, id }: { title: ReactNode; children: ReactNode; open?: boolean; id?: string }) {
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
  return (
    <details id={id} open={open ?? wide} className="scroll-mt-20 group rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
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
    muted: 'border border-line text-muted',
    warn: 'bg-warn/12 text-warn',
    danger: 'bg-danger/12 text-danger',
    accent: 'bg-accent/15 text-accent-soft',
  };
  return <span className={`rounded-md px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
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

/**
 * A form in its own layer instead of a fold in the page: a sheet that slides up from the bottom on a phone and a
 * centred dialog on a wide screen. It is a native <dialog>, so focus is trapped, Escape closes it and the page
 * behind stays still. Mount it only while it is open.
 */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={typeof title === 'string' ? title : undefined}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl border border-line bg-surface p-0 text-ink open:flex sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-control sm:hidden" aria-hidden="true" />
      <header className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
        <h2 className="text-2xl">{title}</h2>
        <Button variant="ghost" className="-mr-2 w-11 px-0 sm:w-9" aria-label={t('app.close')} onClick={onClose}>
          <X size={18} />
        </Button>
      </header>
      <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </dialog>
  );
}

/** A labelled form control: the label stays visible above the field, as in a native form. */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** The one main action of a screen on a phone: a round button within thumb reach, above the tab bar. */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 grid size-14 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink active:scale-95 sm:hidden"
    >
      <Plus size={24} />
    </button>
  );
}
