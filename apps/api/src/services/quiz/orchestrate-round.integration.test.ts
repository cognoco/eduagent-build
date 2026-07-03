import { eq, inArray } from 'drizzle-orm';
import { resolve } from 'path';
import {
  createDatabase,
  person,
  practiceActivityEvents,
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
const ATTACKER_DISPLAY_NAME = `${PREFIX}-attacker`;
const VICTIM_DISPLAY_NAME = `${PREFIX}-victim`;

async function cleanupTestAccounts() {
  const db = createIntegrationDb();
  const rows = await db.query.person.findMany({
    where: inArray(person.displayName, [
      ATTACKER_DISPLAY_NAME,
      VICTIM_DISPLAY_NAME,
    ]),
  });
  if (rows.length > 0) {
    await db.delete(person).where(
      inArray(
        person.id,
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
  const [attackerProf] = await db
    .insert(person)
    .values({
      displayName: ATTACKER_DISPLAY_NAME,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning();
  attackerProfileId = attackerProf!.id;

  const [victimProf] = await db
    .insert(person)
    .values({
      displayName: VICTIM_DISPLAY_NAME,
      birthDate: '2010-01-01',
      residenceJurisdiction: 'EU',
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
