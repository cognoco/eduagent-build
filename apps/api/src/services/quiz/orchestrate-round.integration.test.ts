import { eq, inArray } from 'drizzle-orm';
import { resolve } from 'path';
import {
  accounts,
  createDatabase,
  practiceActivityEvents,
  profiles,
  quizRounds,
  subjects,
} from '@eduagent/database';
import { SubjectNotFoundError } from '@eduagent/schemas';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { buildAndGenerateRound } from './orchestrate-round';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-orchestrate-round';
const ATTACKER_ACCOUNT = {
  clerkUserId: `${PREFIX}-attacker`,
  email: `${PREFIX}-attacker@integration.test`,
};
const VICTIM_ACCOUNT = {
  clerkUserId: `${PREFIX}-victim`,
  email: `${PREFIX}-victim@integration.test`,
};

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.accounts.findMany({
    where: inArray(accounts.email, [
      ATTACKER_ACCOUNT.email,
      VICTIM_ACCOUNT.email,
    ]),
  });
  if (rows.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        rows.map((r: { id: string }) => r.id),
      ),
    );
  }
}

let attackerProfileId: string;
let victimProfileId: string;
let victimSubjectId: string;

beforeAll(async () => {
  await cleanupTestAccounts();
  const db = createIntegrationDb();
  const [attackerAcct] = await db
    .insert(accounts)
    .values({
      clerkUserId: ATTACKER_ACCOUNT.clerkUserId,
      email: ATTACKER_ACCOUNT.email,
    })
    .returning();
  const [attackerProf] = await db
    .insert(profiles)
    .values({
      accountId: attackerAcct!.id,
      displayName: 'Attacker Profile',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  attackerProfileId = attackerProf!.id;

  const [victimAcct] = await db
    .insert(accounts)
    .values({
      clerkUserId: VICTIM_ACCOUNT.clerkUserId,
      email: VICTIM_ACCOUNT.email,
    })
    .returning();
  const [victimProf] = await db
    .insert(profiles)
    .values({
      accountId: victimAcct!.id,
      displayName: 'Victim Profile',
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  victimProfileId = victimProf!.id;

  const [victimSubject] = await db
    .insert(subjects)
    .values({
      profileId: victimProfileId,
      name: 'Victim Subject (geography)',
    })
    .returning();
  victimSubjectId = victimSubject!.id;
});

beforeEach(async () => {
  const db = createIntegrationDb();
  await db
    .delete(practiceActivityEvents)
    .where(
      inArray(practiceActivityEvents.profileId, [
        attackerProfileId,
        victimProfileId,
      ]),
    );
  await db
    .delete(quizRounds)
    .where(inArray(quizRounds.profileId, [attackerProfileId, victimProfileId]));
});

afterAll(async () => {
  await cleanupTestAccounts();
});

describe('buildAndGenerateRound — subject ownership guard (security)', () => {
  // [SECURITY-IDOR] CCR PR #241 break test. Without ownership validation in
  // the non-vocabulary branch, an attacker (attackerProfileId) could supply
  // the victim's subjectId as `input.subjectId` on a capitals / guess_who
  // round. The subjectId would be persisted on the quiz_round row and then
  // attached to practice_activity_events at completion time — write-side
  // IDOR. The guard rejects with SubjectNotFoundError BEFORE the round is
  // generated (no LLM call, no DB write).
  it('[SECURITY-IDOR] rejects cross-profile subjectId on capitals round — no round, no event written', async () => {
    const db = createIntegrationDb();

    await expect(
      buildAndGenerateRound(
        db,
        attackerProfileId,
        {
          birthYear: 2010,
          location: null,
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          isOwner: true,
        },
        {
          activityType: 'capitals',
          subjectId: victimSubjectId,
        },
      ),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    const rounds = await db
      .select()
      .from(quizRounds)
      .where(eq(quizRounds.subjectId, victimSubjectId));
    expect(rounds).toHaveLength(0);

    const events = await db
      .select()
      .from(practiceActivityEvents)
      .where(eq(practiceActivityEvents.subjectId, victimSubjectId));
    expect(events).toHaveLength(0);

    // Defense-in-depth: also nothing under the attacker's profile.
    const attackerRounds = await db
      .select()
      .from(quizRounds)
      .where(eq(quizRounds.profileId, attackerProfileId));
    expect(attackerRounds).toHaveLength(0);
  });

  it('[SECURITY-IDOR] rejects cross-profile subjectId on guess_who round — no round, no event written', async () => {
    const db = createIntegrationDb();

    await expect(
      buildAndGenerateRound(
        db,
        attackerProfileId,
        {
          birthYear: 2010,
          location: null,
          consentStatus: 'CONSENTED',
          hasPremiumLlm: false,
          isOwner: true,
        },
        {
          activityType: 'guess_who',
          subjectId: victimSubjectId,
        },
      ),
    ).rejects.toBeInstanceOf(SubjectNotFoundError);

    const rounds = await db
      .select()
      .from(quizRounds)
      .where(eq(quizRounds.subjectId, victimSubjectId));
    expect(rounds).toHaveLength(0);

    const events = await db
      .select()
      .from(practiceActivityEvents)
      .where(eq(practiceActivityEvents.subjectId, victimSubjectId));
    expect(events).toHaveLength(0);
  });
});
