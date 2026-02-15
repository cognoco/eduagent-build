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
  return JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;
}

// ---------------------------------------------------------------------------
// JWKS fetch with in-memory cache (module-scoped, per-isolate)
// ---------------------------------------------------------------------------

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedJWKS {
  keys: JWK[];
  fetchedAt: number;
}

let jwksCache: CachedJWKS | null = null;

export async function fetchJWKS(url: string): Promise<JWKS> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return { keys: jwksCache.keys };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
  }

  const jwks = (await res.json()) as JWKS;
  jwksCache = { keys: jwks.keys, fetchedAt: now };
  return jwks;
}

/**
 * Exported for testing — allows tests to clear the in-memory JWKS cache.
 */
export function clearJWKSCache(): void {
  jwksCache = null;
}

// ---------------------------------------------------------------------------
// Signature verification via Web Crypto
// ---------------------------------------------------------------------------

async function importRSAPublicKey(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      ext: true,
    } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyJWT(token: string, jwk: JWK): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Import the public key
  const cryptoKey = await importRSAPublicKey(jwk);

  // The data that was signed is the raw header.payload (ASCII bytes)
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature as Uint8Array<ArrayBuffer>,
    data
  );

  if (!valid) {
    throw new Error('Invalid JWT: signature verification failed');
  }

  const payload = decodeJWTPayload(token);

  // Validate standard claims
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp !== undefined && payload.exp < now) {
    throw new Error('Invalid JWT: token has expired');
  }

  if (payload.nbf !== undefined && payload.nbf > now) {
    throw new Error('Invalid JWT: token not yet valid');
  }

  return payload;
}
