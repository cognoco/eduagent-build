/**
 * JWT decode/verify utilities for Cloudflare Workers.
 * Uses the Web Crypto API exclusively — no Node.js-only APIs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JWTHeader {
  alg: string;
  typ?: string;
  kid?: string;
}

export interface JWTPayload {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  email?: string;
  [key: string]: unknown;
}

export interface JWK {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

export interface JWKS {
  keys: JWK[];
}

// ---------------------------------------------------------------------------
// Base64-URL helpers (no Buffer — Workers-safe)
// ---------------------------------------------------------------------------

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecode(base64url: string): string {
  const bytes = base64UrlToUint8Array(base64url);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

export function decodeJWTHeader(token: string): JWTHeader {
  const [headerB64] = token.split('.');
  if (!headerB64) {
    throw new Error('Invalid JWT: missing header segment');
  }
  return JSON.parse(base64UrlDecode(headerB64)) as JWTHeader;
}

export function decodeJWTPayload(token: string): JWTPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments');
  }
  const [, payloadB64] = parts;
  if (!payloadB64) {
    throw new Error('Invalid JWT: missing payload segment');
  }
  return JSON.parse(base64UrlDecode(payloadB64)) as JWTPayload;
}

// ---------------------------------------------------------------------------
// JWKS fetch with in-memory cache (module-scoped, per-isolate)
// ---------------------------------------------------------------------------

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedJWKS {
  keys: JWK[];
  fetchedAt: number;
}

const jwksCacheByUrl = new Map<string, CachedJWKS>();

// [BUG-492] Per-URL in-flight dedup for forced re-fetches triggered by a
// kid-not-found miss. When Clerk rotates signing keys, multiple concurrent
// requests for new-kid tokens would otherwise each fire an independent
// upstream fetch. This map holds a single in-flight Promise per URL so all
// concurrent callers await the same network request.
const jwksRefetchInFlight = new Map<string, Promise<JWKS>>();

export async function fetchJWKS(url: string): Promise<JWKS> {
  const now = Date.now();
  const cached = jwksCacheByUrl.get(url);
  if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return { keys: cached.keys };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as unknown;
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as Record<string, unknown>)['keys'])
  ) {
    // Error message deliberately contains 'JWKS' so auth.ts classifies this as
    // an infra failure (→ 503 + Retry-After) rather than a token error (→ 401).
    // Do NOT cache an invalid response.
    throw new Error(
      'JWKS response missing keys array — upstream returned a malformed 200',
    );
  }
  const jwks = body as JWKS;
  jwksCacheByUrl.set(url, { keys: jwks.keys, fetchedAt: now });
  return jwks;
}

/**
 * Force a network re-fetch of JWKS, bypassing and replacing the cache.
 * Concurrent callers for the same URL await a single in-flight request
 * (deduped via jwksRefetchInFlight).
 */
async function fetchJWKSForced(url: string): Promise<JWKS> {
  const existing = jwksRefetchInFlight.get(url);
  if (existing) {
    return existing;
  }
  const promise = (async (): Promise<JWKS> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as unknown;
    if (
      !body ||
      typeof body !== 'object' ||
      !Array.isArray((body as Record<string, unknown>)['keys'])
    ) {
      throw new Error(
        'JWKS response missing keys array — upstream returned a malformed 200',
      );
    }
    const jwks = body as JWKS;
    jwksCacheByUrl.set(url, { keys: jwks.keys, fetchedAt: Date.now() });
    return jwks;
  })().finally(() => {
    jwksRefetchInFlight.delete(url);
  });
  jwksRefetchInFlight.set(url, promise);
  return promise;
}

/**
 * Looks up the JWK matching `kid` from the given JWKS URL.
 *
 * Industry-standard key-rotation pattern:
 *   1. Check the cached JWKS first.
 *   2. If the kid is absent (Clerk rotated keys since last fetch), force a
 *      single TTL-ignoring re-fetch (deduped across concurrent requests).
 *   3. If kid is still missing after re-fetch, throw — the token is invalid.
 *
 * Only missing-kid triggers a re-fetch. All other verification failures
 * (bad signature, expired token, etc.) propagate immediately without an
 * extra network round-trip.
 *
 * Exported for testing.
 */
export async function lookupJWKByKid(url: string, kid: string): Promise<JWK> {
  const jwks = await fetchJWKS(url);
  const found = jwks.keys.find((k) => k.kid === kid);
  if (found) {
    return found;
  }

  // kid not in cached JWKS — Clerk may have rotated keys. Re-fetch once.
  const refreshed = await fetchJWKSForced(url);
  const foundAfterRefresh = refreshed.keys.find((k) => k.kid === kid);
  if (foundAfterRefresh) {
    return foundAfterRefresh;
  }

  throw new Error(`No matching JWK found for kid: ${kid}`);
}

/**
 * Exported for testing — allows tests to clear the in-memory JWKS cache
 * and any pending re-fetch dedup state.
 */
export function clearJWKSCache(): void {
  jwksCacheByUrl.clear();
  jwksRefetchInFlight.clear();
}

// ---------------------------------------------------------------------------
// Signature verification via Web Crypto
// ---------------------------------------------------------------------------

/**
 * [CR-2026-05-21-095] Algorithm allowlist for JWT signature verification.
 *
 * The JWT header alg is attacker-controlled, so we MUST validate it against
 * an allowlist before importing the key with that alg. The classic JWT
 * vulnerabilities are (a) alg "none" bypassing verification, and (b) alg
 * downgrade from asymmetric (RS*) to symmetric (HS*) which lets an attacker
 * use the public key as the HMAC secret. The allowlist below covers the
 * RS*, ES*, EdDSA families an IdP like Clerk could plausibly migrate to;
 * HS* is intentionally omitted.
 */
const ALG_ALLOWLIST = new Set([
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
]);

interface AlgParams {
  importParams: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  verifyParams: AlgorithmIdentifier | EcdsaParams;
}

function algParamsFor(alg: string): AlgParams {
  switch (alg) {
    case 'RS256':
      return {
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        verifyParams: 'RSASSA-PKCS1-v1_5',
      };
    case 'RS384':
      return {
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
        verifyParams: 'RSASSA-PKCS1-v1_5',
      };
    case 'RS512':
      return {
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
        verifyParams: 'RSASSA-PKCS1-v1_5',
      };
    case 'ES256':
      return {
        importParams: { name: 'ECDSA', namedCurve: 'P-256' },
        verifyParams: { name: 'ECDSA', hash: 'SHA-256' },
      };
    case 'ES384':
      return {
        importParams: { name: 'ECDSA', namedCurve: 'P-384' },
        verifyParams: { name: 'ECDSA', hash: 'SHA-384' },
      };
    case 'ES512':
      return {
        importParams: { name: 'ECDSA', namedCurve: 'P-521' },
        verifyParams: { name: 'ECDSA', hash: 'SHA-512' },
      };
    case 'EdDSA':
      return {
        importParams: { name: 'Ed25519' },
        verifyParams: 'Ed25519',
      };
    default:
      throw new Error(`Unsupported JWT algorithm: ${alg}`);
  }
}

/**
 * Resolve and validate the signing algorithm.
 *
 * Rejects: missing header alg, alg "none", any alg outside the allowlist,
 * and any case where the JWK's bound alg disagrees with the header alg
 * (downgrade signal).
 */
function resolveAlg(headerAlg: string | undefined, jwk: JWK): string {
  if (!headerAlg) {
    throw new Error('Invalid JWT: missing alg in header');
  }
  if (headerAlg === 'none') {
    throw new Error('Invalid JWT: alg "none" is not permitted');
  }
  if (!ALG_ALLOWLIST.has(headerAlg)) {
    throw new Error(`Invalid JWT: alg "${headerAlg}" is not in the allowlist`);
  }
  if (jwk.alg && jwk.alg !== headerAlg) {
    throw new Error(
      `Invalid JWT: header alg "${headerAlg}" does not match JWK alg "${jwk.alg}"`,
    );
  }
  return headerAlg;
}

async function importPublicKey(jwk: JWK, alg: string): Promise<CryptoKey> {
  const { importParams } = algParamsFor(alg);
  return crypto.subtle.importKey(
    'jwk',
    {
      ...(jwk as JsonWebKey),
      alg,
      ext: true,
    } as JsonWebKey,
    importParams,
    false,
    ['verify'],
  );
}

export interface VerifyJWTOptions {
  /** Expected issuer (iss claim). If provided, the token's iss must match exactly. */
  issuer?: string;
  /** Expected audience (aud claim). If provided, the token's aud must include this value. */
  audience?: string;
  /**
   * [CR-2026-05-21-088] Symmetric leeway (seconds) applied to `exp` and `nbf`
   * comparisons against the current clock. exp/nbf are second-precision but
   * client and server clocks routinely disagree by sub-second amounts; without
   * leeway, a freshly-issued token can be rejected as expired during a brief
   * negative skew. Default 5s.
   */
  clockSkewSec?: number;
  /**
   * [CR-2026-05-21-088] Maximum age (seconds) since `iat`. Defense-in-depth
   * against tokens whose `exp` was set to the far future at issue time —
   * without this bound, such tokens would be accepted indefinitely as long as
   * exp hasn't elapsed. Default 86400 (24h), which is conservative for an
   * IdP that rotates session tokens every ~1 min (Clerk). Pass 0 to disable.
   */
  maxAgeSec?: number;
}

const DEFAULT_CLOCK_SKEW_SEC = 5;
const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60; // 24 hours

export async function verifyJWT(
  token: string,
  jwk: JWK,
  options?: VerifyJWTOptions,
): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error(
      'Invalid JWT: missing header, payload, or signature segment',
    );
  }

  // [CR-2026-05-21-095] Resolve the effective signing algorithm from the
  // header, validating against the allowlist (rejects "none" and any non-
  // listed algorithm) and confirming it matches the JWK's bound alg.
  const header = decodeJWTHeader(token);
  const alg = resolveAlg(header.alg, jwk);
  const { verifyParams } = algParamsFor(alg);

  // Import the public key bound to the chosen algorithm
  const cryptoKey = await importPublicKey(jwk, alg);

  // The data that was signed is the raw header.payload (ASCII bytes)
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  const valid = await crypto.subtle.verify(
    verifyParams,
    cryptoKey,
    signature as Uint8Array<ArrayBuffer>,
    data,
  );

  if (!valid) {
    throw new Error('Invalid JWT: signature verification failed');
  }

  const payload = decodeJWTPayload(token);

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000);
  const skew = options?.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC;
  const maxAge = options?.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;

  // [CR-2026-05-21-088] Apply symmetric leeway so sub-second skew between
  // client and server clocks does not reject a just-issued token.
  if (payload.exp !== undefined && payload.exp + skew < now) {
    throw new Error('Invalid JWT: token has expired');
  }

  if (payload.nbf !== undefined && payload.nbf > now + skew) {
    throw new Error('Invalid JWT: token not yet valid');
  }

  // [CR-2026-05-21-088] Defense-in-depth against far-future exp: reject tokens
  // older than maxAge regardless of exp. Without this, an IdP misconfiguration
  // (or compromised signing key + crafted exp=year-2099 token) would let a
  // token live forever. Skipping when maxAge is 0 lets callers opt out.
  // An `iat`-absent token can't be aged-out, so when maxAge is enforced we
  // reject it rather than silently bypass the guard.
  if (maxAge > 0) {
    if (payload.iat === undefined) {
      throw new Error('Invalid JWT: missing iat claim required for maxAge');
    }
    if (payload.iat + maxAge < now) {
      throw new Error('Invalid JWT: token exceeds maximum age');
    }
  }

  // Validate issuer claim
  if (options?.issuer) {
    if (payload.iss !== options.issuer) {
      throw new Error(
        `Invalid JWT: issuer mismatch (expected ${options.issuer}, got ${
          payload.iss ?? 'none'
        })`,
      );
    }
  }

  // Validate audience claim whenever audience enforcement is configured.
  if (options?.audience) {
    if (payload.aud === undefined) {
      throw new Error(
        `Invalid JWT: missing audience claim (expected ${options.audience})`,
      );
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(options.audience)) {
      throw new Error(
        `Invalid JWT: audience mismatch (expected ${options.audience})`,
      );
    }
  }

  return payload;
}
