import * as fs from 'node:fs';
import * as path from 'node:path';

const { PROTECTED_REUSABLE_EMAILS, classifyClerkTestUserForCleanup } =
  require('./clean-clerk-test-users-lib') as {
    PROTECTED_REUSABLE_EMAILS: Set<string>;
    classifyClerkTestUserForCleanup: (
      user: {
        id: string;
        email: string;
        externalId: string | null;
        createdAt: string | null;
      },
      options: { nowMs: number; olderThanHours: number },
    ) => { eligible: boolean; reason: string };
  };

describe('[WI-1771] clean-clerk-test-users classification', () => {
  const now = Date.parse('2026-07-10T12:00:00Z');

  it('protects every native seed slot declared by the seed API', () => {
    const routeSource = fs.readFileSync(
      path.join(__dirname, '../apps/api/src/routes/test-seed.ts'),
      'utf8',
    );
    const slotDeclaration = routeSource.match(
      /const NATIVE_SEED_SLOTS = \[([\s\S]*?)\] as const;/,
    );
    expect(slotDeclaration).not.toBeNull();

    const slots = [...slotDeclaration![1].matchAll(/'([^']+)'/g)].map(
      ([, slot]) => slot,
    );
    expect(slots).not.toHaveLength(0);

    for (const slot of slots) {
      expect(PROTECTED_REUSABLE_EMAILS).toContain(
        `test-e2e-${slot}+clerk_test@example.com`,
      );
    }
  });

  it('deletes only seed-tagged users in owned stale namespaces', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_seed',
        email: 'pw-1234-journey@example.com',
        externalId: 'clerk_seed_abc',
        createdAt: '2026-07-08T11:00:00Z',
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('stale-owned-seed-user');
  });

  it('preserves protected reusable native identities even when seed-tagged', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_native_01',
        email: 'test-e2e-native-01+clerk_test@example.com',
        externalId: 'clerk_seed_native',
        createdAt: '2026-07-01T00:00:00Z',
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('protected-reusable-identity');
  });

  it('preserves non-seed users even when their email looks like test data', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_real',
        email: 'pw-1234-real@example.com',
        externalId: null,
        createdAt: '2026-07-01T00:00:00Z',
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('not-seed-managed');
  });

  it('preserves stale seed users outside owned cleanup namespaces', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_unowned',
        email: 'external-test-user@example.com',
        externalId: 'clerk_seed_unowned',
        createdAt: '2026-07-01T00:00:00Z',
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('not-owned-stale-namespace');
  });

  it('preserves fresh seed users until the stale threshold elapses', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_fresh',
        email: 'pw-1234-fresh@example.com',
        externalId: 'clerk_seed_fresh',
        createdAt: '2026-07-10T00:30:00Z',
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('not-stale-yet');
  });

  it('preserves owned seed users when Clerk does not provide a usable creation time', () => {
    const decision = classifyClerkTestUserForCleanup(
      {
        id: 'user_unknown_age',
        email: 'pw-1234-unknown-age@example.com',
        externalId: 'clerk_seed_unknown',
        createdAt: null,
      },
      { nowMs: now, olderThanHours: 24 },
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('unknown-age');
  });
});
