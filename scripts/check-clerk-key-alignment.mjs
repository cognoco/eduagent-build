#!/usr/bin/env node

const REQUIRED_KEYS = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_JWKS_URL',
];

function decodeLegacyKey(key, expectedKind) {
  const match = key.match(/^(sk|pk)_(test|live)_(.+)$/);
  if (!match || match[1] !== expectedKind) return null;

  try {
    const payload = match[3];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;

    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const canonicalPayload = Buffer.from(decoded, 'utf8')
      .toString('base64')
      .replace(/=+$/, '');
    if (
      canonicalPayload !== payload.replace(/=+$/, '') ||
      !decoded.endsWith('$')
    ) {
      return null;
    }

    const instance = decoded.slice(0, -1);
    const instanceUrl = new URL(`https://${instance}`);
    if (instanceUrl.host !== instance || instanceUrl.pathname !== '/') {
      return null;
    }

    return { instance, tier: match[2] };
  } catch {
    return null;
  }
}

function parseSecretKey(key) {
  const match = key.match(/^sk_(test|live)_(.+)$/);
  if (!match) return null;

  return {
    legacyInstance: decodeLegacyKey(key, 'sk')?.instance ?? null,
    tier: match[1],
  };
}

function jwksInstance(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
}

function fail(message) {
  process.stderr.write(`Clerk key alignment failed: ${message}\n`);
  process.exitCode = 1;
}

export async function checkClerkKeyAlignment(
  env = process.env,
  fetchImpl = globalThis.fetch,
) {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) {
      return { ok: false, message: `${key} is missing` };
    }
  }

  const secret = parseSecretKey(env.CLERK_SECRET_KEY);
  const backendPublishable = decodeLegacyKey(env.CLERK_PUBLISHABLE_KEY, 'pk');
  const mobilePublishable = decodeLegacyKey(
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    'pk',
  );
  const jwks = jwksInstance(env.CLERK_JWKS_URL);

  if (!secret) {
    return {
      ok: false,
      message: 'CLERK_SECRET_KEY has an invalid Clerk key shape',
    };
  }
  if (!backendPublishable) {
    return {
      ok: false,
      message: 'CLERK_PUBLISHABLE_KEY has an invalid Clerk key shape',
    };
  }
  if (!mobilePublishable) {
    return {
      ok: false,
      message:
        'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY has an invalid Clerk key shape',
    };
  }
  if (!jwks) {
    return {
      ok: false,
      message: 'CLERK_JWKS_URL must be a valid HTTPS URL',
    };
  }
  if (
    backendPublishable.instance !== mobilePublishable.instance ||
    backendPublishable.instance !== jwks ||
    secret.tier !== backendPublishable.tier ||
    secret.tier !== mobilePublishable.tier
  ) {
    return {
      ok: false,
      message:
        'CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, and CLERK_JWKS_URL do not target one Clerk instance and tier',
    };
  }

  if (secret.legacyInstance !== null) {
    return secret.legacyInstance === jwks
      ? { ok: true }
      : {
          ok: false,
          message:
            'CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, and CLERK_JWKS_URL do not target one Clerk instance and tier',
        };
  }

  try {
    const response = await fetchImpl('https://api.clerk.com/v1/domains', {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    });
    if (!response.ok) {
      return {
        ok: false,
        message: 'CLERK_SECRET_KEY was rejected by the Clerk Backend API',
      };
    }
    const body = await response.json();
    const domains = Array.isArray(body) ? body : (body.data ?? []);
    const targetsJwks = domains.some((domain) => {
      try {
        return (
          new URL(domain.frontend_api_url ?? domain.frontendApiUrl).host ===
          jwks
        );
      } catch {
        return false;
      }
    });
    return targetsJwks
      ? { ok: true }
      : {
          ok: false,
          message:
            'CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, and CLERK_JWKS_URL do not target one Clerk instance and tier',
        };
  } catch {
    return {
      ok: false,
      message: 'Clerk Backend API validation was unavailable',
    };
  }
}

const result = await checkClerkKeyAlignment();
if (result.ok) {
  process.stdout.write('Clerk key alignment OK\n');
} else {
  fail(result.message);
}
