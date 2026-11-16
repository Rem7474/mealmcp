import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, useAction } from '../api';
import { useT } from '../i18n';
import type { AiModel, AiStatus, AiTest, User } from '../types';
import { Badge, Button, Card, Field, Select } from '../ui';

/** What the AI server offers this household. Flows that need a model read this and hide their AI buttons when it is off. */
export function useAiStatus() {
  return useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.get<AiStatus>('/ai/status'), staleTime: 15_000 });
}

/**
 * The household's choice of models on the local AI server. Shown only when the server is configured: nobody is
 * asked to care about an AI they cannot use. The owner chooses, everyone else sees what is used.
 */
export function AiCard({ user }: { user: User }) {
  const t = useT();
  const { run, pending } = useAction();
  const status = useAiStatus();
  const enabled = status.data?.enabled === true;
  const models = useQuery({ queryKey: ['ai', 'models'], queryFn: () => api.get<AiModel[]>('/ai/models'), enabled });
  const [result, setResult] = useState<AiTest | null>(null);
  if (!enabled || !status.data) return null;
  const s = status.data;
  const owner = user.role === 'owner';

  const choose = (field: 'model' | 'visionModel', value: string) =>
    run(() => api.put('/ai/model', { [field]: value === '' ? null : value })).then(() => setResult(null));
  const test = () => run(async () => setResult(await api.post<AiTest>('/ai/test', {})));

  const options = (vision: boolean) =>
    (models.data ?? [])
      .filter((m) => !vision || m.vision !== 'no')
      .map((m) => (
        <option key={m.id} value={m.id}>
          {m.id}
          {m.vision === 'yes' ? ` · ${t('ai.images')}` : ''}
        </option>
      ));

  return (
    <Card
      title={t('ai.title')}
      actions={<Badge tone={s.reachable ? 'accent' : 'warn'}>{s.reachable ? t('ai.reachable') : t('ai.unreachable')}</Badge>}
    >
      <p className="mb-3 text-sm text-muted">{t('ai.intro')}</p>
      {!s.reachable && <p className="mb-3 text-sm text-warn">{t('ai.unreachableHelp')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ai.textModel')}>
          <Select disabled={!owner || pending || !s.reachable} value={s.textModel ?? ''} onChange={(e) => choose('model', e.target.value)}>
            <option value="">{t('ai.notChosen')}</option>
            {s.textModel && !(models.data ?? []).some((m) => m.id === s.textModel) && <option value={s.textModel}>{s.textModel}</option>}
            {options(false)}
          </Select>
        </Field>
        <Field label={t('ai.visionModel')} hint={t('ai.visionHint')}>
          <Select
            disabled={!owner || pending || !s.reachable}
            value={s.visionModel ?? ''}
            onChange={(e) => choose('visionModel', e.target.value)}
          >
            <option value="">{t('ai.sameModel')}</option>
            {s.visionModel && !(models.data ?? []).some((m) => m.id === s.visionModel) && (
              <option value={s.visionModel}>{s.visionModel}</option>
            )}
            {options(true)}
          </Select>
        </Field>
      </div>
      {!owner && <p className="mt-2 text-xs text-muted">{t('ai.ownerOnly')}</p>}
      <p className="mt-3 text-sm">
        {s.text ? t('ai.text.yes') : t('ai.text.no')} · {t(`ai.vision.${s.vision}`)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={pending || !s.textModel} onClick={test}>
          {t('ai.test')}
        </Button>
        {result && (
          <ul className="text-sm" aria-label={t('ai.testResult')}>
            <li>
              {result.reachable ? '✓' : '✗'} {t('ai.test.reachable')}
            </li>
            <li>
              {result.model ? '✓' : '✗'} {t('ai.test.model')}
            </li>
            <li>
              {result.json ? '✓' : '✗'} {t('ai.test.json')}
            </li>
            {result.vision !== 'skipped' && (
              <li>
                {result.vision === 'ok' ? '✓' : '✗'} {t('ai.test.vision')}
              </li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
