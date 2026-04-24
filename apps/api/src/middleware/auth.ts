import { createMiddleware } from 'hono/factory';
import { ERROR_CODES } from '@eduagent/schemas';
import { decodeJWTHeader, fetchJWKS, verifyJWT } from './jwt';
import type { JWK } from './jwt';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  email?: string;
}

export type AuthEnv = {
  Bindings: {
    CLERK_JWKS_URL?: string;
    CLERK_AUDIENCE?: string;
  };
  Variables: {
    user: AuthUser;
  };
};

// ---------------------------------------------------------------------------
// Public routes that skip auth
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = [
  '/v1/health',
  '/v1/inngest',
  '/v1/auth/',
  '/v1/stripe/',
  '/v1/revenuecat/webhook',
  '/v1/consent/respond',
  '/v1/consent-page',
  '/v1/__test/',
  // Stripe post-checkout landing pages [UX-DE-M10] — must be reachable by
  // anyone holding the redirect URL, including users who let their session
  // lapse during checkout. Body contains only static HTML + deep links.
  '/v1/billing/success',
  '/v1/billing/cancel',
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

// ---------------------------------------------------------------------------
// Clerk JWT verification helper
// ---------------------------------------------------------------------------

/**
 * Derives the expected Clerk issuer URL from the JWKS URL.
 * Example: "https://clerk.example.com/.well-known/jwks.json" → "https://clerk.example.com"
 */
function deriveIssuerFromJwksUrl(jwksUrl: string): string {
  return jwksUrl.replace(/\/\.well-known\/jwks\.json$/, '');
}

async function verifyClerkJWT(
  token: string,
  jwksUrl: string | undefined,
  audience: string | undefined
): Promise<{ sub: string; email?: string }> {
  if (!jwksUrl) {
    throw new Error('CLERK_JWKS_URL is not configured');
  }

  // Decode header to find the signing key ID
  const header = decodeJWTHeader(token);
  if (!header.kid) {
    throw new Error('JWT header missing kid');
  }

  // Fetch JWKS and locate the matching key
  const jwks = await fetchJWKS(jwksUrl);
  const jwk: JWK | undefined = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`No matching JWK found for kid: ${header.kid}`);
  }

  // Verify signature and validate claims (issuer + optional audience)
  const issuer = deriveIssuerFromJwksUrl(jwksUrl);
  const payload = await verifyJWT(token, jwk, { issuer, audience });

  return {
    sub: payload.sub,
    email: payload.email as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Hono middleware
// ---------------------------------------------------------------------------

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  if (isPublicPath(c.req.path)) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Missing or invalid authorization header',
      },
      401
    );
  }

  const token = authHeader.slice(7);

  try {
    const result = await verifyClerkJWT(
      token,
      c.env.CLERK_JWKS_URL,
      c.env.CLERK_AUDIENCE
    );
    c.set('user', {
      userId: result.sub,
      email: result.email,
    });
    return next();
  } catch {
    return c.json(
      { code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' },
      401
    );
  }
});
