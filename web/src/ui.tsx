import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const field =
  'h-10 min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-accent';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${field} ${className}`} {...props} />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink hover:border-muted',
  ghost: 'text-muted hover:text-ink',
  danger: 'text-danger hover:underline',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium disabled:cursor-default disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'warn' | 'danger' | 'accent'; children: ReactNode }) {
  const tones = { muted: 'text-muted', warn: 'text-warn', danger: 'text-danger', accent: 'text-accent' };
  return <span className={`rounded-full border border-current px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
