// ---------------------------------------------------------------------------
// profiles.ts — schema shape tests (BUG-224)
//
// pendingNotices is keyed on ownerProfileId (not profileId). The new scoped
// helper in repository.ts relies on this exact column name; if a future
// schema change renames it, the helper would silently fail at runtime.
// These tests pin the column shape so the rename breaks compilation here
// before reaching the repository call sites.
// ---------------------------------------------------------------------------

import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  pendingNotices,
  profiles,
  accounts,
  organizations,
  memberships,
} from './profiles.js';

describe('pendingNotices schema (BUG-224)', () => {
  it('exposes ownerProfileId so the scoped helper can inject the filter', () => {
    expect(pendingNotices).toHaveProperty('ownerProfileId');
    // Sibling tables use `profileId`; pendingNotices intentionally does not.
    // If a future migration adds a `profileId` alias we want to know — the
    // scoped helper would silently start using the wrong column.
    expect(pendingNotices).not.toHaveProperty('profileId');
  });

  it('exposes id, type, payloadJson for read paths', () => {
    expect(pendingNotices).toHaveProperty('id');
    expect(pendingNotices).toHaveProperty('type');
    expect(pendingNotices).toHaveProperty('payloadJson');
    expect(pendingNotices).toHaveProperty('seenAt');
  });
});

describe('profiles + accounts schema shape', () => {
  it('profiles.id and accountId are present', () => {
    expect(profiles).toHaveProperty('id');
    expect(profiles).toHaveProperty('accountId');
  });

  // [BUG-223 / P2-MED] accounts has NO profileId column and NO RLS in the
  // committed migrations — see the inspection note in
  // packages/database/src/schema/profiles.ts. This test simply pins the
  // column shape so a future "fix" that adds profileId (which would not
  // make sense — accounts own profiles, not the other way around) fails
  // here loudly instead of breaking the parent-chain joins downstream.
  it('accounts has no profileId column (account → profile is 1→N)', () => {
    expect(accounts).toHaveProperty('id');
    expect(accounts).not.toHaveProperty('profileId');
  });

  // [Identity T1] The credential column lives on the person, nullable + unique.
  it('profiles.clerkUserId is present, nullable, and unique', () => {
    expect(profiles).toHaveProperty('clerkUserId');
    const { columns } = getTableConfig(profiles);
    const clerk = columns.find((c) => c.name === 'clerk_user_id');
    expect(clerk).toBeDefined();
    expect(clerk!.notNull).toBe(false); // null = managed person
    expect(clerk!.isUnique).toBe(true);
  });
});

// [Identity T1] organizations + memberships schema shape.
describe('organizations and memberships schema shape', () => {
  it('organizations exposes the billing/group fields (no identity columns)', () => {
    expect(organizations).toHaveProperty('id');
    expect(organizations).toHaveProperty('name');
    expect(organizations).toHaveProperty('timezone');
    expect(organizations).toHaveProperty('deletionScheduledAt');
    expect(organizations).toHaveProperty('deletionCancelledAt');
    // Identity (clerkUserId/email) moved to the person — it must NOT be on org.
    expect(organizations).not.toHaveProperty('clerkUserId');
    expect(organizations).not.toHaveProperty('email');
    const { columns } = getTableConfig(organizations);
    const name = columns.find((c) => c.name === 'name');
    expect(name!.notNull).toBe(true); // NOT NULL — backfill must always supply
  });

  it('memberships links person → organization with a non-empty role set', () => {
    expect(memberships).toHaveProperty('id');
    expect(memberships).toHaveProperty('personId');
    expect(memberships).toHaveProperty('organizationId');
    expect(memberships).toHaveProperty('roles');
    // Person-scoped, NOT profile_id — this is what keeps rls-coverage from
    // flagging it (RLS is a deliberate T3 follow-up).
    expect(memberships).not.toHaveProperty('profileId');

    const { columns, uniqueConstraints, checks } = getTableConfig(memberships);

    // roles is a membership_role[] (a SET of roles per row).
    const roles = columns.find((c) => c.name === 'roles');
    expect(roles).toBeDefined();
    expect(roles!.notNull).toBe(true);
    expect(roles!.getSQLType()).toBe('membership_role[]');

    // (person_id, organization_id) is unique — one membership per person/org.
    const personOrgUnique = uniqueConstraints.find(
      (u) => u.name === 'memberships_person_org_unique',
    );
    expect(personOrgUnique).toBeDefined();
    expect(personOrgUnique!.columns.map((c) => c.name).sort()).toEqual([
      'organization_id',
      'person_id',
    ]);

    // The non-empty-role-set CHECK uses cardinality(), not array_length().
    const nonEmpty = checks.find(
      (c) => c.name === 'memberships_roles_non_empty',
    );
    expect(nonEmpty).toBeDefined();
  });
});
