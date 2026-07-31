#!/usr/bin/env node

const REQUIRED_KEYS = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_JWKS_URL',
];

function decodeKey(key, expectedKind) {
  const match = key.match(/^(sk|pk)_(test|live)_(.+)$/);
  if (!match || match[1] !== expectedKind) return null;

  try {
    const instance = Buffer.from(match[3], 'base64')
      .toString('utf8')
      .replace(/\$$/, '');
    return instance ? { instance, tier: match[2] } : null;
  } catch {
    return null;
  }
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

for (const key of REQUIRED_KEYS) {
  if (!process.env[key]) {
    fail(`${key} is missing`);
    process.exit();
  }
}

const secret = decodeKey(process.env.CLERK_SECRET_KEY, 'sk');
const backendPublishable = decodeKey(process.env.CLERK_PUBLISHABLE_KEY, 'pk');
const mobilePublishable = decodeKey(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  'pk',
);
const jwks = jwksInstance(process.env.CLERK_JWKS_URL);

if (!secret) {
  fail('CLERK_SECRET_KEY has an invalid Clerk key shape');
} else if (!backendPublishable) {
  fail('CLERK_PUBLISHABLE_KEY has an invalid Clerk key shape');
} else if (!mobilePublishable) {
  fail('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY has an invalid Clerk key shape');
} else if (!jwks) {
  fail('CLERK_JWKS_URL must be a valid HTTPS URL');
} else if (
  secret.instance !== backendPublishable.instance ||
  secret.instance !== mobilePublishable.instance ||
  secret.instance !== jwks ||
  secret.tier !== backendPublishable.tier ||
  secret.tier !== mobilePublishable.tier
) {
  fail(
    'CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, and CLERK_JWKS_URL do not target one Clerk instance and tier',
  );
} else {
  process.stdout.write('Clerk key alignment OK\n');
}
