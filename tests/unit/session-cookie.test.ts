import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { encodeSessionCookie, parseSessionCookie, usernameFromAccessToken } from '../../apps/service/src/auth';
import { refreshParameters } from '../../apps/service/src/cognito';
import { json } from '../../apps/service/src/http';

function accessTokenWith(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}

describe('session cookie payload', () => {
  it('stores username with the refresh token so a reload can hash SECRET_HASH', () => {
    const raw = encodeSessionCookie('refresh-token-value', 'player@example.com');
    expect(parseSessionCookie(raw)).toEqual({
      refreshToken: 'refresh-token-value',
      username: 'player@example.com',
    });
  });

  it('still reads cookies that were only the raw Cognito refresh token', () => {
    expect(parseSessionCookie('legacy-refresh-token')).toEqual({
      refreshToken: 'legacy-refresh-token',
    });
  });

  it('reads the Cognito username claim from an access token', () => {
    expect(usernameFromAccessToken(accessTokenWith({ username: 'eu-west-2_abc' }))).toBe('eu-west-2_abc');
    expect(usernameFromAccessToken('not-a-jwt')).toBeUndefined();
  });
});

describe('Cognito refresh parameters', () => {
  it('sends USERNAME with the refresh token so a confidential client can hash', () => {
    expect(refreshParameters('rt', 'player@example.com')).toMatchObject({
      REFRESH_TOKEN: 'rt',
      USERNAME: 'player@example.com',
    });
  });

  it('adds SECRET_HASH when a client secret is configured', () => {
    const previousSecret = process.env.COGNITO_CLIENT_SECRET;
    const previousClient = process.env.COGNITO_CLIENT_ID;
    process.env.COGNITO_CLIENT_SECRET = 'client-secret';
    process.env.COGNITO_CLIENT_ID = 'client-id';
    try {
      const params = refreshParameters('rt', 'player@example.com');
      const want = createHmac('sha256', 'client-secret').update('player@example.comclient-id').digest('base64');
      expect(params.SECRET_HASH).toBe(want);
    } finally {
      if (previousSecret === undefined) delete process.env.COGNITO_CLIENT_SECRET;
      else process.env.COGNITO_CLIENT_SECRET = previousSecret;
      if (previousClient === undefined) delete process.env.COGNITO_CLIENT_ID;
      else process.env.COGNITO_CLIENT_ID = previousClient;
    }
  });
});

describe('JSON responses', () => {
  it('keeps a Set-Cookie that was queued before the body is written', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('Set-Cookie', 'cmrd_session=abc; Path=/; HttpOnly');
      json(res, 200, { ok: true });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no port');
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      const cookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') ?? ''];
      expect(cookies.some(value => value.includes('cmrd_session=abc'))).toBe(true);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });
});
