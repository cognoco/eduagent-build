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

import {
  curriculumBooks,
  curriculumTopics,
  subjects,
  type Database,
} from '@eduagent/database';
import {
  getChildTopicSnapshotForParent,
  undoCloneFromChild,
} from './family-bridge';

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

// ---------------------------------------------------------------------------
// [WI-1060] undoCloneFromChild — atomic topic-delete + ancestor cascade.
//
// Red-green rollback regression: the topic delete and the BUG-863 ancestor
// cascade (book + subject delete) must be ONE transaction. If the cascade
// throws after the topic delete, the topic delete must roll back — otherwise a
// crash mid-undo leaves the orphan book+subject this clone created with the
// topic already gone and no re-trigger to clean up.
// ---------------------------------------------------------------------------

const ADULT_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_TOPIC_ID = '55555555-5555-4555-8555-555555555555';
const CREATED_BOOK_ID = '66666666-6666-4666-8666-666666666666';
const CREATED_SUBJECT_ID = '77777777-7777-4777-8777-777777777777';

/**
 * Identify the Drizzle table by reference equality against the imported table
 * objects (Drizzle tables carry their name on Symbol-keyed props, so string
 * inspection / JSON.stringify is unreliable and circular).
 */
function tableKey(table: unknown): string {
  if (table === curriculumTopics) return 'curriculum_topics';
  if (table === curriculumBooks) return 'curriculum_books';
  if (table === subjects) return 'subjects';
  return 'unknown';
}

interface UndoMockOptions {
  failOnBookDelete?: boolean;
}

function makeUndoDb(opts: UndoMockOptions = {}): {
  db: Database;
  committed: string[];
} {
  // committedLog records deletes that survived commit; pending holds in-flight
  // deletes during the transaction so a throw can discard (roll back) them.
  const committed: string[] = [];

  // findOwnedCurriculumTopic: db.select(...).from().innerJoin()×3.where().limit()
  const ownedTopicRow = {
    topicId: CREATED_TOPIC_ID,
    topicSource: 'parent_bridge',
    subjectId: CREATED_SUBJECT_ID,
  };
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: async () => [ownedTopicRow],
  };

  function makeDeleteChain(pending: string[]) {
    return (table: unknown) => {
      const key = tableKey(table);
      return {
        where: () => {
          if (key === 'curriculum_books' && opts.failOnBookDelete) {
            // Throw at .returning()/await time, mid-cascade.
            return {
              returning: async () => {
                throw new Error(
                  'Injected failure: delete curriculum_books (cascade)',
                );
              },
              // cascade book delete is awaited directly (no .returning())
              then: (
                resolve: (v: unknown) => void,
                reject: (e: unknown) => void,
              ) =>
                Promise.reject(
                  new Error(
                    'Injected failure: delete curriculum_books (cascade)',
                  ),
                ).then(resolve, reject),
            };
          }
          return {
            returning: async () => {
              pending.push(key);
              return key === 'curriculum_topics'
                ? [{ id: CREATED_TOPIC_ID }]
                : [{ id: 'deleted' }];
            },
            then: (
              resolve: (v: unknown) => void,
              reject: (e: unknown) => void,
            ) => {
              pending.push(key);
              return Promise.resolve(undefined).then(resolve, reject);
            },
          };
        },
      };
    };
  }

  const db = {
    // Top-level (non-transactional) delete commits immediately — this models
    // the PRE-WI-1060 code where the topic delete and cascade ran outside any
    // transaction. With the fix the SUT routes through `transaction` instead,
    // so a top-level delete that reaches `committed` would only happen on a
    // regression (the wrap removed) — that's the red state for the rollback test.
    delete: makeDeleteChain(committed),
    select: () => selectChain,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const pending: string[] = [];
      const tx = { delete: makeDeleteChain(pending) };
      const result = await fn(tx);
      // Commit: pending deletes become durable.
      // On throw, the exception propagates without pushing to committed —
      // pending deletes are discarded (rollback semantics).
      committed.push(...pending);
      return result;
    },
  } as unknown as Database;

  return { db, committed };
}

describe('[WI-1060] undoCloneFromChild transaction atomicity', () => {
  const createdIds = {
    topicId: CREATED_TOPIC_ID,
    bookId: CREATED_BOOK_ID,
    subjectId: CREATED_SUBJECT_ID,
  };

  it('rolls back the topic delete when the ancestor cascade throws (atomic undo)', async () => {
    const { db, committed } = makeUndoDb({ failOnBookDelete: true });

    await expect(
      undoCloneFromChild(db, ADULT_ID, createdIds),
    ).rejects.toThrow(/Injected failure: delete curriculum_books/);

    // The topic delete must NOT have committed — the transaction rolled back.
    expect(committed).not.toContain('curriculum_topics');
    expect(committed).toHaveLength(0);
  });

  it('commits topic + ancestor deletes together on the happy path', async () => {
    const { db, committed } = makeUndoDb({ failOnBookDelete: false });

    const result = await undoCloneFromChild(db, ADULT_ID, createdIds);

    expect(result).toEqual({ deleted: { topic: true } });
    // Topic delete + cascade book + subject deletes all committed atomically.
    expect(committed).toContain('curriculum_topics');
    expect(committed).toContain('curriculum_books');
    expect(committed).toContain('subjects');
  });
});
