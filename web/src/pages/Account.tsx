import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate } from '../format';
import { useI18n } from '../i18n';
import type { Household, TokenInfo, User } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { resetSession } from './AuthPage';

const day = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10));

export function Account({ user }: { user: User }) {
  const { t, rich } = useI18n();
  const queryClient = useQueryClient();
  const mcpUrl = `${location.origin}/mcp`;

  const logout = async () => {
    await api.post('/auth/logout');
    await resetSession(queryClient);
  };

  return (
    <>
      <Card title={user.name} actions={<Button onClick={logout}>{t('account.signOut')}</Button>}>
        <p className="text-sm text-muted">
          {t('account.roleLine', { email: user.email, role: t(`role.${user.role}`), household: user.householdName })}
        </p>
      </Card>
      <HouseholdCard user={user} />
      <Card title={t('account.connect.title')}>
        <p className="text-sm">{t('account.connect.address')}</p>
        <code className="mt-1 block rounded-lg border border-line px-3 py-2 text-sm break-all">{mcpUrl}</code>
        <p className="mt-2 text-sm text-muted">{rich('account.connect.help', { header: <code>Authorization: Bearer …</code> })}</p>
      </Card>
      <TokensCard />
    </>
  );
}

function HouseholdCard({ user }: { user: User }) {
  const { t, rich } = useI18n();
  const { data: household } = useQuery({ queryKey: ['household'], queryFn: () => api.get<Household>('/household') });
  const { run, pending } = useAction();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);

  const createInvite = async () => setInvite((await run(() => api.post('/household/invites'))) as { code: string; expiresAt: number });

  return (
    <Card title={t('household.title')} actions={user.role === 'owner' && <Button disabled={pending} onClick={createInvite}>{t('household.invite')}</Button>}>
      <ul className="divide-y divide-line text-sm">
        {household?.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {m.name} <span className="text-muted">{m.email}</span>
            </span>
            {m.role === 'owner' && <Badge tone="accent">{t('role.owner')}</Badge>}
          </li>
        ))}
      </ul>
      {invite && (
        <div className="mt-3 rounded-lg border border-accent p-3 text-sm">
          <p>{rich('household.inviteCode', { code: <code className="text-base font-semibold select-all">{invite.code}</code> })}</p>
          <p className="mt-1 text-muted">{t('household.inviteHelp', { date: day(invite.expiresAt) })}</p>
        </div>
      )}
    </Card>
  );
}

function TokensCard() {
  const { t } = useI18n();
  const { data: tokens = [] } = useQuery({ queryKey: ['tokens'], queryFn: () => api.get<TokenInfo[]>('/tokens') });
  const { run, pending } = useAction();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { token } = (await run(() => api.post('/tokens', { name }))) as { token: string };
    setCreated(token);
    setName('');
  };

  return (
    <Card title={t('tokens.title')}>
      <form onSubmit={create} className="mb-3 flex flex-wrap gap-2">
        <Input required placeholder={t('tokens.namePlaceholder')} aria-label={t('tokens.nameAria')} value={name} onChange={(e) => setName(e.target.value)} className="flex-1 basis-48" />
        <Button type="submit" disabled={pending}>
          {t('tokens.create')}
        </Button>
      </form>
      {created && (
        <div className="mb-3 rounded-lg border border-accent p-3 text-sm">
          <p>{t('tokens.copy')}</p>
          <code className="mt-1 block text-base break-all select-all">{created}</code>
        </div>
      )}
      {tokens.length === 0 ? (
        <Empty>{t('tokens.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{token.name ?? t('tokens.oauthApp')}</div>
                <div className="text-muted">
                  {t('tokens.meta', {
                    created: day(token.createdAt),
                    usage: token.lastUsedAt ? t('tokens.lastUsed', { date: day(token.lastUsedAt) }) : t('tokens.neverUsed'),
                  })}
                </div>
              </div>
              <Button variant="danger" onClick={() => run(() => api.del(`/tokens/${token.id}`))}>
                {t('tokens.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
