// ---------------------------------------------------------------------------
// family-bridge.test.ts — WP-6 wire-up dispatch coverage.
//
// getChildTopicSnapshotForParent gained an `opts.identityV2Enabled` seam: flag-on
// delegates to the v2 guardianship-edge guard + person/subject read
// (getChargeSubjectsForGuardianV2); flag-off keeps the legacy family_links guard
// + profiles join. These unit tests prove the dispatch decision — that flag-off
// hits the legacy familyLinks read and flag-on hits the guardianship read —
// without a DB. The full v2 authorization behavior (incl. the cross-guardian /
// cross-person break tests) is covered in family-bridge-v2.integration.test.ts.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import { getChildTopicSnapshotForParent } from './family-bridge';

const PARENT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const TOPIC_ID = '33333333-3333-4333-8333-333333333333';

/**
 * A Database stub that records which identity read the dispatch reached:
 * `query.familyLinks.findFirst` = the legacy path, `query.guardianship.findFirst`
 * = the v2 path. Both findFirst stubs return undefined (no link/edge), so the
 * snapshot resolves to a denied/empty result and no further query is needed —
 * the assertion is purely "which guard ran".
 */
function makeDb(): {
  db: Database;
  familyLinksFindFirst: jest.Mock;
  guardianshipFindFirst: jest.Mock;
} {
  const familyLinksFindFirst = jest.fn().mockResolvedValue(undefined);
  const guardianshipFindFirst = jest.fn().mockResolvedValue(undefined);
  const db = {
    query: {
      familyLinks: { findFirst: familyLinksFindFirst },
      guardianship: { findFirst: guardianshipFindFirst },
    },
  } as unknown as Database;
  return { db, familyLinksFindFirst, guardianshipFindFirst };
}

describe('getChildTopicSnapshotForParent dispatch (WP-6 v2 seam)', () => {
  it('flag-off reads familyLinks (legacy guard), never guardianship', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } = makeDb();

    // No family link → assertParentAccess throws ForbiddenError before any read.
    await expect(
      getChildTopicSnapshotForParent(db, PARENT_ID, CHILD_ID, TOPIC_ID),
    ).rejects.toThrow();

    expect(familyLinksFindFirst).toHaveBeenCalledTimes(1);
    expect(guardianshipFindFirst).not.toHaveBeenCalled();
  });

  it('flag-on reads guardianship (v2 edge guard), never familyLinks', async () => {
    const { db, familyLinksFindFirst, guardianshipFindFirst } = makeDb();

    // No active edge → validateGuardianChargeRelationshipV2 throws before reads.
    await expect(
      getChildTopicSnapshotForParent(db, PARENT_ID, CHILD_ID, TOPIC_ID, {
        identityV2Enabled: true,
      }),
    ).rejects.toThrow();

    expect(guardianshipFindFirst).toHaveBeenCalledTimes(1);
    expect(familyLinksFindFirst).not.toHaveBeenCalled();
  });
});
