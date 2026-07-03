/**
 * Integration: person_conversation_language_check constraint guard [BUG-405]
 *
 * Verifies that the DB-layer CHECK constraint on person.conversation_language
 * is correctly wired to the full 10-language set: en, cs, es, fr, de, it, pt,
 * pl, ja, nb.
 *
 * Background: Migration 0035 created the constraint (then on legacy
 * `profiles.conversation_language`) with only 8 languages. Migration 0061
 * widened it to 10. Dev DBs that push-synced between these two migrations
 * retain the stale 8-language CHECK, causing INSERT failures for any profile
 * with conversation_language IN ('ja','nb'). Migration 0087 idempotently
 * rebuilds the constraint to recover affected DBs.
 *
 * [WI-1128] Legacy `profiles`/`accounts` are dropped by migration 0130. The
 * v2 `person` table (packages/database/src/schema/identity.ts) carries a
 * `person_conversation_language_check` constraint that mirrors the legacy
 * one 1:1 (see the comment at that check's declaration) — this test now
 * targets that live v2 twin instead of the dropped legacy table.
 *
 * This test is a forward-only guard: any future migration that narrows the
 * constraint will fail here before reaching CI.
 *
 * External boundaries: Postgres (real DB via createDatabase). No mocks.
 */

import { sql } from 'drizzle-orm';
import { person, createDatabase } from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { unwrapDbError } from './db-errors';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local before running real integration tests.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Test data constants
// ---------------------------------------------------------------------------

const PREFIX = 'integration-bug405-lang-check';
const TEST_DISPLAY_NAME = `${PREFIX}-person`;

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  const db = createIntegrationDb();
  await db
    .delete(person)
    .where(sql`${person.displayName} = ${TEST_DISPLAY_NAME}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: person_conversation_language_check guard [BUG-405]', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  // -------------------------------------------------------------------------
  // Schema introspection
  // -------------------------------------------------------------------------

  it('pg_constraint lists exactly 10 languages in person_conversation_language_check', async () => {
    const db = createIntegrationDb();

    const rows = await db.execute<{ constraintdef: string }>(
      sql`
        SELECT pg_get_constraintdef(oid) AS constraintdef
        FROM pg_constraint
        WHERE conname = 'person_conversation_language_check'
          AND conrelid = 'person'::regclass
      `,
    );

    expect(rows.rows).toHaveLength(1);

    const def = rows.rows[0]!.constraintdef;

    const EXPECTED_LANGUAGES = [
      'en',
      'cs',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'pl',
      'ja',
      'nb',
    ] as const;

    for (const lang of EXPECTED_LANGUAGES) {
      expect({
        language: lang,
        presentInConstraint: def.includes(`'${lang}'`),
      }).toEqual({
        language: lang,
        presentInConstraint: true,
      });
    }
  });

  // -------------------------------------------------------------------------
  // Positive path: the two languages missing from the stale 8-language list
  // -------------------------------------------------------------------------

  it('INSERT with conversation_language = "ja" succeeds', async () => {
    const db = createIntegrationDb();

    const [inserted] = await db
      .insert(person)
      .values({
        displayName: TEST_DISPLAY_NAME,
        birthDate: '2005-01-01',
        residenceJurisdiction: 'EU',
        conversationLanguage: 'ja',
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted!.conversationLanguage).toBe('ja');

    // Cleanup the inserted row so afterAll cleanup is simpler
    await db.delete(person).where(sql`${person.id} = ${inserted!.id}`);
  });

  it('INSERT with conversation_language = "nb" succeeds', async () => {
    const db = createIntegrationDb();

    const [inserted] = await db
      .insert(person)
      .values({
        displayName: TEST_DISPLAY_NAME,
        birthDate: '2005-01-01',
        residenceJurisdiction: 'EU',
        conversationLanguage: 'nb',
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted!.conversationLanguage).toBe('nb');

    await db.delete(person).where(sql`${person.id} = ${inserted!.id}`);
  });

  // -------------------------------------------------------------------------
  // Negative path: invalid language must be rejected by the CHECK constraint
  // -------------------------------------------------------------------------

  it('INSERT with an invalid conversation_language = "xx" is rejected by the CHECK constraint', async () => {
    const db = createIntegrationDb();

    // We use a raw SQL insert to bypass any Drizzle-level type checking so
    // the CHECK constraint is the only thing standing between us and the row.
    // gen_random_uuid() supplies the PK so the NOT NULL constraint on id is
    // satisfied before the CHECK is evaluated.
    // drizzle >=0.44 wraps the driver error in a DrizzleQueryError whose message
    // is "Failed query: …"; the Postgres "violates check constraint …" text lives
    // on the unwrapped driver error. Unwrap before asserting (same helper the
    // production 23505 handlers use).
    const rejection = await Promise.resolve(
      db.execute(
        sql`
          INSERT INTO person (id, display_name, birth_date, residence_jurisdiction, conversation_language)
          VALUES (
            gen_random_uuid(),
            'Bad Language Test',
            '2005-01-01',
            'EU',
            'xx'
          )
        `,
      ),
    ).then(
      () => {
        throw new Error(
          'expected conversation_language CHECK to reject "xx", but the INSERT succeeded',
        );
      },
      (error: unknown) => error,
    );
    const driverError = unwrapDbError(rejection) as { message?: string };
    expect(driverError.message ?? '').toMatch(/check constraint/i);
  });
});
