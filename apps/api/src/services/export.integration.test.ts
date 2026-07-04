// ---------------------------------------------------------------------------
// [WI-805] generateExport learning-only billing skip — the load-bearing safety
// property behind the legacy `subscriptions` DROP (0119).
//
// The v2 export twin (export-v2.ts) reuses this legacy generateExport for the
// learning-data half via `{ learningOnlyProfileIds }`, then overrides the
// billing sections from the v2 `subscription` chain. For that to survive the
// 0119 drop, the legacy path MUST NOT read the legacy `subscriptions` table
// when called in learning-only mode — otherwise it 500s post-drop
// (`relation "subscriptions" does not exist`).
//
// This is the CI-reproducible regression: it runs on the standard (PRE-repoint,
// committed-migration) integration lane, where the legacy `subscriptions` table
// still EXISTS and can be seeded into. The post-drop 500 itself is not
// reproducible here (the table is present); the guarantee we pin is the one
// that PREVENTS it — learning-only mode never issues the read.
//
// Red-green-revert: in export.ts, revert the `learningOnly ? [] : …` guard on
// the `subscriptionRows` query back to the unconditional read → the
// learning-only assertion below goes RED (the seeded subscription leaks into
// the export). Restore → GREEN.
//
// No internal jest.mock (GC1/GC6): real rows seeded into the real legacy tables.
// ---------------------------------------------------------------------------

import { resolve } from 'path';
import { eq, sql } from 'drizzle-orm';
import {
  createDatabase,
  generateUUIDv7,
  organization,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { generateExport } from './export';
import { legacyIdentityTableExistsForTest } from '../test-utils/legacy-identity-anchors';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

const RUN_ID = generateUUIDv7();

describeIfDb('generateExport learning-only billing skip (integration)', () => {
  let db: Database;
  let accountId: string;

  beforeAll(async () => {
    db = createDatabase(process.env.DATABASE_URL!);

    // [WI-1128] Legacy `accounts` is dropped post-M-DROP; the retained legacy
    // `subscriptions.accountId` FK is repointed onto `organization` by
    // M-REPOINT, so seed the v2 `organization` row as the FK anchor instead.
    const [org] = await db
      .insert(organization)
      .values({ name: `wi805-export-org-${RUN_ID}` })
      .returning({ id: organization.id });
    accountId = org!.id;

    // A legacy subscription the export WOULD surface on the normal path.
    // Gated: post-drop there is no legacy row to leak, so the assertion below
    // holds trivially instead of hard-failing on a dropped table.
    // [WI-1139] Legacy `subscriptions` Drizzle def removed — raw SQL insert,
    // same conditional seed as before.
    if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
      await db.execute(
        sql`INSERT INTO subscriptions (id, account_id) VALUES (${generateUUIDv7()}, ${accountId})`,
      );
    }
  });

  afterAll(async () => {
    // subscriptions cascades on organization delete, but be explicit + FK-safe.
    // [WI-1139] Legacy `subscriptions` Drizzle def removed — raw SQL delete.
    if (await legacyIdentityTableExistsForTest(db, 'subscriptions')) {
      await db.execute(
        sql`DELETE FROM subscriptions WHERE account_id = ${accountId}`,
      );
    }
    await db.delete(organization).where(eq(organization.id, accountId));
  });

  // [WI-1128] The former 'surfaces the legacy subscription on the normal
  // (flag-off) path' test exercised generateExport's non-learningOnly branch,
  // which is dead — its only caller (identity-v2/export-v2.ts) always passes
  // learningOnlyProfileIds. That branch fails on the 0129 repoint and is
  // retired here; preserved at tag retired/wi-1128-subcore-export. The
  // load-bearing learning-only guarantee below is the coverage that matters.
  it('does NOT read the legacy subscriptions table in learning-only mode', async () => {
    // The v2 twin's call shape. Post-0119-drop this same call must not 500;
    // the guarantee that makes that safe is that it issues no `subscriptions`
    // read at all — proven here by the seeded subscription NOT leaking through.
    const result = await generateExport(db, accountId, {
      learningOnlyProfileIds: [],
    });
    expect(result.subscriptions).toHaveLength(0);
    expect(result.quotaPools).toHaveLength(0);
    expect(result.topUpCredits).toHaveLength(0);
  });
});
