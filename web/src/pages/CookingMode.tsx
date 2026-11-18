import { ArrowCounterClockwise, ArrowLeft, ArrowRight, CookingPot, Pause, Play, Thermometer, Timer, X } from '@phosphor-icons/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, useAction } from '../api';
import { formatQty } from '../format';
import { useI18n } from '../i18n';
import type { Ingredient, Recipe } from '../types';
import { Button } from '../ui';
import { confirmation } from '../undo';

type StepTimer = { remaining: number; running: boolean; done: boolean };

const STOPWORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'en',
  'au',
  'aux',
  'et',
  'ou',
  'a',
  'of',
  'the',
  'and',
  'or',
  'in',
  'with',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function stemWord(word: string): string {
  if (word.length > 3 && (word.endsWith('s') || word.endsWith('x'))) return word.slice(0, -1);
  return word;
}

/** Returns the recipe ingredients whose name appears in the step text (accent- and plural-insensitive). */
export function matchStepIngredients(stepText: string, ingredients: Ingredient[]): Ingredient[] {
  const stepTokens = tokenize(stepText);
  if (stepTokens.length === 0) return [];
  const stepStems = new Set(stepTokens.flatMap((t) => [t, stemWord(t)]));

  return ingredients.filter((ing) => {
    const tokens = tokenize(ing.name).filter((t) => !STOPWORDS.has(t) && t.length >= 2);
    const candidates = tokens.length > 0 ? tokens : tokenize(ing.name);
    return candidates.some((t) => stepStems.has(t) || stepStems.has(stemWord(t)));
  });
}

function formatCountdown(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => void ctx.close();
  } catch {
    // Ignore audio errors in restricted or headless environments.
  }
}

export function CookingMode({
  recipe,
  activeServings,
  mealId,
  onClose,
}: {
  recipe: Recipe;
  activeServings: number;
  mealId?: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [timers, setTimers] = useState<Record<number, StepTimer>>({});

  const steps = recipe.steps;
  const total = steps.length;
  const step = steps[stepIndex];

  const defaultSeconds = step?.durationMinutes != null ? step.durationMinutes * 60 : 0;
  const currentTimer = timers[stepIndex] ?? { remaining: defaultSeconds, running: false, done: false };
  const hasRunningTimers = Object.values(timers).some((tm) => tm.running);

  // Open as a native modal <dialog> so focus stays trapped and background scrolling is blocked.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }, []);

  // Collapse the full-ingredient drawer when moving to another step.
  useEffect(() => {
    setShowAllIngredients(false);
  }, [stepIndex]);

  // Tick all running step timers once per second, even when viewing another step.
  useEffect(() => {
    if (!hasRunningTimers) return;
    const id = window.setInterval(() => {
      setTimers((prev) => {
        let changed = false;
        const next: Record<number, StepTimer> = {};
        for (const [k, tm] of Object.entries(prev)) {
          const idx = Number(k);
          if (!tm.running) {
            next[idx] = tm;
            continue;
          }
          changed = true;
          if (tm.remaining <= 1) {
            next[idx] = { remaining: 0, running: false, done: true };
            playBeep();
          } else {
            next[idx] = { ...tm, remaining: tm.remaining - 1 };
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasRunningTimers]);

  // Keep the screen awake while cooking when the browser supports Wake Lock.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let active = true;
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (active) sentinel = s;
        else void s.release();
      })
      .catch(() => {});
    return () => {
      active = false;
      void sentinel?.release();
    };
  }, []);

  // Keyboard navigation: Left/Right to step, Escape fallback when showModal is unavailable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && typeof dialogRef.current?.showModal !== 'function') onClose();
      else if (e.key === 'ArrowRight' && stepIndex < total - 1) setStepIndex((i) => i + 1);
      else if (e.key === 'ArrowLeft' && stepIndex > 0) setStepIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, stepIndex, total]);

  const matchedIngredients = useMemo(() => (step ? matchStepIngredients(step.text, recipe.ingredients) : []), [step, recipe.ingredients]);

  if (!step) return null;

  const displayedIngredients = showAllIngredients ? recipe.ingredients : matchedIngredients;
  const progressPct = Math.round(((stepIndex + 1) / total) * 100);
  const isLast = stepIndex === total - 1;
  const otherTimers = Object.entries(timers)
    .map(([k, tm]) => ({ idx: Number(k), ...tm }))
    .filter((tm) => tm.idx !== stepIndex && (tm.running || tm.done));

  const finishAndCook = async () => {
    if (mealId === undefined) return;
    await run(() => api.post(`/plan/${mealId}/cook`));
    confirmation(t('plan.cookedToast'));
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-bg p-0 text-ink open:flex"
    >
      <header className="border-b border-line px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold sm:text-xl">
              {recipe.name}
            </h2>
            <p className="text-sm text-muted">
              {t('cooking.stepOf', { current: stepIndex + 1, total })} · {t('common.servings', { n: activeServings })}
            </p>
          </div>
          <Button variant="ghost" aria-label={t('cooking.close')} onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        <div className="mx-auto mt-3 h-1.5 max-w-4xl overflow-hidden rounded-full bg-line">
          <div className="h-full bg-accent transition-all duration-200" style={{ width: `${progressPct}%` }} />
        </div>
        {otherTimers.length > 0 && (
          <div className="mx-auto mt-2.5 flex max-w-4xl flex-wrap gap-2">
            {otherTimers.map((tm) => (
              <button
                key={tm.idx}
                type="button"
                onClick={() => setStepIndex(tm.idx)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tabular-nums ${
                  tm.done ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-surface text-ink hover:border-accent'
                }`}
              >
                <Timer size={14} className="text-accent" />
                {tm.done
                  ? t('cooking.timer.doneStep', { step: tm.idx + 1 })
                  : t('cooking.timer.runningStep', { step: tm.idx + 1, time: formatCountdown(tm.remaining) })}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {(step.durationMinutes !== null || step.temperatureC !== null || step.appliance) && (
            <div className="flex flex-wrap items-center gap-3">
              {step.durationMinutes !== null && (
                <div
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                    currentTimer.done ? 'border-accent bg-accent/10' : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Timer size={24} className="text-accent" />
                    <span className="text-2xl font-bold tabular-nums sm:text-3xl">{formatCountdown(currentTimer.remaining)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      compact
                      onClick={() =>
                        setTimers((prev) => {
                          const cur = prev[stepIndex] ?? { remaining: defaultSeconds, running: false, done: false };
                          const remaining = cur.remaining === 0 ? defaultSeconds : cur.remaining;
                          return { ...prev, [stepIndex]: { remaining, running: !cur.running, done: false } };
                        })
                      }
                    >
                      {currentTimer.running ? <Pause size={16} /> : <Play size={16} />}
                      {currentTimer.running ? t('cooking.timer.pause') : t('cooking.timer.start')}
                    </Button>
                    <Button
                      compact
                      aria-label={t('cooking.timer.reset')}
                      onClick={() =>
                        setTimers((prev) => ({
                          ...prev,
                          [stepIndex]: { remaining: defaultSeconds, running: false, done: false },
                        }))
                      }
                    >
                      <ArrowCounterClockwise size={16} />
                    </Button>
                  </div>
                  {currentTimer.done && (
                    <span role="status" className="text-sm font-semibold text-accent">
                      {t('cooking.timer.done')}
                    </span>
                  )}
                </div>
              )}

              {step.temperatureC !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-2 text-base font-semibold text-accent">
                  <Thermometer size={18} />
                  {step.temperatureC} °C
                </span>
              )}

              {step.appliance && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-base font-medium">
                  <CookingPot size={18} />
                  {step.appliance}
                </span>
              )}
            </div>
          )}

          <p className="text-xl leading-relaxed font-medium sm:text-2xl sm:leading-relaxed">{step.text}</p>

          {recipe.ingredients.length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {showAllIngredients ? t('cooking.allIngredients', { n: recipe.ingredients.length }) : t('cooking.stepIngredients')}
                </h3>
                <Button compact variant="ghost" onClick={() => setShowAllIngredients((v) => !v)}>
                  {showAllIngredients
                    ? `${t('cooking.stepIngredients')} (${matchedIngredients.length})`
                    : t('cooking.allIngredients', { n: recipe.ingredients.length })}
                </Button>
              </div>
              {displayedIngredients.length === 0 ? (
                <p className="text-sm text-muted">{t('cooking.noStepIngredients')}</p>
              ) : (
                <ul className="divide-y divide-line text-base">
                  {displayedIngredients.map((ing) => {
                    const scaledQty = Math.round(((ing.quantity * activeServings) / recipe.servings) * 100) / 100;
                    return (
                      <li key={ing.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                        <span className="w-24 shrink-0 text-right font-semibold text-accent tabular-nums">
                          {ing.toTaste ? t('recipes.toTaste') : formatQty(scaledQty, ing.unit)}
                        </span>
                        <span className="font-medium">{ing.name}</span>
                        {ing.note && <span className="text-sm text-muted">({ing.note})</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-line px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Button disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
            <ArrowLeft size={18} />
            {t('cooking.prev')}
          </Button>
          {isLast ? (
            <div className="flex flex-wrap items-center gap-2">
              {mealId !== undefined && (
                <Button onClick={onClose} disabled={pending}>
                  {t('cooking.finish')}
                </Button>
              )}
              <Button variant="primary" disabled={pending} onClick={mealId !== undefined ? finishAndCook : onClose}>
                {mealId !== undefined ? t('cooking.finishAndCook') : t('cooking.finish')}
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)}>
              {t('cooking.next')}
              <ArrowRight size={18} />
            </Button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
