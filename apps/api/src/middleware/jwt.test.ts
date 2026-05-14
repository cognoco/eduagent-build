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
      { sub: 'user-1', iss: 'https://clerk.dev', exp },
    );

    const payload = await verifyJWT(token, keyMaterial.publicJwk);

    expect(payload.sub).toBe('user-1');
    expect(payload.iss).toBe('https://clerk.dev');
  });

  it('rejects a token with a tampered signature', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://clerk.dev', exp },
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
      { sub: 'user-1', iss: 'https://clerk.dev', exp },
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
    const pastExp = Math.floor(Date.now() / 1000) - 1; // already expired
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://clerk.dev', exp: pastExp },
    );

    await expect(verifyJWT(token, keyMaterial.publicJwk)).rejects.toThrow(
      'token has expired',
    );
  });

  it('rejects tokens missing aud when audience validation is configured', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://clerk.dev', exp },
    );

    await expect(
      verifyJWT(token, keyMaterial.publicJwk, { audience: 'eduagent-api' }),
    ).rejects.toThrow('missing audience claim');
  });

  it('accepts tokens whose aud matches the configured audience', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        aud: ['eduagent-web', 'eduagent-api'],
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
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        sub: 'user-1',
        iss: 'https://clerk.dev',
        aud: ['eduagent-web'],
        exp,
      },
    );

    await expect(
      verifyJWT(token, keyMaterial.publicJwk, { audience: 'eduagent-api' }),
    ).rejects.toThrow('audience mismatch');
  });

  it('rejects tokens with a wrong issuer', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await signJWT(
      { alg: 'RS256', kid: 'test-key-1' },
      { sub: 'user-1', iss: 'https://evil.com', exp },
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
      toBase64Url({ sub: 'user-1', iss: 'https://clerk.dev', exp });

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
