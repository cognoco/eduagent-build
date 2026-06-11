// ---------------------------------------------------------------------------
// JWT Middleware Tests
// ---------------------------------------------------------------------------

import {
  decodeJWTHeader,
  decodeJWTPayload,
  fetchJWKS,
  clearJWKSCache,
  lookupJWKByKid,
  verifyJWT,
} from './jwt';

// ---------------------------------------------------------------------------
// Real RSA key pair — generated once for the entire test suite.
// Using Web Crypto (available in Node 18+) so signature verification
// exercises the real cryptographic path end-to-end.
// ---------------------------------------------------------------------------

interface TestKeyMaterial {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  /** JWK representation of the public key, ready to pass to verifyJWT */
  publicJwk: JsonWebKey & { kid: string; kty: string };
}

let keyMaterial: TestKeyMaterial;

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable — needed to export as JWK
    ['sign', 'verify'],
  );

  const exported = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

  keyMaterial = {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwk: {
      ...exported,
      kty: exported.kty as string,
      kid: 'test-key-1',
      alg: 'RS256',
    },
  };
});

// ---------------------------------------------------------------------------
// Helper — build a real, properly-signed JWT using the test private key
// ---------------------------------------------------------------------------

function toBase64Url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const base64 = btoa(json);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJWT(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const headerB64 = toBase64Url(header);
  const payloadB64 = toBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const data = new TextEncoder().encode(signingInput);
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyMaterial.privateKey,
    data,
  );

  // Convert ArrayBuffer → base64url
  const bytes = new Uint8Array(signatureBuffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const signatureB64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${signatureB64}`;
}

// Helper — build a fake token with an INVALID (unsigned) signature.
// Used to assert that the implementation rejects tampered tokens.
function buildUnsignedFakeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): string {
  return `${toBase64Url(header)}.${toBase64Url(payload)}.invalidsignature`;
}

// ---------------------------------------------------------------------------
// decodeJWTHeader
// ---------------------------------------------------------------------------

describe('decodeJWTHeader', () => {
  it('decodes a valid JWT header', () => {
    const token = buildUnsignedFakeToken(
      { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
      { sub: 'user-1' },
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
    const token = buildUnsignedFakeToken(
      { alg: 'RS256' },
      { sub: 'user-42', iss: 'https://clerk.dev', exp: 9999999999 },
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
      'expected 3 segments',
    );
  });

  it('throws when token has more than 3 segments', () => {
    expect(() => decodeJWTPayload('a.b.c.d')).toThrow('expected 3 segments');
  });
});

// ---------------------------------------------------------------------------
// fetchJWKS — mock global fetch (Clerk is the external boundary)
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

    expect(globalThis.fetch).toHaveBeenCalledWith(
      JWKS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]!.kid).toBe('key-1');
  });

  it('passes an AbortSignal to fetch for timeout enforcement', async () => {
    await fetchJWKS(JWKS_URL);

    const [, options] = (globalThis.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
  });

  it('throws when fetch is aborted (simulated timeout)', async () => {
    const abortError = new DOMException(
      'The user aborted a request.',
      'AbortError',
    );
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(fetchJWKS(JWKS_URL)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'The user aborted a request.',
    });
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

  // [F-017] Malformed-200 JWKS — shape validation break test.
  // A well-formed-but-malformed-content 200 response (missing keys array) must
  // be classified as an infra failure, NOT a token error.
  // The error message must contain 'JWKS' so auth.ts's isInfraFailure regex
  // (/fetch|JWKS|network|abort/i) classifies it → 503 (not 401/sign-out).
  // The malformed payload must NOT be cached.
  it('[F-017] throws with a JWKS-prefixed message when upstream 200 is missing keys array', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'service unavailable' }), // no keys array
    }) as unknown as typeof fetch;

    const error = await fetchJWKS(JWKS_URL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/JWKS/i);
  });

  it('[F-017] does NOT cache a malformed-200 JWKS response', async () => {
    const malformedResponse = {
      ok: true,
      json: async () => ({ message: 'bad' }),
    };
    const goodResponse = { ok: true, json: async () => MOCK_JWKS };

    let callCount = 0;
    globalThis.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        callCount === 1 ? malformedResponse : goodResponse,
      );
    }) as unknown as typeof fetch;

    // First call returns malformed 200 — should throw
    await expect(fetchJWKS(JWKS_URL)).rejects.toThrow(/JWKS/i);

    // Second call (fresh fetch, cache must NOT have been poisoned) should succeed
    const jwks = await fetchJWKS(JWKS_URL);
    expect(jwks.keys).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// lookupJWKByKid — key-rotation re-fetch (BUG-492)
// When Clerk rotates signing keys, the cached JWKS is stale. A kid-not-found
// miss must trigger exactly one forced re-fetch; if the kid is present in the
// refreshed JWKS the lookup succeeds.  A second miss (kid genuinely absent)
// must throw without further network calls.
// ---------------------------------------------------------------------------

describe('lookupJWKByKid', () => {
  const JWKS_URL = 'https://clerk.dev/.well-known/jwks.json';

  const OLD_KEY = {
    kty: 'RSA',
    kid: 'old-key',
    alg: 'RS256',
    n: 'old-n',
    e: 'AQAB',
  };
  const NEW_KEY = {
    kty: 'RSA',
    kid: 'new-key',
    alg: 'RS256',
    n: 'new-n',
    e: 'AQAB',
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearJWKSCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // [BUG-492] Break test: stale cache contains old-key only; token signed with
  // new-key. First fetchJWKS (cache miss) returns stale set → kid absent →
  // force re-fetch returns updated set with new-key → lookup succeeds.
  it('[BUG-492] re-fetches JWKS when kid is absent from cached keys, then finds the key', async () => {
    // Seed cache with old-key only (simulates pre-rotation state).
    // We prime the cache by making a first fetch return the stale JWKS.
    globalThis.fetch = jest
      .fn()
      // First call (fetchJWKS initial fill): old key only
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY] }),
      } as unknown as Response)
      // Second call (forced re-fetch on kid miss): new key present
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY, NEW_KEY] }),
      } as unknown as Response) as unknown as typeof fetch;

    // Warm the cache with old-key.
    await fetchJWKS(JWKS_URL);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Now look up new-key — should trigger one re-fetch and succeed.
    const jwk = await lookupJWKByKid(JWKS_URL, 'new-key');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(jwk.kid).toBe('new-key');
  });

  it('[BUG-492] returns cached key immediately when kid is already present (no extra fetch)', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [OLD_KEY] }),
    } as unknown as Response) as unknown as typeof fetch;

    await fetchJWKS(JWKS_URL); // warm cache
    const jwk = await lookupJWKByKid(JWKS_URL, 'old-key');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no extra fetch
    expect(jwk.kid).toBe('old-key');
  });

  it('[BUG-492] throws when kid is absent even after re-fetch (token is genuinely invalid)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY] }),
      } as unknown as Response) as unknown as typeof fetch;

    await fetchJWKS(JWKS_URL); // warm cache with old-key
    await expect(lookupJWKByKid(JWKS_URL, 'ghost-key')).rejects.toThrow(
      'No matching JWK found for kid: ghost-key',
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // one normal + one forced
  });

  it('[BUG-492] concurrent lookups for same missing kid share one re-fetch (dedup)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY] }),
      } as unknown as Response)
      // Only ONE additional fetch should fire for N concurrent lookups
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY, NEW_KEY] }),
      } as unknown as Response) as unknown as typeof fetch;

    await fetchJWKS(JWKS_URL); // warm cache (1 fetch used)

    // Fire 3 concurrent lookups for the missing kid.
    const results = await Promise.all([
      lookupJWKByKid(JWKS_URL, 'new-key'),
      lookupJWKByKid(JWKS_URL, 'new-key'),
      lookupJWKByKid(JWKS_URL, 'new-key'),
    ]);

    // Total fetch calls: 1 (warm) + 1 (single forced re-fetch) = 2.
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    for (const jwk of results) {
      expect(jwk.kid).toBe('new-key');
    }
  });

  // [F-017] Forced-refresh path (fetchJWKSForced, module-private — driven
  // through lookupJWKByKid's kid-miss re-fetch). This is the path that runs
  // precisely when token verification already failed once, so a malformed 200
  // here must ALSO throw a JWKS-classified error and must NOT poison the
  // cache with the malformed payload.
  it('[F-017] forced re-fetch throws JWKS-classified error on malformed 200 and does not poison the cache', async () => {
    globalThis.fetch = jest
      .fn()
      // First call (fetchJWKS warm): valid JWKS, but without the target kid.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [OLD_KEY] }),
      } as unknown as Response)
      // Second call (forced re-fetch on kid miss): malformed 200, no keys.
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'service unavailable' }),
      } as unknown as Response) as unknown as typeof fetch;

    await fetchJWKS(JWKS_URL); // warm cache with the valid old-key set

    // kid miss → forced re-fetch hits the malformed 200 → JWKS-classified throw
    const error = await lookupJWKByKid(JWKS_URL, 'new-key').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/JWKS/i);

    // Cache must still hold the VALID first payload (not the malformed one):
    // a subsequent fetchJWKS serves from cache with no extra network call.
    const cached = await fetchJWKS(JWKS_URL);
    expect(cached.keys).toEqual([OLD_KEY]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// verifyJWT — real Web Crypto signing and verification
// No mocks of internal crypto — the implementation exercises the full path.
// ---------------------------------------------------------------------------

describe('verifyJWT', () => {
  it('throws on token with wrong number of segments', async () => {
    await expect(verifyJWT('only.two', keyMaterial.publicJwk)).rejects.toThrow(
      'expected 3 segments',
    );
  });

  it('verifies a valid, correctly-signed token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk);

    expect(payload.sub).toBe('user-1');
    expect(payload.iss).toBe('https://clerk.dev');
  });

  it('rejects a token with a tampered signature', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      },
    );

    // Replace the real signature with garbage
    const [header, payload] = validToken.split('.');
    const tamperedToken = `${header}.${payload}.dGFtcGVyZWQ`;

    await expect(
      verifyJWT(tamperedToken, keyMaterial.publicJwk),
    ).rejects.toThrow('signature verification failed');
  });

  it('rejects a token where the payload was modified after signing', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const originalToken = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      },
    );

    // Swap in a different payload (different sub) — signature no longer matches
    const [header, , sig] = originalToken.split('.');
    const maliciousPayload = toBase64Url({
      sub: 'admin-user',
      iss: 'https://clerk.dev',
      exp,
    });
    const tamperedToken = `${header}.${maliciousPayload}.${sig}`;

    await expect(
      verifyJWT(tamperedToken, keyMaterial.publicJwk),
    ).rejects.toThrow('signature verification failed');
  });

  it('rejects an expired token', async () => {
    // Beyond the 5s default skew so the leeway doesn't accept it.
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://clerk.dev', exp: pastExp },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      'token has expired',
    );
  });

  // [CR-2026-05-21-088] sub-second clock skew between issuer and verifier used
  // to reject just-issued tokens. The ±5s default leeway must absorb this.
  it('[CR-2026-05-21-088] accepts a token whose exp is 1s in the past (within default skew)', async () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk);
    expect(payload.sub).toBe('user-1');
  });

  // [CR-2026-05-21-088] Defense-in-depth against far-future exp values.
  // A token issued 25h ago with exp=year-2099 must be rejected on iat age
  // regardless of how far in the future exp is.
  it('[CR-2026-05-21-088] rejects a token with stale iat even if exp is far in the future', async () => {
    const now = Math.floor(Date.now() / 1000);
    const staleIat = now - 25 * 60 * 60; // 25h ago
    const farFutureExp = now + 365 * 24 * 60 * 60; // 1y from now
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: staleIat,
        exp: farFutureExp,
      },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      'token exceeds maximum age',
    );
  });

  // [BREAK] iat-absent tokens used to silently bypass the max-age guard
  // because the check was conditioned on `payload.iat !== undefined`. An
  // attacker who could mint a token without iat would defeat the defense-
  // in-depth backstop. Maintainers: this test guards the "fail closed when
  // iat is missing AND maxAge is enforced" rule. Revert the iat-required
  // branch in jwt.ts to confirm this test fails.
  it('[BREAK] rejects an iat-absent token when maxAgeSec is enforced', async () => {
    const now = Math.floor(Date.now() / 1000);
    const farFutureExp = now + 365 * 24 * 60 * 60;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        exp: farFutureExp,
        // intentionally NO iat
      },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      /missing iat claim required for maxAge/,
    );
  });

  // Counter-test: the iat-required rule must NOT apply when the caller
  // explicitly opts out of max-age. An iat-absent token with maxAgeSec=0
  // is acceptable.
  it('accepts an iat-absent token when maxAgeSec is disabled', async () => {
    const now = Math.floor(Date.now() / 1000);
    const farFutureExp = now + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        exp: farFutureExp,
      },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk, {
      maxAgeSec: 0,
    });
    expect(payload.sub).toBe('user-1');
  });

  // [CR-2026-05-21-088] Callers can opt out of the iat max-age check by
  // passing maxAgeSec: 0 — needed for non-Clerk integrations with long-lived
  // tokens (none today, but the option must exist).
  it('[CR-2026-05-21-088] accepts a stale-iat token when maxAgeSec is disabled', async () => {
    const now = Math.floor(Date.now() / 1000);
    const staleIat = now - 25 * 60 * 60;
    const farFutureExp = now + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: staleIat,
        exp: farFutureExp,
      },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk, {
      maxAgeSec: 0,
    });
    expect(payload.sub).toBe('user-1');
  });

  it('rejects tokens missing aud when audience validation is configured', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      },
    );

    await expect(
      verifyJWT(token, keyMaterial.publicJwk, { audience: 'eduagent-api' }),
    ).rejects.toThrow('missing audience claim');
  });

  it('accepts tokens whose aud matches the configured audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        aud: ['eduagent-web', 'eduagent-api'],
        iat: now,
        exp,
      },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk, {
      audience: 'eduagent-api',
    });

    expect(payload).toMatchObject({
      sub: 'user-1',
      aud: ['eduagent-web', 'eduagent-api'],
    });
  });

  it('rejects tokens with a wrong audience', async () => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        aud: ['eduagent-web'],
        iat: now,
        exp,
      },
    );

    await expect(
      verifyJWT(token, keyMaterial.publicJwk, { audience: 'eduagent-api' }),
    ).rejects.toThrow('audience mismatch');
  });

  it('rejects tokens with a wrong issuer', async () => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://evil.com', iat: now, exp },
    );

    await expect(
      verifyJWT(token, keyMaterial.publicJwk, {
        issuer: 'https://clerk.dev',
      }),
    ).rejects.toThrow('issuer mismatch');
  });

  it('rejects a token signed with a different (wrong) private key', async () => {
    // Generate a separate key pair — the public key won't match
    const wrongKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const exp = Math.floor(Date.now() / 1000) + 3600;
    const signingInput =
      toBase64Url({ alg: 'RS256', kid: 'test-key-1' }) +
      '.' +
      toBase64Url({
        sub: 'user-1',
        iss: 'https://clerk.dev',
        iat: Math.floor(Date.now() / 1000),
        exp,
      });

    const data = new TextEncoder().encode(signingInput);
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      wrongKeyPair.privateKey, // signed with WRONG key
      data,
    );

    const bytes = new Uint8Array(signatureBuffer);
    let binary = '';
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    const signatureB64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const tokenSignedWithWrongKey = `${signingInput}.${signatureB64}`;

    // Verify with the test suite's public key — must fail
    await expect(
      verifyJWT(tokenSignedWithWrongKey, keyMaterial.publicJwk),
    ).rejects.toThrow('signature verification failed');
  });
});

// ---------------------------------------------------------------------------
// [CR-2026-05-21-095] algorithm allowlist — break tests for alg confusion
// ---------------------------------------------------------------------------
//
// These are the negative-path / "break" tests that prove the allowlist guard
// in resolveAlg() actually rejects the algorithms the bug report flagged:
//
//   - alg "none" must be rejected (classic JWT-none bypass).
//   - alg HS256/HS384/HS512 must be rejected (downgrade from asymmetric to
//     symmetric where the RSA public key would be used as the HMAC secret).
//   - The header alg must match the JWK alg — otherwise an attacker could
//     present a header claiming RS256 for a key the IdP marked RS384, and the
//     legacy hardcoded RS256 verifier would silently downcast the hash.
//
// Removing the resolveAlg() guard or restoring the old hardcoded
// `RSASSA-PKCS1-v1_5 / SHA-256` import path makes the first two assertions
// pass (verification falls through), proving these tests are load-bearing.
// ---------------------------------------------------------------------------

describe('verifyJWT algorithm allowlist (CR-2026-05-21-095)', () => {
  it('rejects alg "none" without attempting signature verification', async () => {
    // alg=none — the classic JWT-none attack. Real attackers sometimes still
    // append a junk signature segment so 3-segment parsers don't trip; the
    // allowlist must reject the header alg even when a (meaningless)
    // signature is present.
    const token = buildUnsignedFakeToken(
      { alg: 'none', kid: 'test-key-1' },
      { sub: 'attacker', iat: Math.floor(Date.now() / 1000) },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      /alg "none" is not permitted/,
    );
  });

  it.each(['HS256', 'HS384', 'HS512'])(
    'rejects symmetric alg "%s" (alg-downgrade defence)',
    async (alg) => {
      // Attacker-controlled header claims HMAC. With the old hardcoded
      // verifier (or no allowlist), the RSA public-key bytes would be used as
      // the HMAC secret — and an attacker who can read the public key can
      // forge tokens. The allowlist must reject every HS* before importKey is
      // called.
      const token = buildUnsignedFakeToken(
        { alg, kid: 'test-key-1' },
        { sub: 'attacker', iat: Math.floor(Date.now() / 1000) },
      );

      await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
        new RegExp(`alg "${alg}" is not in the allowlist`),
      );
    },
  );

  it('rejects header alg that disagrees with the JWK alg (downgrade signal)', async () => {
    // JWK is bound to RS256, but header claims RS384. With the old hardcoded
    // RS256 verifier this would silently downcast SHA-384 → SHA-256, breaking
    // the contract the IdP advertised when it published this key. The
    // resolveAlg() guard rejects the mismatch up front.
    const token = buildUnsignedFakeToken(
      { alg: 'RS384', kid: 'test-key-1' },
      { sub: 'user-1', iat: Math.floor(Date.now() / 1000) },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      /header alg "RS384" does not match JWK alg "RS256"/,
    );
  });

  it('rejects header alg missing entirely', async () => {
    const token = buildUnsignedFakeToken(
      { kid: 'test-key-1' },
      { sub: 'user-1', iat: Math.floor(Date.now() / 1000) },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      /missing alg in header/,
    );
  });

  it('rejects alg outside the allowlist (e.g. RS1, ES1, made-up)', async () => {
    const token = buildUnsignedFakeToken(
      { alg: 'RS1', kid: 'test-key-1' },
      { sub: 'user-1', iat: Math.floor(Date.now() / 1000) },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      /alg "RS1" is not in the allowlist/,
    );
  });

  it('accepts RS384 when the JWK is also bound to RS384 (positive path for non-RS256)', async () => {
    // Generate a real RS384 key pair, export it as JWK with alg=RS384, and
    // sign a token whose header.alg=RS384. The allowlist must permit this
    // and verifyJWT must succeed — proves the fix is not just "reject
    // everything that isn't RS256".
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-384',
      },
      true,
      ['sign', 'verify'],
    );

    const exported = (await crypto.subtle.exportKey(
      'jwk',
      keyPair.publicKey,
    )) as JsonWebKey;
    const publicJwk = {
      ...exported,
      kty: exported.kty as string,
      kid: 'test-rs384-key',
      alg: 'RS384',
    };

    const headerB64 = toBase64Url({ alg: 'RS384', kid: 'test-rs384-key' });
    const payloadB64 = toBase64Url({
      sub: 'user-rs384',
      iss: 'https://clerk.dev',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const signingInput = `${headerB64}.${payloadB64}`;
    const data = new TextEncoder().encode(signingInput);
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      keyPair.privateKey,
      data,
    );
    const bytes = new Uint8Array(signatureBuffer);
    let binary = '';
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    const signatureB64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const token = `${signingInput}.${signatureB64}`;

    const payload = await verifyJWT(token, publicJwk);
    expect(payload.sub).toBe('user-rs384');
  });
});
