/**
 * WI-580 / F-076 break test — a minor's real name must never reach a
 * third-party LLM provider via the exchange path.
 *
 * Exercises the real egress path: seeded profile → prepareExchangeContext →
 * buildSystemPrompt (the exact string sent to the provider). The minor case
 * fails against the pre-fix code (real displayName interpolated into the
 * system prompt); the adult-owner case pins the preserved personalization.
 */
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  membership,
  organization,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import { deleteV2IdentitiesForTest } from '../../test-utils/legacy-identity-anchors';
import { prepareExchangeContext } from './session-exchange';
import { buildSystemPrompt } from '../exchanges';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

async function seedLearner(
  db: Database,
  input: { displayName: string; birthYear: number; isOwner: boolean },
): Promise<{ profileId: string; sessionId: string }> {
  const idx = ++seedCounter;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  await db
    .insert(organization)
    .values({ id: accountId, name: `PII Test Org ${idx}` });
  await db.insert(person).values({
    id: profileId,
    displayName: input.displayName,
    birthDate: `${input.birthYear}-06-15`,
    residenceJurisdiction: 'US',
  });
  await db.insert(membership).values({
    personId: profileId,
    organizationId: accountId,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Biology',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Cell Energy Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Cell Energy',
      description: 'Cell Energy description',
      sortOrder: 0,
      estimatedMinutes: 20,
      skipped: false,
    })
    .returning({ id: curriculumTopics.id });

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {},
    })
    .returning({ id: learningSessions.id });

  return { profileId, sessionId: session!.id };
}

async function prepare(db: Database, profileId: string, sessionId: string) {
  return prepareExchangeContext(db, profileId, sessionId, 'Can we continue?', {
    semanticMemoryRetrievalEnabled: false,
    memoryFactsReadEnabled: false,
    memoryFactsRelevanceEnabled: false,
  });
}

describeIfDb('prepareExchangeContext WI-580 minor-name egress (F-076)', () => {
  let db: Database;
  const currentYear = new Date().getFullYear();

  beforeAll(() => {
    db = createDatabase(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    // [WI-1128] The whole seeded chain hangs off person via ON DELETE CASCADE:
    // person → subjects (subjects.ts:54) →
    // curricula/curriculumBooks/curriculumTopics (subjects.ts:100/128/179/188)
    // and learningSessions (sessions.ts:95-98) — deleting the v2 identities
    // cleans up all rows.
    await deleteV2IdentitiesForTest(db, {
      accountIds: seededAccountIds,
      profileIds: seededProfileIds,
    });
  });

  it('[F-076 break test] a minor owner profile sends no real name into the LLM prompt context', async () => {
    const sentinel = `Zuzana-${RUN_ID}`;
    const seeded = await seedLearner(db, {
      displayName: sentinel,
      // 12 years old — solo-minor owner shape (mirrors existing seeds that
      // create under-18 owner profiles).
      birthYear: currentYear - 12,
      isOwner: true,
    });

    const prep = await prepare(db, seeded.profileId, seeded.sessionId);

    expect(prep.context.learnerName).toBeUndefined();
    // Nothing else in the prompt context may carry the name either.
    expect(JSON.stringify(prep.context)).not.toContain(sentinel);
    // The actual egress surface: the system prompt string sent to providers.
    const prompt = buildSystemPrompt(prep.context);
    expect(prompt).not.toContain(sentinel);
  });

  it('[F-076 break test] a child profile on a parent account (non-owner) sends no real name regardless of age', async () => {
    const sentinel = `Nikolaj-${RUN_ID}`;
    const seeded = await seedLearner(db, {
      displayName: sentinel,
      // Adult-aged birth year but non-owner: the gate must stay fail-closed
      // on ownership, not just age.
      birthYear: currentYear - 30,
      isOwner: false,
    });

    const prep = await prepare(db, seeded.profileId, seeded.sessionId);

    expect(prep.context.learnerName).toBeUndefined();
    const prompt = buildSystemPrompt(prep.context);
    expect(prompt).not.toContain(sentinel);
  });

  it('[F-076 break test / PR #900 Codex P1] an owner at the birth-year boundary (currentYear - 18, may still be 17) sends no real name', async () => {
    const sentinel = `Matylda-${RUN_ID}`;
    const seeded = await seedLearner(db, {
      displayName: sentinel,
      // Ambiguous boundary: 17 or 18 depending on whether the birthday has
      // passed — must be treated as minor (fail-closed).
      birthYear: currentYear - 18,
      isOwner: true,
    });

    const prep = await prepare(db, seeded.profileId, seeded.sessionId);

    expect(prep.context.learnerName).toBeUndefined();
    const prompt = buildSystemPrompt(prep.context);
    expect(prompt).not.toContain(sentinel);
  });

  it('an adult owner keeps name personalization (consented, audit-accepted)', async () => {
    const sentinel = `Astrid-${RUN_ID}`;
    const seeded = await seedLearner(db, {
      displayName: sentinel,
      birthYear: currentYear - 30,
      isOwner: true,
    });

    const prep = await prepare(db, seeded.profileId, seeded.sessionId);

    expect(prep.context.learnerName).toBe(sentinel);
    const prompt = buildSystemPrompt(prep.context);
    expect(prompt).toContain(`The learner's name is "${sentinel}"`);
  });
});
