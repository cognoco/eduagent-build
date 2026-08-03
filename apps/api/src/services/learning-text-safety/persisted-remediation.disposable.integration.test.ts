/**
 * [WI-2753 AC-1 / AC-5] Before/after remediation counts on a disposable,
 * migrated Postgres.
 *
 * Never connects to shared dev, staging, or production: it creates a uniquely
 * named loopback database, applies the committed migration chain, seeds a known
 * corpus, and drops the database afterwards.
 *
 * The corpus is seeded rather than read from a live database because the
 * operator ruled (2026-08-01) that the MVP phase carries zero live data — so
 * the evidence AC-1 and AC-5 ask for is "the remediation demonstrably works on a
 * known corpus", not "the live exposure was N rows".
 *
 * THE DISCRIMINATOR IS THE SECOND HALF. A remediation that blanks everything the
 * gate blocks passes "the attribution row was scrubbed" and fails "the
 * educational row was left alone" — which is why both are asserted on the same
 * run, over rows that differ only in their text.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningProfiles,
  learningSessions,
  membership,
  memoryFacts,
  mentorNotices,
  needsDeepeningTopics,
  organization,
  person,
  subjects,
  topicNotes,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { closePoolAndDropScratchDatabase } from '../../db/scratch-database-teardown';
import { normalizeMemoryText } from '../memory/backfill-mapping';
import { normalizeMemoryValue } from '../learner-profile';
import {
  REDACTED_PLACEHOLDER,
  remediatePersistedLearningText,
} from './persisted-remediation-apply';
import { remediateMemoryFacts } from './persisted-remediation-memory';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

jest.setTimeout(180_000);

const REPO_ROOT = resolve(__dirname, '../../../../..');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'apps/api/drizzle');
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** A Spanish diagnostic attribution — the class this item exists to remove. */
const ATTRIBUTION_ES = 'El alumno tiene TEA.';
/** The same claim, hedged. Classified `diagnostic_inference`, equally remediable. */
const ATTRIBUTION_ES_HEDGED = 'El alumno probablemente tiene TEA.';
/** A legitimate educational reference. Blocked as `unclear`; must NOT be touched. */
const EDUCATIONAL = 'This chapter explains what dyslexia is.';
/** Ordinary learning text. Safe outright. */
const BENIGN = 'We read two chapters about volcanoes today.';

function hasLoopbackDatabaseUrl(): boolean {
  const rawUrl = process.env['DATABASE_URL'];
  if (!rawUrl) return false;
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

async function waitForBlockedMemoryFactUpdate(
  adminPool: Pool,
  databaseName: string,
  remediationApplicationName: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await adminPool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = $1
          AND application_name = $2
          AND wait_event_type = 'Lock'
          AND query ILIKE 'update "memory_facts"%'
      ) AS waiting`,
      [databaseName, remediationApplicationName],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  }

  throw new Error('remediation update did not block on the concurrent writer');
}

const describeLoopbackOnly = hasLoopbackDatabaseUrl()
  ? describe
  : describe.skip;

describeLoopbackOnly(
  'persisted learning-text remediation on disposable migrated Postgres [WI-2753]',
  () => {
    if (!hasLoopbackDatabaseUrl()) {
      it('requires a loopback DATABASE_URL', () => {
        expect(true).toBe(true);
      });
      return;
    }

    const baseUrl = process.env['DATABASE_URL'] as string;
    const scratchRunId = randomBytes(4).toString('hex');
    const databaseName = `wi2753_remediation_${scratchRunId}`;
    const scratchApplicationName = `wi2753-remediation-${scratchRunId}`;
    const scratchUrl = buildScratchUrl(baseUrl, databaseName);

    let adminPool: Pool;
    let scratchPool: Pool;
    let db: ReturnType<typeof drizzle>;

    const seeded = {
      attributionNoticeId: '',
      hedgedNoticeId: '',
      educationalNoticeId: '',
      attributionNoteId: '',
      educationalNoteId: '',
      attributionDeepeningId: '',
      artifactNoteId: '',
      attributionFactId: '',
      hedgedFactId: '',
      educationalFactId: '',
      profileId: '',
    };

    beforeAll(async () => {
      adminPool = new Pool({ connectionString: baseUrl });
      await adminPool.query(`CREATE DATABASE "${databaseName}"`);

      scratchPool = new Pool({
        connectionString: scratchUrl,
        application_name: scratchApplicationName,
      });
      await scratchPool.query('CREATE EXTENSION IF NOT EXISTS vector');
      db = drizzle(scratchPool);
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

      // ── the learner, declared Spanish ──────────────────────────────────────
      const [org] = await db
        .insert(organization)
        .values({ name: `WI2753 org ${scratchRunId}`, timezone: 'UTC' })
        .returning({ id: organization.id });

      const [learner] = await db
        .insert(person)
        .values({
          displayName: 'WI-2753 learner',
          birthDate: '2012-01-01',
          residenceJurisdiction: 'ROW',
          // Recorded for realism only. The classification no longer reads this
          // column: it is the learner's mutable CURRENT preference, not the
          // provenance of the text, so the sweep scans every grammar instead.
          conversationLanguage: 'es',
        })
        .returning({ id: person.id });

      await db.insert(membership).values({
        personId: learner!.id,
        organizationId: org!.id,
        roles: ['learner'],
      });

      const profileId = learner!.id;

      const [subject] = await db
        .insert(subjects)
        .values({ profileId, name: `WI2753 subject ${generateUUIDv7()}` })
        .returning({ id: subjects.id });

      const [curriculum] = await db
        .insert(curricula)
        .values({ subjectId: subject!.id })
        .returning({ id: curricula.id });

      const [book] = await db
        .insert(curriculumBooks)
        .values({
          subjectId: subject!.id,
          title: `WI2753 book ${generateUUIDv7()}`,
          sortOrder: 1,
        })
        .returning({ id: curriculumBooks.id });

      const [topic] = await db
        .insert(curriculumTopics)
        .values({
          curriculumId: curriculum!.id,
          bookId: book!.id,
          title: `WI2753 topic ${generateUUIDv7()}`,
          description: 'Remediation corpus topic',
          sortOrder: 1,
          estimatedMinutes: 10,
        })
        .returning({ id: curriculumTopics.id });

      const [session] = await db
        .insert(learningSessions)
        .values({ profileId, subjectId: subject!.id, topicId: topic!.id })
        .returning({ id: learningSessions.id });

      // ── mentor notices: attribution, hedged attribution, educational ───────
      const notices = await db
        .insert(mentorNotices)
        .values([
          {
            profileId,
            subjectId: subject!.id,
            topicId: topic!.id,
            sourceSessionId: session!.id,
            // Distinct evidence ids: a null answer_event_id is unique per source
            // session (mentor_notices_source_session_null_evidence_uq), so three
            // notices from one session must each carry their own.
            answerEventId: generateUUIDv7(),
            concept: ATTRIBUTION_ES,
            correctionHint: ATTRIBUTION_ES,
          },
          {
            profileId,
            subjectId: subject!.id,
            topicId: topic!.id,
            sourceSessionId: session!.id,
            // Distinct evidence ids: a null answer_event_id is unique per source
            // session (mentor_notices_source_session_null_evidence_uq), so three
            // notices from one session must each carry their own.
            answerEventId: generateUUIDv7(),
            concept: ATTRIBUTION_ES_HEDGED,
            correctionHint: BENIGN,
          },
          {
            profileId,
            subjectId: subject!.id,
            topicId: topic!.id,
            sourceSessionId: session!.id,
            // Distinct evidence ids: a null answer_event_id is unique per source
            // session (mentor_notices_source_session_null_evidence_uq), so three
            // notices from one session must each carry their own.
            answerEventId: generateUUIDv7(),
            concept: EDUCATIONAL,
            correctionHint: null,
          },
        ])
        .returning({ id: mentorNotices.id, concept: mentorNotices.concept });

      seeded.attributionNoticeId = notices.find(
        (row) => row.concept === ATTRIBUTION_ES,
      )!.id;
      seeded.hedgedNoticeId = notices.find(
        (row) => row.concept === ATTRIBUTION_ES_HEDGED,
      )!.id;
      seeded.educationalNoticeId = notices.find(
        (row) => row.concept === EDUCATIONAL,
      )!.id;

      // ── learner notes: attribution and educational ─────────────────────────
      const notes = await db
        .insert(topicNotes)
        .values([
          { topicId: topic!.id, profileId, content: ATTRIBUTION_ES },
          { topicId: topic!.id, profileId, content: EDUCATIONAL },
        ])
        .returning({ id: topicNotes.id, content: topicNotes.content });

      seeded.attributionNoteId = notes.find(
        (row) => row.content === ATTRIBUTION_ES,
      )!.id;
      seeded.educationalNoteId = notes.find(
        (row) => row.content === EDUCATIONAL,
      )!.id;

      // ── needs-deepening misconception ──────────────────────────────────────
      const [deepening] = await db
        .insert(needsDeepeningTopics)
        .values({
          profileId,
          subjectId: subject!.id,
          topicId: topic!.id,
          misconception: ATTRIBUTION_ES,
        })
        .returning({ id: needsDeepeningTopics.id });

      seeded.attributionDeepeningId = deepening!.id;

      // ── verified Challenge artifact: the SAME string in two columns ────────
      // `persistVerifiedChallengeArtifacts` writes the gated string to
      // `content` and, for a solid-quote artifact, duplicates it verbatim into
      // `artifact_concept_key`. Seeding both is what makes the second column's
      // remediation provable rather than asserted — the landed sweep scrubbed
      // `content` and left this copy readable.
      const [artifactNote] = await db
        .insert(topicNotes)
        .values({
          topicId: topic!.id,
          profileId,
          content: ATTRIBUTION_ES,
          artifactSource: 'challenge_solid_quote',
          artifactConceptKey: ATTRIBUTION_ES,
        })
        .returning({ id: topicNotes.id });

      seeded.artifactNoteId = artifactNote!.id;

      // ── learner-profile JSONB, in the shapes PRODUCTION actually writes ────
      // Not the shapes the Zod schema declares. `mergeInterests` writes bare
      // strings into `interests`, and `buildAnalysisUpdates` writes
      // `{topic, subject}` objects into `recentlyResolvedTopics`; the entry
      // shapes in `packages/schemas` are a read-side coercion. Seeding the
      // declared shapes would have produced a green sweep that scanned nothing.
      await db.insert(learningProfiles).values({
        profileId,
        interests: [ATTRIBUTION_ES, BENIGN],
        interestTimestamps: {
          [normalizeMemoryValue(ATTRIBUTION_ES)]: new Date().toISOString(),
          [normalizeMemoryValue(BENIGN)]: new Date().toISOString(),
        },
        strengths: [
          {
            subject: BENIGN,
            topics: [ATTRIBUTION_ES, BENIGN],
            confidence: 'medium',
          },
        ],
        struggles: [
          {
            subject: BENIGN,
            topic: ATTRIBUTION_ES,
            attempts: 1,
            confidence: 'medium',
          },
        ],
        communicationNotes: [ATTRIBUTION_ES, EDUCATIONAL],
        suppressedInferences: [ATTRIBUTION_ES],
        recentlyResolvedTopics: [{ topic: ATTRIBUTION_ES, subject: null }],
      });

      // ── memory facts: text, the metadata copy, and a colliding duplicate ───
      // Two active rows that scrub to the SAME placeholder in the same
      // (profile, category, subject, context) group. Without the supersede they
      // would collide on `memory_facts_active_unique_idx`, so this pair is what
      // proves the collision handling rather than describing it.
      const facts = await db
        .insert(memoryFacts)
        .values([
          {
            profileId,
            category: 'strength',
            text: ATTRIBUTION_ES,
            textNormalized: normalizeMemoryText(ATTRIBUTION_ES),
            metadata: { subject: ATTRIBUTION_ES, topics: [ATTRIBUTION_ES] },
            observedAt: new Date(),
            embedding: Array.from({ length: 1024 }, () => 0.01),
          },
          {
            profileId,
            category: 'strength',
            text: ATTRIBUTION_ES_HEDGED,
            textNormalized: normalizeMemoryText(ATTRIBUTION_ES_HEDGED),
            metadata: { subject: ATTRIBUTION_ES, topics: [] },
            observedAt: new Date(),
            embedding: Array.from({ length: 1024 }, () => 0.02),
          },
          {
            profileId,
            category: 'interest',
            text: EDUCATIONAL,
            textNormalized: normalizeMemoryText(EDUCATIONAL),
            metadata: { label: EDUCATIONAL },
            observedAt: new Date(),
            embedding: null,
          },
        ])
        .returning({ id: memoryFacts.id, text: memoryFacts.text });

      seeded.attributionFactId = facts.find(
        (row) => row.text === ATTRIBUTION_ES,
      )!.id;
      seeded.hedgedFactId = facts.find(
        (row) => row.text === ATTRIBUTION_ES_HEDGED,
      )!.id;
      seeded.educationalFactId = facts.find(
        (row) => row.text === EDUCATIONAL,
      )!.id;
      seeded.profileId = profileId;
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

    it('[AC-1] first run: scrubs the attribution rows and returns per-surface counts', async () => {
      const reports = await remediatePersistedLearningText(db);
      const bySurface = new Map(reports.map((r) => [r.surface, r]));

      // Two attributions scrubbed, one educational row reported for review.
      expect(bySurface.get('mentor_notices.concept')).toMatchObject({
        scanned: 3,
        remediated: 2,
        review: 1,
      });
      // One attribution hint; the benign hint and the null hint are untouched.
      expect(bySurface.get('mentor_notices.correction_hint')).toMatchObject({
        remediated: 1,
      });
      // Three notes now: the learner's attribution, the educational control, and
      // the verified-artifact note whose content is the same attribution.
      expect(bySurface.get('topic_notes.content')).toMatchObject({
        scanned: 3,
        remediated: 2,
        review: 1,
      });
      expect(
        bySurface.get('needs_deepening_topics.misconception'),
      ).toMatchObject({ scanned: 1, remediated: 1, review: 0 });
    });

    it('[AC-5] scrubbed the attribution rows and withdrew the notices from reads', async () => {
      const rows = await db
        .select({
          id: mentorNotices.id,
          concept: mentorNotices.concept,
          correctionHint: mentorNotices.correctionHint,
          status: mentorNotices.status,
        })
        .from(mentorNotices);
      const byId = new Map(rows.map((row) => [row.id, row]));

      for (const id of [seeded.attributionNoticeId, seeded.hedgedNoticeId]) {
        const row = byId.get(id);
        expect(row?.concept).toBe(REDACTED_PLACEHOLDER);
        // The record survives — this is a purge, not a delete.
        expect(row).toBeDefined();
        // ...and no reader surfaces the placeholder: `faded` is the existing
        // read-excluding terminal status.
        expect(row?.status).toBe('faded');
      }

      expect(byId.get(seeded.attributionNoticeId)?.correctionHint).toBeNull();

      const note = await db
        .select({ content: topicNotes.content })
        .from(topicNotes)
        .where(eq(topicNotes.id, seeded.attributionNoteId));
      expect(note[0]?.content).toBe(REDACTED_PLACEHOLDER);

      const deepening = await db
        .select({ misconception: needsDeepeningTopics.misconception })
        .from(needsDeepeningTopics)
        .where(eq(needsDeepeningTopics.id, seeded.attributionDeepeningId));
      expect(deepening[0]?.misconception).toBeNull();
    });

    it('[AC-5] left the legitimate educational rows exactly as they were', async () => {
      // The half that discriminates. If this fails, the remediation is blanking
      // on "blocked" rather than on an attribution, and is destroying the
      // learner capability the 2026-07-26 ruling restored.
      const notice = await db
        .select({
          concept: mentorNotices.concept,
          status: mentorNotices.status,
        })
        .from(mentorNotices)
        .where(eq(mentorNotices.id, seeded.educationalNoticeId));
      expect(notice[0]?.concept).toBe(EDUCATIONAL);
      expect(notice[0]?.status).toBe('open');

      const note = await db
        .select({ content: topicNotes.content })
        .from(topicNotes)
        .where(eq(topicNotes.id, seeded.educationalNoteId));
      expect(note[0]?.content).toBe(EDUCATIONAL);
    });

    it('[AC-4] is idempotent: a second run scrubs nothing further', async () => {
      const reports = await remediatePersistedLearningText(db);

      expect(reports.every((report) => report.remediated === 0)).toBe(true);

      // And the educational rows are still untouched after the re-run, so
      // idempotence is not achieved by having eventually blanked everything.
      const notice = await db
        .select({ concept: mentorNotices.concept })
        .from(mentorNotices)
        .where(eq(mentorNotices.id, seeded.educationalNoticeId));
      expect(notice[0]?.concept).toBe(EDUCATIONAL);
    });
    it('[AC-5] scrubbed the artifact concept key the landed sweep left behind', async () => {
      // The crux of the rework. `content` and `artifact_concept_key` held the
      // identical string; scrubbing only the first leaves the same clinical
      // sentence readable in the second column of the same row.
      const note = await db
        .select({
          content: topicNotes.content,
          conceptKey: topicNotes.artifactConceptKey,
        })
        .from(topicNotes)
        .where(eq(topicNotes.id, seeded.artifactNoteId));

      expect(note[0]?.content).toBe(REDACTED_PLACEHOLDER);
      // Not null: a CHECK constraint (migration 0154) requires this column to be
      // non-null for a solid-quote artifact, which is every row this surface
      // targets, so the placeholder is the only available scrub.
      expect(note[0]?.conceptKey).toBe(REDACTED_PLACEHOLDER);
    });

    it('[AC-5] scrubbed learner-profile free text in the shapes production writes', async () => {
      const rows = await db
        .select({
          interests: learningProfiles.interests,
          interestTimestamps: learningProfiles.interestTimestamps,
          strengths: learningProfiles.strengths,
          struggles: learningProfiles.struggles,
          communicationNotes: learningProfiles.communicationNotes,
          suppressedInferences: learningProfiles.suppressedInferences,
          recentlyResolvedTopics: learningProfiles.recentlyResolvedTopics,
        })
        .from(learningProfiles)
        .where(eq(learningProfiles.profileId, seeded.profileId));

      const row = rows[0]!;

      // The attribution is gone from every array...
      expect(JSON.stringify(row)).not.toContain('TEA');
      // ...and the benign and educational entries survived, so the sweep is a
      // discriminator rather than a blanket wipe.
      expect(row.interests).toEqual([BENIGN]);
      expect(row.communicationNotes).toEqual([EDUCATIONAL]);

      // The DERIVED CARRIER: interestTimestamps is keyed by the normalized
      // interest label, so a dropped interest must not leave an orphaned key.
      const timestampKeys = Object.keys(
        row.interestTimestamps as Record<string, string>,
      );
      expect(timestampKeys).toEqual([normalizeMemoryValue(BENIGN)]);
    });

    it('[AC-5] scrubbed all three memory-fact carriers and superseded the duplicate', async () => {
      const rows = await db
        .select({
          id: memoryFacts.id,
          text: memoryFacts.text,
          textNormalized: memoryFacts.textNormalized,
          metadata: memoryFacts.metadata,
          embedding: memoryFacts.embedding,
          supersededBy: memoryFacts.supersededBy,
        })
        .from(memoryFacts)
        .where(eq(memoryFacts.profileId, seeded.profileId));

      const byId = new Map(rows.map((row) => [row.id, row]));
      const attribution = byId.get(seeded.attributionFactId)!;
      const hedged = byId.get(seeded.hedgedFactId)!;
      const educational = byId.get(seeded.educationalFactId)!;

      // Carrier 1: the column itself, and its derived normalized form.
      expect(attribution.text).toBe(REDACTED_PLACEHOLDER);
      expect(attribution.textNormalized).toBe(
        normalizeMemoryText(REDACTED_PLACEHOLDER),
      );
      // Carrier 2: the second copy inside metadata.
      expect(JSON.stringify(attribution.metadata)).not.toContain('TEA');
      // Carrier 3: the vector of the pre-redaction sentence, which sits behind a
      // cosine index — a scrubbed row would otherwise still be retrievable by
      // similarity to the exact phrasing this item removes.
      expect(attribution.embedding).toBeNull();

      // The colliding duplicate scrubs to the same placeholder, so it leaves the
      // partial unique index by being superseded BY the survivor — never by
      // itself, which would be a cycle for the cascade-delete walker.
      expect(hedged.text).toBe(REDACTED_PLACEHOLDER);
      expect(hedged.supersededBy).toBe(seeded.attributionFactId);
      expect(attribution.supersededBy).toBeNull();

      // The educational fact is the control: ambiguous, reported, untouched.
      expect(educational.text).toBe(EDUCATIONAL);
      expect(educational.supersededBy).toBeNull();
    });

    it('[WI-3076 AC] reports a metadata-only concurrent update instead of overwriting it', async () => {
      // This shape drives a metadata-only remediation: the primary text is
      // benign, while metadata.subject carries the remediable attribution.
      // The separate connection locks the row after the scan can read it, then
      // writes an unrelated key before releasing the remediation update.
      const [fact] = await db
        .insert(memoryFacts)
        .values({
          profileId: seeded.profileId,
          category: 'strength',
          text: BENIGN,
          textNormalized: normalizeMemoryText(BENIGN),
          metadata: { subject: ATTRIBUTION_ES, topics: [] },
          observedAt: new Date(),
          embedding: null,
        })
        .returning({ id: memoryFacts.id });

      const writer = new Client({
        connectionString: scratchUrl,
        application_name: `${scratchApplicationName}-concurrent-writer`,
      });
      await writer.connect();

      try {
        await writer.query('BEGIN');
        await writer.query(
          'SELECT id FROM memory_facts WHERE id = $1 FOR UPDATE',
          [fact!.id],
        );

        const remediation = remediateMemoryFacts(db);
        await waitForBlockedMemoryFactUpdate(
          adminPool,
          databaseName,
          scratchApplicationName,
        );

        await writer.query(
          `UPDATE memory_facts
           SET metadata = metadata || $2::jsonb
           WHERE id = $1`,
          [fact!.id, JSON.stringify({ concurrentMarker: 'preserve-me' })],
        );
        await writer.query('COMMIT');

        const reports = await remediation;
        const metadataReport = reports.find(
          (report) => report.surface === 'memory_facts.metadata',
        );
        expect(metadataReport?.skippedChanged).toBe(1);

        const [after] = await db
          .select({ text: memoryFacts.text, metadata: memoryFacts.metadata })
          .from(memoryFacts)
          .where(eq(memoryFacts.id, fact!.id));

        // The predicate must protect both fields read to build the JSONB
        // replacement. With the old id+text-only predicate, this assertion
        // fails: subject is redacted and concurrentMarker is lost.
        expect(after?.text).toBe(BENIGN);
        expect(after?.metadata).toMatchObject({
          subject: ATTRIBUTION_ES,
          concurrentMarker: 'preserve-me',
        });
      } finally {
        await writer.query('ROLLBACK').catch(() => undefined);
        await writer.end();
      }
    });
  },
);
