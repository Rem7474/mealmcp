import { PaperPlaneRight } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { localizeError, useT } from '../i18n';
import { Button, Sheet } from '../ui';

type Screen = 'planning' | 'recipes' | 'stock' | 'shopping';
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  suggest?: Screen[];
}

const TABS = { planning: 'tab.planning', recipes: 'tab.recipes', stock: 'tab.stock', shopping: 'tab.shopping' } as const;
const KEEP = 12;

/**
 * A small conversation about the household's own data. It only talks: it cannot change anything, and says which screen
 * to use instead. Nothing is saved: the conversation lives in this panel and is sent along with each question.
 */
export function Assistant({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns.length, waiting]);

  const send = async () => {
    const question = text.trim();
    if (!question || waiting) return;
    const next: Turn[] = [...turns, { role: 'user', content: question }];
    setTurns(next);
    setText('');
    setFailed(null);
    setWaiting(true);
    try {
      const messages = next.slice(-KEEP).map(({ role, content }) => ({ role, content }));
      const answer = await api.post<{ reply: string; suggest: Screen[] }>('/ai/chat', { messages });
      setTurns([...next, { role: 'assistant', content: answer.reply, suggest: answer.suggest }]);
    } catch (err) {
      setFailed(localizeError(t, err instanceof Error ? err.message : t('assistant.failed')));
    } finally {
      setWaiting(false);
    }
  };

  return (
    <Sheet title={t('assistant.title')} onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto p-5 text-sm" aria-live="polite">
        <p className="text-muted">{t('assistant.intro')}</p>
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === 'user' ? 'ml-8 rounded-lg bg-accent/10 p-3' : 'mr-8 rounded-lg border border-line p-3'}>
            <p className="whitespace-pre-wrap">{turn.content}</p>
            {turn.suggest && turn.suggest.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {turn.suggest.map((screen) => (
                  <Button
                    key={screen}
                    compact
                    onClick={() => {
                      location.hash = screen;
                      onClose();
                    }}
                  >
                    {t('assistant.open', { screen: t(TABS[screen]) })}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {waiting && <p className="text-muted">{t('assistant.thinking')}</p>}
        {failed && (
          <p role="alert" className="text-danger">
            {failed}
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label={t('assistant.ask')}
          className="min-h-11 flex-1 rounded-lg border border-control bg-transparent p-2 text-sm"
          maxLength={2000}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" type="submit" disabled={waiting || !text.trim()}>
          <PaperPlaneRight size={16} />
          {t('assistant.send')}
        </Button>
      </form>
    </Sheet>
  );
}
