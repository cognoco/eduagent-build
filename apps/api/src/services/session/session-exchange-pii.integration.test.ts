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
import { like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  membership,
  organization,
  person,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import { prepareExchangeContext } from './session-exchange';
import { buildSystemPrompt } from '../exchanges';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;
const RUN_ID = generateUUIDv7();

let seedCounter = 0;

async function seedLearner(
  db: Database,
  input: { displayName: string; birthYear: number; isOwner: boolean },
): Promise<{ profileId: string; sessionId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_wi580_pii_${RUN_ID}_${idx}`,
      email: `wi580-pii-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: input.displayName,
      birthYear: input.birthYear,
      isOwner: input.isOwner,
    })
    .returning({ id: profiles.id });

  // [WI-867] v2 identity rows — always seeded (flag collapsed to v2-only).
  await db
    .insert(organization)
    .values({ id: account!.id, name: `PII Test Org ${idx}` });
  await db.insert(person).values({
    id: profile!.id,
    displayName: input.displayName,
    birthDate: `${input.birthYear}-06-15`,
    residenceJurisdiction: 'US',
  });
  await db.insert(membership).values({
    personId: profile!.id,
    organizationId: account!.id,
    roles: input.isOwner ? ['admin', 'learner'] : ['learner'],
  });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
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
      profileId: profile!.id,
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

  return { profileId: profile!.id, sessionId: session!.id };
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
    // The whole seeded chain hangs off accounts via ON DELETE CASCADE:
    // accounts → profiles (profiles.ts:71) → subjects (subjects.ts:54) →
    // curricula/curriculumBooks/curriculumTopics (subjects.ts:100/128/179/188)
    // and learningSessions (sessions.ts:95-98) — one delete cleans up all rows.
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_wi580_pii_${RUN_ID}%`));
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
