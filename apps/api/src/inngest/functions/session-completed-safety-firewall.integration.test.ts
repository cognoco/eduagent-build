/**
 * [WI-3140] Tripwire-to-memory firewall — integration.
 *
 * The DPO-facing guarantee this file exists to evidence: a session whose
 * conversation was handled as a safeguarding crisis NEVER reaches persistent
 * memory. Concretely, running the real `session-completed` pipeline against a
 * real database over a session carrying `learning_sessions.safety_flagged_at`
 * must produce ZERO profile-memory writes and ZERO `session_embeddings` rows,
 * while an otherwise identical unflagged session still produces both.
 *
 * The last test — `a safety-flagged session yields no memory writes and no
 * embedding` — is the regression guard: revert either enforcement site in
 * session-completed.ts and it fails.
 *
 * External-boundary mocks only (AGENTS.md § Code Quality Guards):
 *   1. jest.spyOn(llm, 'routeAndCall') — the sanctioned LLM boundary
 *   2. globalThis.fetch — Voyage embeddings API
 * The database, repositories, services and Inngest step plumbing are real.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningProfiles,
  learningSessions,
  membership,
  memoryFacts,
  organization,
  person,
  sessionEmbeddings,
  sessionEvents,
  subjects,
  subscription,
  type Database,
} from '@eduagent/database';
import { and, eq, inArray } from 'drizzle-orm';

import * as llm from '../../services/llm';
import { flagSessionSafety } from '../../services/safety-flag';
import { sessionCompleted } from './session-completed';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const VOYAGE_URL = 'https://api.voyageai.com';
const originalFetch = globalThis.fetch;
const voyageCalls: string[] = [];

let db: Database;
const seededPersonIds: string[] = [];
const seededOrgIds: string[] = [];
let seedCounter = 0;

/**
 * Analysis LLM output. Repeats a struggle the profile has already seen twice so
 * `applyAnalysis` promotes it and writes it back — the observable proof that
 * the analysis step actually ran (matching the granted-consent scenario in
 * session-completed.integration.test.ts).
 */
const ANALYSIS_LLM_RESPONSE = JSON.stringify({
  struggles: [
    {
      topic: 'photosynthesis light reactions',
      subject: 'Biology',
      confidence: 'medium',
    },
  ],
  interests: null,
  strengths: null,
  resolvedTopics: null,
  communicationNotes: null,
  explanationEffectiveness: null,
  engagementLevel: 'low',
  confidence: 'medium',
  closingLine: 'Keep going!',
  learnerRecap: 'You worked through photosynthesis.',
  narrative: 'Session focused on the light reactions.',
  topicsCovered: ['photosynthesis'],
  sessionState: 'completed',
  reEntryRecommendation: 'Review again.',
});

interface Scenario {
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}

async function seedScenario(options: {
  memoryConsent: 'granted' | 'pending';
}): Promise<Scenario> {
  const [org] = await db
    .insert(organization)
    .values({ name: `WI-3140 Org ${++seedCounter}` })
    .returning({ id: organization.id });
  seededOrgIds.push(org!.id);

  const [learner] = await db
    .insert(person)
    .values({
      displayName: 'WI-3140 Learner',
      birthDate: '2005-01-01',
      residenceJurisdiction: 'EU',
    })
    .returning({ id: person.id });
  seededPersonIds.push(learner!.id);
  const profileId = learner!.id;

  await db.insert(membership).values({
    personId: profileId,
    organizationId: org!.id,
    roles: ['admin'],
  });
  await db.insert(subscription).values({
    id: generateUUIDv7(),
    organizationId: org!.id,
    payerPersonId: profileId,
    planTier: 'free',
    status: 'active',
    periodStartAt: new Date(),
    periodEndAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Biology' })
    .returning({ id: subjects.id });
  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id })
    .returning({ id: curricula.id });
  const [book] = await db
    .insert(curriculumBooks)
    .values({ subjectId: subject!.id, title: 'Cells and Energy', sortOrder: 1 })
    .returning({ id: curriculumBooks.id });
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      title: 'Photosynthesis',
      description: 'How plants convert light to energy',
      sortOrder: 1,
      estimatedMinutes: 30,
    })
    .returning({ id: curriculumTopics.id });

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      status: 'completed',
      exchangeCount: 3,
    })
    .returning({ id: learningSessions.id });

  // Three events clear the transcript-length gate in analyzeSessionTranscript.
  await db.insert(sessionEvents).values([
    {
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'user_message' as const,
      content: 'I really struggle with photosynthesis light reactions.',
    },
    {
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'ai_response' as const,
      content: 'Let me help you understand the light reactions.',
    },
    {
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'user_message' as const,
      content: 'I still find it very difficult.',
    },
  ]);

  await db.insert(learningProfiles).values({
    profileId,
    memoryConsentStatus: options.memoryConsent,
    memoryCollectionEnabled: options.memoryConsent === 'granted',
    memoryEnabled: true,
    struggles: [
      {
        topic: 'photosynthesis light reactions',
        subject: 'Biology',
        attempts: 2,
        confidence: 'low',
        lastSeen: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
  });

  return {
    profileId,
    subjectId: subject!.id,
    topicId: topic!.id,
    sessionId: session!.id,
  };
}

function buildStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    waitForEvent: jest.fn().mockResolvedValue({ data: {} }),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

async function runPipeline(scenario: Scenario): Promise<void> {
  const handler = (
    sessionCompleted as unknown as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  await handler({
    event: {
      name: 'app/session.completed',
      data: {
        profileId: scenario.profileId,
        sessionId: scenario.sessionId,
        subjectId: scenario.subjectId,
        topicId: scenario.topicId,
        exchangeCount: 3,
        summaryStatus: 'pending',
        timestamp: new Date().toISOString(),
        verificationType: null,
        sessionType: 'learning',
        qualityRating: 4,
        reason: 'user_ended',
      },
    },
    step: buildStep(),
  });
}

async function loadStruggles(profileId: string): Promise<unknown[]> {
  const row = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, profileId),
    columns: { struggles: true },
  });
  return Array.isArray(row?.struggles) ? (row.struggles as unknown[]) : [];
}

beforeAll(() => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for WI-3140 integration tests');
  }
  db = createDatabase(databaseUrl);

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith(VOYAGE_URL)) {
      voyageCalls.push(url);
      return new Response(
        JSON.stringify({ data: [{ embedding: new Array(1024).fill(0.01) }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return originalFetch(input, init);
  };
}, 30_000);

afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (seededPersonIds.length > 0) {
    if (seededOrgIds.length > 0) {
      await db
        .delete(subscription)
        .where(inArray(subscription.organizationId, seededOrgIds));
    }
    await db.delete(person).where(inArray(person.id, seededPersonIds));
  }
  if (seededOrgIds.length > 0) {
    await db.delete(organization).where(inArray(organization.id, seededOrgIds));
  }
}, 30_000);

describe('WI-3140 safety flag — write half', () => {
  it('stamps safety_flagged_at on the learner own session', async () => {
    const scenario = await seedScenario({ memoryConsent: 'pending' });

    await flagSessionSafety(
      db,
      scenario.profileId,
      scenario.sessionId,
      'test.write',
    );

    const row = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, scenario.sessionId),
      columns: { safetyFlaggedAt: true },
    });
    expect(row?.safetyFlaggedAt).toBeInstanceOf(Date);
  });

  it('[BREAK] refuses to stamp a session belonging to another profile', async () => {
    const victim = await seedScenario({ memoryConsent: 'pending' });
    const attacker = await seedScenario({ memoryConsent: 'pending' });

    await flagSessionSafety(
      db,
      attacker.profileId,
      victim.sessionId,
      'test.cross-profile',
    );

    const row = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, victim.sessionId),
      columns: { safetyFlaggedAt: true },
    });
    expect(row?.safetyFlaggedAt).toBeNull();
  });
});

describe('WI-3140 tripwire-to-memory firewall — session-completed enforcement', () => {
  let routeAndCallSpy: jest.SpiedFunction<typeof llm.routeAndCall>;

  beforeEach(() => {
    voyageCalls.length = 0;
    process.env['VOYAGE_API_KEY'] = 'voyage-wi3140-test-key';
    routeAndCallSpy = jest.spyOn(llm, 'routeAndCall').mockResolvedValue({
      response: ANALYSIS_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });
  });

  afterEach(() => {
    routeAndCallSpy.mockRestore();
    delete process.env['VOYAGE_API_KEY'];
  });

  it('control: an unflagged session is analysed and embedded', async () => {
    const scenario = await seedScenario({ memoryConsent: 'granted' });
    const strugglesBefore = await loadStruggles(scenario.profileId);

    await runPipeline(scenario);

    // The seeded struggle is repeated by the analysis LLM at a higher
    // confidence, so a run that actually analysed the transcript rewrites the
    // array. Comparing against the pre-run snapshot (rather than asserting
    // non-empty, which the seed alone would satisfy) is what makes this a real
    // control for the flagged case below.
    const strugglesAfter = await loadStruggles(scenario.profileId);
    expect(strugglesAfter).not.toEqual(strugglesBefore);

    const embeddings = await db.query.sessionEmbeddings.findMany({
      where: and(
        eq(sessionEmbeddings.sessionId, scenario.sessionId),
        eq(sessionEmbeddings.profileId, scenario.profileId),
      ),
    });
    expect(embeddings).toHaveLength(1);
    expect(voyageCalls.length).toBeGreaterThan(0);
  });

  it('[BREAK] a safety-flagged session yields no memory writes and no embedding', async () => {
    const scenario = await seedScenario({ memoryConsent: 'granted' });
    await db
      .update(learningSessions)
      .set({ safetyFlaggedAt: new Date() })
      .where(eq(learningSessions.id, scenario.sessionId));

    const strugglesBefore = await loadStruggles(scenario.profileId);

    await runPipeline(scenario);

    // Profile memory untouched: the analysis step returned before reading the
    // transcript, so no signal could be derived from the safeguarding turn.
    const strugglesAfter = await loadStruggles(scenario.profileId);
    expect(strugglesAfter).toEqual(strugglesBefore);

    // Forward-looking: nothing in this step writes memory_facts today, but the
    // DPO-facing guarantee is "zero memory_facts rows for a flagged session",
    // so the assertion stands as a guard against a future writer landing here.
    const facts = await db.query.memoryFacts.findMany({
      where: eq(memoryFacts.profileId, scenario.profileId),
    });
    expect(facts).toHaveLength(0);

    // Embeddings index untouched: nothing stored, nothing sent to Voyage.
    const embeddings = await db.query.sessionEmbeddings.findMany({
      where: eq(sessionEmbeddings.sessionId, scenario.sessionId),
    });
    expect(embeddings).toHaveLength(0);
    expect(voyageCalls).toHaveLength(0);
  });
});
