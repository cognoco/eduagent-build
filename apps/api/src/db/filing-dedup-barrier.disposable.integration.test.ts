/**
 * Disposable-Postgres proof for WI-2639's filing dedup barrier.
 *
 * This suite never connects to shared dev, staging, or production. It creates
 * a uniquely named loopback database, applies the committed migration chain,
 * records the exact catalog contract, then proves that a removed barrier is
 * rejected before repeatedly exercising concurrent filing creation.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import {
  createDatabase,
  generateUUIDv7,
  person,
  subjects,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import {
  assertFilingDedupBarrierPresent,
  FILING_DEDUP_BARRIER_INDEXES,
  FilingDedupBarrierMissingError,
} from './filing-dedup-barrier';
import { closePoolAndDropScratchDatabase } from './scratch-database-teardown';
import { resolveFilingResult } from '../services/filing';
import type { FilingLlmOutput } from '@eduagent/schemas';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

jest.setTimeout(120_000);

const REPO_ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'apps/api/drizzle');
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

interface IndexCatalogRow {
  index_name: string;
  index_schema: string;
  table_name: string;
  table_schema: string;
  is_unique: boolean;
  is_valid: boolean;
  key_definitions: string[];
  predicate: string | null;
}

function requireDisposableDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is required for the disposable DB suite.');
  }

  const url = new URL(rawUrl);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing non-disposable database host "${url.hostname}"; this suite runs only against loopback Postgres.`,
    );
  }
  return rawUrl;
}

function hasLoopbackDatabaseUrl(): boolean {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    return false;
  }

  try {
    return LOOPBACK_HOSTS.has(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

function buildScratchUrl(baseUrl: string, databaseName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function normalizeCatalogExpression(expression: string): string {
  return expression.replace(/[\s"()]/g, '');
}

async function loadFilingDedupCatalog(pool: Pool): Promise<IndexCatalogRow[]> {
  const result = await pool.query<IndexCatalogRow>(
    `SELECT
       index_class.relname AS index_name,
       index_namespace.nspname AS index_schema,
       table_class.relname AS table_name,
       table_namespace.nspname AS table_schema,
       index_meta.indisunique AS is_unique,
       index_meta.indisvalid AS is_valid,
       ARRAY(
         SELECT pg_get_indexdef(index_meta.indexrelid, key_position.position, true)
         FROM generate_series(1, index_meta.indnkeyatts) AS key_position(position)
         ORDER BY key_position.position
       ) AS key_definitions,
       pg_get_expr(index_meta.indpred, index_meta.indrelid) AS predicate
     FROM pg_index index_meta
     JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
     JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
     JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
     JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
     WHERE index_class.relname = ANY($1::text[])
     ORDER BY index_class.relname`,
    [FILING_DEDUP_BARRIER_INDEXES.map((index) => index.name)],
  );
  return result.rows;
}

function filingPayload(
  profileId: string,
  shelfName: string,
  topicSuffix: string,
) {
  return {
    profileId,
    filingResponse: {
      shelf: { name: shelfName },
      book: {
        name: `Filing book ${topicSuffix}`,
        emoji: '📚',
        description: 'Disposable filing dedup proof',
      },
      chapter: { name: `Chapter ${topicSuffix}` },
      topic: {
        title: `Topic ${topicSuffix}`,
        description: 'Disposable filing dedup proof',
      },
    } satisfies FilingLlmOutput,
    filedFrom: 'session_filing' as const,
  };
}

const describeLoopbackOnly = hasLoopbackDatabaseUrl()
  ? describe
  : describe.skip;

describeLoopbackOnly(
  'filing dedup barrier on disposable migrated Postgres [WI-2639]',
  () => {
    if (!hasLoopbackDatabaseUrl()) {
      it('requires a loopback DATABASE_URL', () => {
        expect(true).toBe(true);
      });
      return;
    }

    const baseUrl = requireDisposableDatabaseUrl();
    const scratchRunId = randomBytes(4).toString('hex');
    const databaseName = `wi2639_filing_${scratchRunId}`;
    const scratchApplicationName = `wi2639-filing-${scratchRunId}`;
    const scratchUrl = buildScratchUrl(baseUrl, databaseName);

    let adminPool: Pool;
    let scratchPool: Pool;

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: baseUrl });
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);

      scratchPool = new Pool({
        connectionString: scratchUrl,
        application_name: scratchApplicationName,
      });
      await scratchPool.query('CREATE EXTENSION IF NOT EXISTS vector');
      await migrate(drizzle(scratchPool), { migrationsFolder: MIGRATIONS_DIR });
    });

    afterAll(async () => {
      try {
        await closePoolAndDropScratchDatabase({
          adminPool,
          scratchPool,
          databaseName,
          ownedApplicationName: scratchApplicationName,
        });
      } finally {
        await adminPool?.end();
      }
    });

    it('records the migrated catalog contract: public, valid, unique, exact keys and predicate', async () => {
      const catalog = await loadFilingDedupCatalog(scratchPool);
      expect(catalog).toHaveLength(FILING_DEDUP_BARRIER_INDEXES.length);

      for (const expected of FILING_DEDUP_BARRIER_INDEXES) {
        const actual = catalog.find((row) => row.index_name === expected.name);
        expect(actual).toEqual(
          expect.objectContaining({
            index_schema: expected.schema,
            table_schema: expected.schema,
            table_name: expected.table,
            is_unique: true,
            is_valid: true,
          }),
        );
        expect(actual?.key_definitions.map(normalizeCatalogExpression)).toEqual(
          expected.keyDefinitions.map(normalizeCatalogExpression),
        );
        expect(
          actual?.predicate === null
            ? null
            : normalizeCatalogExpression(actual.predicate),
        ).toBe(
          expected.predicate === null
            ? null
            : normalizeCatalogExpression(expected.predicate),
        );
      }

      await expect(
        assertFilingDedupBarrierPresent(createDatabase(scratchUrl)),
      ).resolves.toBeUndefined();
    });

    it('[WI-2639-RGR] fails closed after barrier removal and passes after exact restoration', async () => {
      await scratchPool.query(
        'DROP INDEX "subjects_profile_name_lower_active_uq"',
      );

      await expect(
        assertFilingDedupBarrierPresent(createDatabase(scratchUrl)),
      ).rejects.toBeInstanceOf(FilingDedupBarrierMissingError);

      await scratchPool.query(
        `CREATE UNIQUE INDEX "subjects_profile_name_lower_active_uq"
       ON "subjects" ("profile_id", lower("name"))
       WHERE status = 'active'`,
      );
      await expect(
        assertFilingDedupBarrierPresent(createDatabase(scratchUrl)),
      ).resolves.toBeUndefined();
    });

    it('[WI-2639-RGR] repeats case-insensitive concurrent filing and preserves archived/profile boundaries', async () => {
      const db = createDatabase(scratchUrl);
      const [profileA, profileB] = await db
        .insert(person)
        .values([
          {
            id: generateUUIDv7(),
            displayName: 'Filing dedup profile A',
            birthDate: '2000-01-01',
            residenceJurisdiction: 'EU',
          },
          {
            id: generateUUIDv7(),
            displayName: 'Filing dedup profile B',
            birthDate: '2000-01-01',
            residenceJurisdiction: 'EU',
          },
        ])
        .returning();

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const shelfName = `Concurrent Filing ${iteration}`;
        const [first, second] = await Promise.all([
          resolveFilingResult(
            db,
            filingPayload(profileA!.id, shelfName, `A-${iteration}`),
          ),
          resolveFilingResult(
            db,
            filingPayload(
              profileA!.id,
              shelfName.toLowerCase(),
              `B-${iteration}`,
            ),
          ),
        ]);
        expect(first.shelfId).toBe(second.shelfId);

        const activeRows = await db
          .select()
          .from(subjects)
          .where(
            and(
              eq(subjects.profileId, profileA!.id),
              eq(subjects.status, 'active'),
              sql`lower(${subjects.name}) = lower(${shelfName})`,
            ),
          );
        expect(activeRows).toHaveLength(1);
      }

      const sharedName = 'Profile Boundary Shelf';
      const [profileAResult, profileBResult] = await Promise.all([
        resolveFilingResult(
          db,
          filingPayload(profileA!.id, sharedName, 'profile-A'),
        ),
        resolveFilingResult(
          db,
          filingPayload(profileB!.id, sharedName.toLowerCase(), 'profile-B'),
        ),
      ]);
      expect(profileAResult.shelfId).not.toBe(profileBResult.shelfId);

      const archivedName = 'Archived Filing Shelf';
      const [archived] = await db
        .insert(subjects)
        .values({
          profileId: profileA!.id,
          name: archivedName,
          status: 'archived',
          pedagogyMode: 'socratic',
        })
        .returning();
      const [firstActive, secondActive] = await Promise.all([
        resolveFilingResult(
          db,
          filingPayload(profileA!.id, archivedName, 'archived-A'),
        ),
        resolveFilingResult(
          db,
          filingPayload(profileA!.id, archivedName.toLowerCase(), 'archived-B'),
        ),
      ]);
      expect(firstActive.shelfId).toBe(secondActive.shelfId);
      expect(firstActive.shelfId).not.toBe(archived!.id);

      const activeAfterArchive = await db
        .select()
        .from(subjects)
        .where(
          and(
            eq(subjects.profileId, profileA!.id),
            eq(subjects.status, 'active'),
            sql`lower(${subjects.name}) = lower(${archivedName})`,
          ),
        );
      expect(activeAfterArchive).toHaveLength(1);
    });
  },
);
