import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate } from '../format';
import type { Household, TokenInfo, User } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { resetSession } from './AuthPage';

const day = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10));

export function Account({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const mcpUrl = `${location.origin}/mcp`;

  const logout = async () => {
    await api.post('/auth/logout');
    await resetSession(queryClient);
  };

  return (
    <>
      <Card
        title={user.name}
        actions={
          <Button onClick={logout}>Se déconnecter</Button>
        }
      >
        <p className="text-sm text-muted">
          {user.email} · {user.role === 'owner' ? 'propriétaire' : 'membre'} du foyer « {user.householdName} »
        </p>
      </Card>
      <HouseholdCard user={user} />
      <Card title="Connecter une IA (MCP)">
        <p className="text-sm">Adresse du serveur MCP :</p>
        <code className="mt-1 block rounded-lg border border-line px-3 py-2 text-sm break-all">{mcpUrl}</code>
        <p className="mt-2 text-sm text-muted">
          Les clients MCP compatibles OAuth (Claude, etc.) vous demanderont de vous connecter ici puis d’autoriser l’accès. Pour un script ou un client sans OAuth, créez un jeton personnel
          ci-dessous et envoyez-le dans l’en-tête <code>Authorization: Bearer …</code>.
        </p>
      </Card>
      <TokensCard />
    </>
  );
}

function HouseholdCard({ user }: { user: User }) {
  const { data: household } = useQuery({ queryKey: ['household'], queryFn: () => api.get<Household>('/household') });
  const { run, pending } = useAction();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);

  const createInvite = async () => setInvite((await run(() => api.post('/household/invites'))) as { code: string; expiresAt: number });

  return (
    <Card title="Foyer" actions={user.role === 'owner' && <Button disabled={pending} onClick={createInvite}>Inviter quelqu’un</Button>}>
      <ul className="divide-y divide-line text-sm">
        {household?.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {m.name} <span className="text-muted">{m.email}</span>
            </span>
            {m.role === 'owner' && <Badge tone="accent">propriétaire</Badge>}
          </li>
        ))}
      </ul>
      {invite && (
        <div className="mt-3 rounded-lg border border-accent p-3 text-sm">
          <p>
            Code d’invitation : <code className="text-base font-semibold select-all">{invite.code}</code>
          </p>
          <p className="mt-1 text-muted">
            À saisir par la personne invitée lors de la création de son compte. À usage unique, valable 7 jours (jusqu’au {day(invite.expiresAt)}). Il ne sera plus affiché ensuite.
          </p>
        </div>
      )}
    </Card>
  );
}

function TokensCard() {
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
    <Card title="Accès et jetons">
      <form onSubmit={create} className="mb-3 flex flex-wrap gap-2">
        <Input required placeholder="Nom du jeton (ex. script maison)" aria-label="Nom du jeton" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 basis-48" />
        <Button type="submit" disabled={pending}>
          Créer un jeton personnel
        </Button>
      </form>
      {created && (
        <div className="mb-3 rounded-lg border border-accent p-3 text-sm">
          <p>Copiez ce jeton maintenant, il ne sera plus affiché :</p>
          <code className="mt-1 block text-base break-all select-all">{created}</code>
        </div>
      )}
      {tokens.length === 0 ? (
        <Empty>Aucune application ni jeton n’a accès à votre compte.</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name ?? 'Application MCP (OAuth)'}</div>
                <div className="text-muted">
                  Créé le {day(t.createdAt)} · {t.lastUsedAt ? `utilisé le ${day(t.lastUsedAt)}` : 'jamais utilisé'}
                </div>
              </div>
              <Button variant="danger" onClick={() => run(() => api.del(`/tokens/${t.id}`))}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
