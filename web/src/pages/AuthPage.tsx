import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import type { Me } from '../types';
import { Button, Card, Input } from '../ui';

/** Login and sign-up. Sign-up needs an invite code unless the server allows open registration. */
export function AuthPage({ registrationOpen }: { registrationOpen: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', name: '', password: '', inviteCode: '', householdName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const joining = form.inviteCode.trim() !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await api.post('/auth/login', { email: form.email, password: form.password });
      else
        await api.post('/auth/register', {
          email: form.email,
          name: form.name,
          password: form.password,
          inviteCode: form.inviteCode.trim() || undefined,
          householdName: !joining && form.householdName.trim() ? form.householdName.trim() : undefined,
        });
      await resetSession(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-6 text-center text-2xl font-bold text-accent">MealMCP</h1>
      <Card title={mode === 'login' ? 'Connexion' : 'Créer un compte'}>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <Input required autoComplete="name" placeholder="Votre prénom" aria-label="Nom" value={form.name} onChange={(e) => set({ name: e.target.value })} className="w-full" />
          )}
          <Input required type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => set({ email: e.target.value })} className="w-full" />
          <Input
            required
            type="password"
            minLength={mode === 'register' ? 10 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'Mot de passe (10 caractères minimum)' : 'Mot de passe'}
            aria-label="Mot de passe"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            className="w-full"
          />
          {mode === 'register' && (
            <>
              <Input
                required={!registrationOpen}
                placeholder={registrationOpen ? 'Code d’invitation (facultatif)' : 'Code d’invitation'}
                aria-label="Code d’invitation"
                value={form.inviteCode}
                onChange={(e) => set({ inviteCode: e.target.value })}
                className="w-full"
              />
              {registrationOpen && !joining && (
                <Input placeholder="Nom du foyer (facultatif)" aria-label="Nom du foyer" value={form.householdName} onChange={(e) => set({ householdName: e.target.value })} className="w-full" />
              )}
              <p className="text-sm text-muted">
                {joining
                  ? 'Vous rejoindrez le foyer de la personne qui vous a invité.'
                  : registrationOpen
                    ? 'Sans code, un nouveau foyer est créé et vous en êtes le propriétaire.'
                    : 'Les inscriptions sont fermées : demandez un code d’invitation à un membre du foyer.'}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}{' '}
        <button
          className="cursor-pointer text-accent underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
        </button>
      </p>
    </main>
  );
}

export const meKey = ['me'] as const;

/** After login/logout: drop cached household data (it may belong to someone else) and re-read who is logged in. */
export async function resetSession(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
  await queryClient.invalidateQueries({ queryKey: meKey });
}
export const fetchMe = () => api.get<Me>('/auth/me');
