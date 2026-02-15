import { createMiddleware } from 'hono/factory';
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
  };
  Variables: {
    user: AuthUser;
  };
};

// ---------------------------------------------------------------------------
// Public routes that skip auth
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = ['/v1/health', '/v1/inngest', '/v1/auth/'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

// ---------------------------------------------------------------------------
// Clerk JWT verification helper
// ---------------------------------------------------------------------------

async function verifyClerkJWT(
  token: string,
  jwksUrl: string | undefined
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

  // Verify signature and validate claims
  const payload = await verifyJWT(token, jwk);

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
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
      401
    );
  }

  const token = authHeader.slice(7);

  try {
    const result = await verifyClerkJWT(token, c.env.CLERK_JWKS_URL);
    c.set('user', {
      userId: result.sub,
      email: result.email,
    });
    return next();
  } catch {
    return c.json(
      { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      401
    );
  }
});
