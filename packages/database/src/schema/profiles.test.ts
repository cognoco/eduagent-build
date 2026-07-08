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

import { pendingNotices } from './profiles.js';

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

  it('deduplicates retry-created notices by owner, type, and payload', () => {
    const cfg = getTableConfig(pendingNotices);
    const idx = cfg.indexes.find(
      (i) => i.config.name === 'pending_notices_owner_type_payload_uq',
    );

    expect(idx).toBeDefined();
    expect(idx!.config.unique).toBe(true);
    expect(
      (idx!.config.columns as Array<{ name: string }>).map((c) => c.name),
    ).toEqual(['owner_profile_id', 'type', 'payload_json']);
  });
});

// [WI-1139] The legacy `profiles` + `accounts` schema-shape tests were removed
// with the table definitions themselves (accounts/profiles/familyLinks/
// consentStates/subscriptions removal). The v2 replacements (person,
// organization, membership) get their own schema-shape coverage.
//
// [WI-569] The T1 organizations/memberships shape tests were removed with the
// T1 table definitions (MMT-ADR-0012 baseline reset). The singular
// organization/membership replacements get schema + tests in WI-570.
