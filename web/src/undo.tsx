import { useEffect, useState } from 'react';
import { useT } from './i18n';
import { Button } from './ui';

/**
 * Deleting is deferred for a few seconds so that it can be taken back: the caller hides the thing at once,
 * and `commit` only runs once the delay is over. A second deletion commits the first right away.
 */
const DELAY_MS = 6000;
type Pending = { commit: () => void; undo: () => void; timer: ReturnType<typeof setTimeout> };
let pending: Pending | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

function settle(commit: boolean) {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  if (commit) p.commit();
  else p.undo();
  notify();
}

export function deferDelete({ commit, undo }: { commit: () => void; undo: () => void }) {
  settle(true);
  pending = { commit, undo, timer: setTimeout(() => settle(true), DELAY_MS) };
  notify();
}

/** A short confirmation for an action that has no undo ("meal cooked, stock updated"). */
let message: { text: string; timer: ReturnType<typeof setTimeout> } | null = null;
export function confirmation(text: string) {
  if (message) clearTimeout(message.timer);
  message = {
    text,
    timer: setTimeout(() => {
      message = null;
      notify();
    }, 4000),
  };
  notify();
}

/** Nothing may be lost when the page goes away during the delay. */
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => settle(true));

/** The "removed, undo" bar. Mounted once, by the shell. */
export function UndoHost() {
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!pending && message)
    return (
      <div
        role="status"
        className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80"
      >
        {message.text}
      </div>
    );
  if (!pending) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-sm sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80"
    >
      <span>{t('undo.removed')}</span>
      <Button variant="active" onClick={() => settle(false)}>
        {t('undo.action')}
      </Button>
    </div>
  );
}
