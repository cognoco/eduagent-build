// ---------------------------------------------------------------------------
// snapshots.ts — schema shape tests (BUG-219)
//
// progressSummaries and milestones both have profileId columns but, before
// the scoped-repo helpers were added, every call site had to compose its own
// profileId predicate. The tests below pin the column shape so a schema
// rename (e.g. profileId → ownerProfileId) breaks compilation here instead
// of silently breaking the repository helper's scopedWhere() injection.
// ---------------------------------------------------------------------------

import { progressSummaries, milestones } from './snapshots.js';

describe('progressSummaries schema (BUG-219)', () => {
  it('exposes profileId so createScopedRepository can inject the filter', () => {
    expect(progressSummaries).toHaveProperty('profileId');
  });

  it('exposes id, summary, generatedAt for read paths', () => {
    expect(progressSummaries).toHaveProperty('id');
    expect(progressSummaries).toHaveProperty('summary');
    expect(progressSummaries).toHaveProperty('generatedAt');
  });
});

describe('milestones schema (BUG-219)', () => {
  it('exposes profileId so createScopedRepository can inject the filter', () => {
    expect(milestones).toHaveProperty('profileId');
  });

  it('exposes id for findById lookups', () => {
    expect(milestones).toHaveProperty('id');
  });

  it('exposes milestoneType + threshold (used by milestone uniqueness)', () => {
    expect(milestones).toHaveProperty('milestoneType');
    expect(milestones).toHaveProperty('threshold');
  });
});
