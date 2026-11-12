import { describe, expect, it } from 'vitest';
import { api, UnauthorizedError } from './api';
import { mockApi } from './test/utils';

describe('api client', () => {
  it('sends JSON bodies and parses answers', async () => {
    const { calls } = mockApi({ 'POST /stock': ({ body }) => ({ status: 201, body: { echoed: body } }) });
    await expect(api.post('/stock', { name: 'Milk' })).resolves.toEqual({ echoed: { name: 'Milk' } });
    expect(calls[0]).toEqual({ method: 'POST', path: '/stock', body: { name: 'Milk' } });
  });

  it('returns nothing for 204', async () => {
    mockApi({ 'DELETE /stock/1': { status: 204 } });
    await expect(api.del('/stock/1')).resolves.toBeUndefined();
  });

  it('can send a body with DELETE (account deletion asks for the password)', async () => {
    const { calls } = mockApi({ 'DELETE /auth/account': { status: 204 } });
    await api.del('/auth/account', { password: 'secret' });
    expect(calls[0].body).toEqual({ password: 'secret' });
  });

  it('tells "not signed in" apart from other failures', async () => {
    mockApi({
      'GET /a': { status: 401, body: { error: 'Authentication required' } },
      'GET /b': { status: 400, body: { error: 'Bad input' } },
      'GET /c': { status: 500 },
    });
    await expect(api.get('/a')).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(api.get('/b')).rejects.toThrow('Bad input');
    await expect(api.get('/c')).rejects.toThrow('Error 500');
  });
});
