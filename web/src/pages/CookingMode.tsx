import { ArrowCounterClockwise, ArrowLeft, ArrowRight, CookingPot, Pause, Play, Thermometer, Timer, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { formatQty } from '../format';
import { useI18n } from '../i18n';
import type { Ingredient, Recipe } from '../types';
import { Button } from '../ui';

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

export function CookingMode({ recipe, activeServings, onClose }: { recipe: Recipe; activeServings: number; onClose: () => void }) {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const [showAllIngredients, setShowAllIngredients] = useState(false);

  const steps = recipe.steps;
  const total = steps.length;
  const step = steps[stepIndex];

  const initialSeconds = step?.durationMinutes != null ? step.durationMinutes * 60 : 0;
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  // Reset the step timer whenever the user moves to another step.
  useEffect(() => {
    setRemainingSeconds(step?.durationMinutes != null ? step.durationMinutes * 60 : 0);
    setTimerRunning(false);
    setTimerDone(false);
    setShowAllIngredients(false);
  }, [stepIndex, step?.durationMinutes]);

  // Tick the countdown timer once per second while active.
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          setTimerDone(true);
          playBeep();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

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

  // Keyboard navigation: Left/Right to step, Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  return (
    <div role="dialog" aria-modal="true" aria-label={recipe.name} className="fixed inset-0 z-50 flex flex-col bg-bg text-ink">
      <header className="border-b border-line px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold sm:text-xl">{recipe.name}</h2>
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
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          {(step.durationMinutes !== null || step.temperatureC !== null || step.appliance) && (
            <div className="flex flex-wrap items-center gap-3">
              {step.durationMinutes !== null && (
                <div
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                    timerDone ? 'border-accent bg-accent/10' : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Timer size={24} className="text-accent" />
                    <span className="text-2xl font-bold tabular-nums sm:text-3xl">{formatCountdown(remainingSeconds)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      compact
                      onClick={() => {
                        if (remainingSeconds === 0) {
                          setRemainingSeconds(step.durationMinutes! * 60);
                          setTimerDone(false);
                        }
                        setTimerRunning((r) => !r);
                      }}
                    >
                      {timerRunning ? <Pause size={16} /> : <Play size={16} />}
                      {timerRunning ? t('cooking.timer.pause') : t('cooking.timer.start')}
                    </Button>
                    <Button
                      compact
                      aria-label={t('cooking.timer.reset')}
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerDone(false);
                        setRemainingSeconds(step.durationMinutes! * 60);
                      }}
                    >
                      <ArrowCounterClockwise size={16} />
                    </Button>
                  </div>
                  {timerDone && (
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
            <Button variant="primary" onClick={onClose}>
              {t('cooking.finish')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)}>
              {t('cooking.next')}
              <ArrowRight size={18} />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
