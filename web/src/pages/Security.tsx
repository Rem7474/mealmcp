import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate } from '../format';
import { useI18n } from '../i18n';
import type { SessionInfo, User } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { resetSession } from './AuthPage';

const day = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10));

/** Reads a browser name out of a user agent: enough to tell "my phone" from "my laptop". */
export function deviceName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return [browser, system].filter(Boolean).join(' · ') || userAgent.slice(0, 40);
}

/** Change the password; every other signed-in device is signed out by the server. */
export function PasswordCard() {
  const { t } = useI18n();
  const { run, pending } = useAction();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(false);
    await run(() => api.post('/auth/password', { currentPassword: current, newPassword: next }));
    setCurrent('');
    setNext('');
    setDone(true);
  };

  return (
    <Card title={t('password.title')}>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
        <Input
          type="password"
          required
          autoComplete="current-password"
          placeholder={t('password.current')}
          aria-label={t('password.current')}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          placeholder={t('password.new')}
          aria-label={t('password.new')}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {t('password.change')}
          </Button>
          {done && (
            <span role="status" className="text-sm text-muted">
              {t('password.changed')}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

/** The browsers signed in to this account, each of which can be signed out. */
export function DevicesCard() {
  const { t } = useI18n();
  const { data: sessions = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionInfo[]>('/auth/sessions') });
  const { run, pending } = useAction();
  const others = sessions.filter((s) => !s.current).length;

  return (
    <Card
      title={t('devices.title')}
      actions={
        others > 0 && (
          <Button disabled={pending} onClick={() => run(() => api.post('/auth/sessions/revoke-others'))}>
            {t('devices.revokeOthers')}
          </Button>
        )
      }
    >
      {sessions.length === 0 ? (
        <Empty>{t('devices.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {deviceName(s.userAgent) ?? t('devices.unknown')}
                  {s.current && <Badge tone="accent">{t('devices.current')}</Badge>}
                </div>
                <div className="text-muted">
                  {s.lastSeenAt ? t('devices.lastSeen', { date: day(s.lastSeenAt) }) : t('devices.neverSeen')}
                </div>
              </div>
              {!s.current && (
                <Button variant="danger" disabled={pending} onClick={() => run(() => api.del(`/auth/sessions/${s.id}`))}>
                  {t('devices.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Deleting the account needs the password. An owner alone also deletes the household and its data. */
export function DeleteAccountCard({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t(user.role === 'owner' ? 'danger.confirmOwner' : 'danger.confirmMember'))) return;
    await run(() => api.del('/auth/account', { password }));
    await resetSession(queryClient);
  };

  return (
    <Card title={t('danger.title')}>
      <p className="text-sm text-muted">{t(user.role === 'owner' ? 'danger.helpOwner' : 'danger.helpMember')}</p>
      {!open ? (
        <Button variant="danger" className="mt-3" onClick={() => setOpen(true)}>
          {t('danger.delete')}
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
          <Input
            type="password"
            required
            autoComplete="current-password"
            placeholder={t('danger.password')}
            aria-label={t('danger.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 basis-48"
          />
          <Button variant="danger" type="submit" disabled={pending}>
            {t('danger.confirm')}
          </Button>
        </form>
      )}
    </Card>
  );
}
