// ---------------------------------------------------------------------------
// profiles.ts — schema shape tests (BUG-224)
//
// pendingNotices is keyed on ownerProfileId (not profileId). The new scoped
// helper in repository.ts relies on this exact column name; if a future
// schema change renames it, the helper would silently fail at runtime.
// These tests pin the column shape so the rename breaks compilation here
// before reaching the repository call sites.
// ---------------------------------------------------------------------------

import { pendingNotices, profiles, accounts } from './profiles.js';

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
});

// [WI-569] The T1 organizations/memberships shape tests were removed with the
// T1 table definitions (MMT-ADR-0012 baseline reset). The singular
// organization/membership replacements get schema + tests in WI-570.
