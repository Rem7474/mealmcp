import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const field =
  'h-9 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted hover:border-muted focus:border-accent focus-visible:outline-2 disabled:opacity-45';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${field} ${className}`} {...props} />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
// Outlined, never filled: the accent shows as a line and a tint on hover.
const variants: Record<Variant, string> = {
  primary: 'border border-accent text-ink hover:bg-accent/15 active:bg-accent/25',
  secondary: 'border border-line text-ink hover:border-muted hover:bg-ink/5 active:bg-ink/10',
  ghost: 'text-muted hover:bg-ink/5 hover:text-ink',
  danger: 'border border-transparent text-danger hover:bg-danger/10',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-transparent px-3 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--line)]">
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
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
