const SEED_CLERK_PREFIX = 'clerk_seed_';

const OWNED_STALE_EMAIL_PREFIXES = [
  'pw-',
  'codex-llm-pass-',
  'codex-premium-routing-',
  'maestro-',
  'native-e2e-',
];

const PROTECTED_REUSABLE_EMAILS = new Set([
  'test-e2e+clerk_test@example.com',
  'test-e2e-native-01+clerk_test@example.com',
  'test-e2e-native-02+clerk_test@example.com',
  'test-e2e-native-03+clerk_test@example.com',
  'test-e2e-native-04+clerk_test@example.com',
  'test-e2e-native-05+clerk_test@example.com',
  'test-e2e-native-06+clerk_test@example.com',
  'test-e2e-native-07+clerk_test@example.com',
  'test-e2e-native-08+clerk_test@example.com',
]);

function createdAtMs(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyClerkTestUserForCleanup(user, options = {}) {
  const email = String(user.email ?? '').toLowerCase();
  const externalId = user.externalId ?? null;
  const nowMs = options.nowMs ?? Date.now();
  const olderThanHours = options.olderThanHours ?? 24;
  const staleBeforeMs = nowMs - olderThanHours * 60 * 60 * 1000;

  if (!externalId?.startsWith(SEED_CLERK_PREFIX)) {
    return { eligible: false, reason: 'not-seed-managed' };
  }

  if (PROTECTED_REUSABLE_EMAILS.has(email)) {
    return { eligible: false, reason: 'protected-reusable-identity' };
  }

  const ownedPrefix = OWNED_STALE_EMAIL_PREFIXES.some((prefix) =>
    email.startsWith(prefix),
  );
  if (!ownedPrefix) {
    return { eligible: false, reason: 'not-owned-stale-namespace' };
  }

  const createdAt = createdAtMs(user.createdAt);
  if (createdAt === null) {
    return { eligible: false, reason: 'unknown-age' };
  }

  if (createdAt > staleBeforeMs) {
    return { eligible: false, reason: 'not-stale-yet' };
  }

  return { eligible: true, reason: 'stale-owned-seed-user' };
}

module.exports = {
  SEED_CLERK_PREFIX,
  OWNED_STALE_EMAIL_PREFIXES,
  PROTECTED_REUSABLE_EMAILS,
  classifyClerkTestUserForCleanup,
};
