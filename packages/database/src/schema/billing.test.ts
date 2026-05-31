// ---------------------------------------------------------------------------
// billing.ts — schema shape tests
//
// [Identity T1] subscriptions gains a nullable `organizationId` FK alongside
// the existing `accountId`. The backfill sets it = accountId (org.id reuses
// account.id); it becomes the billing key in T4 when accountId is dropped. In
// T1 it MUST be nullable — making it NOT NULL would break every existing
// account-keyed insert path before the billing rewire (T4) exists.
// ---------------------------------------------------------------------------

import { getTableConfig } from 'drizzle-orm/pg-core';
import { subscriptions } from './billing.js';
import { organizations } from './profiles.js';

describe('subscriptions has nullable organizationId', () => {
  it('exposes organizationId alongside the legacy accountId', () => {
    expect(subscriptions).toHaveProperty('organizationId');
    expect(subscriptions).toHaveProperty('accountId');
  });

  it('organizationId is nullable in T1 (accountId stays the key until T4)', () => {
    const { columns } = getTableConfig(subscriptions);
    const orgId = columns.find((c) => c.name === 'organization_id');
    expect(orgId).toBeDefined();
    expect(orgId!.notNull).toBe(false);
  });

  it('organizationId has an FK to organizations', () => {
    const { foreignKeys } = getTableConfig(subscriptions);
    const orgFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === 'organization_id'),
    );
    expect(orgFk).toBeDefined();
    // Pin the FK target: a bare toBeDefined() passes even if it points at the
    // wrong table. Assert it resolves to organizations.id specifically.
    expect(orgFk!.reference().foreignTable).toBe(organizations);
    expect(orgFk!.reference().foreignColumns.map((c) => c.name)).toEqual([
      'id',
    ]);
  });
});
