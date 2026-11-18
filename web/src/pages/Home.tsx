import {
  CalendarPlus,
  ChatCircleDots,
  CheckCircle,
  Circle,
  CookingPot,
  Hourglass,
  ListChecks,
  Package,
  ShoppingCart,
  Trash,
  Wallet,
  X,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { api } from '../api';
import { formatDay, formatMoney, today } from '../format';
import { type MessageKey, useT } from '../i18n';
import type { ActionCard, AiStatus, MealType, NextActions } from '../types';
import { Badge, Button, Card, Empty } from '../ui';
import { Assistant } from './Assistant';

const HIDDEN_KEY = 'mealmcp.home.hidden';
type Icon = ComponentType<{ size?: number; className?: string; weight?: 'regular' | 'fill' | 'duotone' }>;

// "Not now" is a per-person convenience for the day, so it lives in the browser and the page works without it.
function readHidden(day: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null');
    return saved?.day === day && Array.isArray(saved.ids) ? saved.ids : [];
  } catch {
    return [];
  }
}
function writeHidden(day: string, ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify({ day, ids }));
  } catch {
    /* storage unavailable: the card simply comes back on the next visit */
  }
}

const go = (target: string) => {
  location.hash = target;
};
const tabOf = (target: string) => target.split('/')[0] as 'planning' | 'recipes' | 'shopping' | 'stock';

export function Home() {
  const t = useT();
  const day = today();
  const { data } = useQuery({ queryKey: ['next-actions'], queryFn: () => api.get<NextActions>('/next-actions') });
  // The conversation is offered only when the household's AI server answers and has a model.
  const { data: ai } = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.get<AiStatus>('/ai/status'), retry: false });
  const [asking, setAsking] = useState(false);
  const [hidden, setHidden] = useState(() => readHidden(day));
  if (!data) return null;

  const hide = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    writeHidden(day, next);
  };
  const restore = () => {
    setHidden([]);
    writeHidden(day, []);
  };
  const cards = data.cards.filter((c) => !hidden.includes(c.id));
  const hiddenCount = data.cards.length - cards.length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl lg:text-3xl">{t('home.title')}</h2>
        {ai?.text && (
          <Button onClick={() => setAsking(true)}>
            <ChatCircleDots size={16} />
            {t('assistant.open.button')}
          </Button>
        )}
      </div>
      {asking && <Assistant onClose={() => setAsking(false)} />}
      {data.budget && <BudgetTile budget={data.budget} />}
      {cards.length === 0 && <Empty>{t('home.allClear')}</Empty>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <ActionCardView key={card.id} card={card} onHide={() => hide(card.id)} />
        ))}
      </div>
      {hiddenCount > 0 && (
        <Button variant="ghost" onClick={restore}>
          {t('home.restore')}
        </Button>
      )}
    </>
  );
}

function ActionCardView({ card, onHide }: { card: ActionCard; onHide: () => void }) {
  const t = useT();
  const { Icon, title, body, action } = describe(card, t);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon size={20} weight="duotone" className="shrink-0 text-accent" />
          {title}
        </span>
      }
      actions={
        <Button variant="ghost" compact aria-label={t('home.dismissAria')} title={t('home.dismiss')} onClick={onHide}>
          <X size={16} />
        </Button>
      }
    >
      {body}
      {action && (
        <div className="mt-3">
          <Button variant="primary" onClick={() => go(action.target)}>
            {action.label}
          </Button>
        </div>
      )}
    </Card>
  );
}

type Translate = ReturnType<typeof useT>;
const para = (text: string) => <p className="text-sm text-muted">{text}</p>;
const names = (items: { name: string }[], total: number) => `${items.map((i) => i.name).join(', ')}${total > items.length ? ' …' : ''}`;

/** The wording of a card: every sentence the page can say comes from here. */
function describe(
  card: ActionCard,
  t: Translate,
): { Icon: Icon; title: ReactNode; body?: ReactNode; action?: { label: string; target: string } } {
  const open = (target: string) => ({ label: t(`home.go.${tabOf(target)}`), target });
  switch (card.id) {
    case 'getting-started':
      return {
        Icon: ListChecks,
        title: t('home.start.title'),
        body: (
          <>
            {para(t('home.start.intro'))}
            <ul className="mt-3 space-y-1">
              {card.steps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    disabled={step.done}
                    onClick={() => go(step.id === 'plan' ? 'planning' : step.id)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-ink/5 disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent sm:min-h-9"
                  >
                    {step.done ? (
                      <CheckCircle size={20} weight="fill" className="text-herb" />
                    ) : (
                      <Circle size={20} className="text-muted" />
                    )}
                    <span className={step.done ? 'line-through' : ''}>{t(`home.start.${step.id}`)}</span>
                    {step.done && <span className="sr-only">{t('home.start.done')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ),
      };
    case 'cook-today':
      return {
        Icon: CookingPot,
        title: t('home.cookToday.title'),
        body: (
          <ul className="space-y-1 text-sm">
            {card.meals.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{t(`meal.${m.mealType as MealType}`)}</span>
                <span>{m.name}</span>
                {m.canCook === false && <Badge tone="warn">{t('home.cookToday.missing')}</Badge>}
              </li>
            ))}
          </ul>
        ),
        action: open('planning'),
      };
    case 'expiring':
      return {
        Icon: Hourglass,
        title: t('home.expiring', { n: card.total }),
        body: (
          <>
            {para(names(card.items, card.total))}
            {card.recipe && <p className="mt-1 text-sm">{t('home.expiring.try', { recipe: card.recipe.name })}</p>}
          </>
        ),
        action: card.recipe ? { label: t('home.seeRecipe'), target: card.target } : open('stock'),
      };
    case 'discard':
      return {
        Icon: Trash,
        title: t('home.discard', { n: card.total }),
        body: (
          <>
            {para(names(card.items, card.total))}
            {para(t('home.discard.help'))}
          </>
        ),
        action: open('stock'),
      };
    case 'shopping-put-away':
      return {
        Icon: ShoppingCart,
        title: t('home.putAway', { n: card.count }),
        body: para(t('home.putAway.help')),
        action: open('shopping'),
      };
    case 'open-slots':
      return {
        Icon: CalendarPlus,
        title: t('home.slots', { n: card.count }),
        body: para(
          t('home.slots.next', { day: formatDay(card.first.date), meal: t(`meal.${card.first.mealType as MealType}`).toLowerCase() }),
        ),
        action: open('planning'),
      };
    case 'shopping-generate':
      return {
        Icon: ShoppingCart,
        title: t('home.generate', { n: card.meals }),
        body: para(t('home.generate.help')),
        action: open('planning'),
      };
    case 'shopping-open':
      return { Icon: ShoppingCart, title: t('home.toBuy', { n: card.count }), action: open('shopping') };
    case 'low-stock':
      return {
        Icon: Package,
        title: t('home.low', { n: card.total }),
        body: para(names(card.items, card.total)),
        action: open('stock'),
      };
  }
}

function BudgetTile({ budget }: { budget: NonNullable<NextActions['budget']> }) {
  const t = useT();
  const text =
    budget.budgetCents === null
      ? t('home.budget.none', { spent: formatMoney(budget.spentCents, budget.currency) })
      : t('home.budget.of', {
          spent: formatMoney(budget.spentCents, budget.currency),
          budget: formatMoney(budget.budgetCents, budget.currency),
        });
  return (
    <button
      type="button"
      onClick={() => go('budget')}
      aria-label={`${t('home.budget.title')}: ${text}`}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 text-left transition-[background-color,transform] hover:bg-surface-high active:scale-[0.99]"
    >
      <Wallet size={20} weight="duotone" className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">{t('home.budget.title')}</span>
        <span className="block">{text}</span>
      </span>
      {budget.state !== 'none' && (
        <Badge tone={budget.state === 'ok' ? 'accent' : budget.state === 'close' ? 'warn' : 'danger'}>
          {t(`home.budget.${budget.state}` as MessageKey)}
        </Badge>
      )}
    </button>
  );
}
