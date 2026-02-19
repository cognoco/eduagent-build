// ---------------------------------------------------------------------------
// JWT Middleware Tests
// ---------------------------------------------------------------------------

import {
  decodeJWTHeader,
  decodeJWTPayload,
  fetchJWKS,
  clearJWKSCache,
  verifyJWT,
} from './jwt';

// ---------------------------------------------------------------------------
// Helpers — build a fake JWT with base64url-encoded segments
// ---------------------------------------------------------------------------

function toBase64Url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const base64 = btoa(json);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildFakeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): string {
  return `${toBase64Url(header)}.${toBase64Url(payload)}.fake-signature`;
}

// ---------------------------------------------------------------------------
// decodeJWTHeader
// ---------------------------------------------------------------------------

describe('decodeJWTHeader', () => {
  it('decodes a valid JWT header', () => {
    const token = buildFakeToken(
      { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
      { sub: 'user-1' }
    );
    const header = decodeJWTHeader(token);

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'key-1' });
  });

  it('throws on empty string', () => {
    expect(() => decodeJWTHeader('')).toThrow('missing header segment');
  });
});

// ---------------------------------------------------------------------------
// decodeJWTPayload
// ---------------------------------------------------------------------------

describe('decodeJWTPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = buildFakeToken(
      { alg: 'RS256' },
      { sub: 'user-42', iss: 'https://clerk.dev', exp: 9999999999 }
    );
    const payload = decodeJWTPayload(token);

    expect(payload).toEqual({
      sub: 'user-42',
      iss: 'https://clerk.dev',
      exp: 9999999999,
    });
  });

  it('throws when token has fewer than 3 segments', () => {
    expect(() => decodeJWTPayload('header.payload')).toThrow(
      'expected 3 segments'
    );
  });

  it('throws when token has more than 3 segments', () => {
    expect(() => decodeJWTPayload('a.b.c.d')).toThrow('expected 3 segments');
  });
});

// ---------------------------------------------------------------------------
// fetchJWKS — mock global fetch
// ---------------------------------------------------------------------------

describe('fetchJWKS', () => {
  const JWKS_URL = 'https://clerk.dev/.well-known/jwks.json';
  const MOCK_JWKS = {
    keys: [{ kty: 'RSA', kid: 'key-1', alg: 'RS256', n: 'abc', e: 'AQAB' }],
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearJWKSCache();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_JWKS,
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches JWKS from the given URL', async () => {
    const jwks = await fetchJWKS(JWKS_URL);

    expect(globalThis.fetch).toHaveBeenCalledWith(JWKS_URL);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe('key-1');
  });

  it('uses cache on second call within TTL', async () => {
    await fetchJWKS(JWKS_URL);
    await fetchJWKS(JWKS_URL);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after clearJWKSCache()', async () => {
    await fetchJWKS(JWKS_URL);
    clearJWKSCache();
    await fetchJWKS(JWKS_URL);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when fetch response is not ok', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchJWKS(JWKS_URL)).rejects.toThrow('Failed to fetch JWKS');
  });
});

// ---------------------------------------------------------------------------
// verifyJWT — limited tests (Web Crypto mocking is complex)
// ---------------------------------------------------------------------------

describe('verifyJWT', () => {
  const MOCK_JWK = {
    kty: 'RSA',
    kid: 'key-1',
    alg: 'RS256',
    n: 'abc',
    e: 'AQAB',
  };

  it('throws on token with wrong number of segments', async () => {
    await expect(verifyJWT('only.two', MOCK_JWK)).rejects.toThrow(
      'expected 3 segments'
    );
  });

  // TODO: Full signature verification tests require Web Crypto API mocking
  // (crypto.subtle.importKey + crypto.subtle.verify). These are best covered
  // in integration tests running on the Cloudflare Workers runtime.
});
