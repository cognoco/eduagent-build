/**
 * [WI-3141] Summary-safe session-embedding content — integration.
 *
 * The DPO-facing guarantee this file exists to evidence: `session_embeddings`
 * — a queryable index that outlives the exchange — never holds a verbatim
 * learner turn. Before WI-3141 the initial write stored the raw transcript
 * extract and only the 30-day purge rewrote it to summary-safe text, so a
 * special-category disclosure sat in a second queryable location for a month
 * (a5-art9-suppression.md Gap 5).
 *
 * The regression guard is the first test — `[BREAK] a freshly written
 * embedding row contains no verbatim learner turn`. Restore the raw-transcript
 * extract at the `generate-embeddings` step and it fails.
 *
 * The other two prove the fail-closed trade is paid for: an incomplete summary
 * yields NO row (never a raw one), and the backfill sweep writes that row once
 * the summary is repaired.
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
  organization,
  person,
  sessionEmbeddings,
  sessionEvents,
  sessionSummaries,
  subjects,
  subscription,
  type Database,
} from '@eduagent/database';
import { and, eq, inArray } from 'drizzle-orm';

import * as llm from '../../services/llm';
import { sessionCompleted } from './session-completed';
import { sessionEmbeddingBackfill } from './session-embedding-backfill';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const VOYAGE_HOST = 'api.voyageai.com';
const originalFetch = globalThis.fetch;
const voyageBodies: string[] = [];

/**
 * The learner turns seeded below. Each is a verbatim first-person disclosure
 * of exactly the kind that must not reach the index; the assertions search the
 * stored content and the Voyage payload for these strings.
 */
const RAW_LEARNER_TURN_1 =
  'my mum keeps saying I am dyslexic and I hate reading out loud in class';
const RAW_LEARNER_TURN_2 = 'I still find the light reactions very difficult';

/** LLM output that satisfies `llmSummarySchema` — the happy path. */
const COMPLETE_LLM_RESPONSE = JSON.stringify({
  struggles: null,
  interests: null,
  strengths: null,
  resolvedTopics: null,
  communicationNotes: null,
  explanationEffectiveness: null,
  engagementLevel: 'low',
  confidence: 'medium',
  closingLine: 'Keep going!',
  learnerRecap: 'You worked through photosynthesis.',
  narrative: 'Session focused on photosynthesis and the light reactions.',
  topicsCovered: ['photosynthesis'],
  sessionState: 'completed',
  reEntryRecommendation:
    'Review the light reactions again at the start of the next session.',
});

/**
 * Same output with `reEntryRecommendation` under the 20-char floor
 * (`llmSummarySchema`), so `generateAndStoreLlmSummary` stores nothing and
 * `llm_summary` stays NULL — the real shape of a soft summary-step failure.
 */
const UNUSABLE_LLM_RESPONSE = JSON.stringify({
  struggles: null,
  interests: null,
  strengths: null,
  resolvedTopics: null,
  communicationNotes: null,
  explanationEffectiveness: null,
  engagementLevel: 'low',
  confidence: 'medium',
  closingLine: 'Keep going!',
  learnerRecap: 'You worked through photosynthesis.',
  narrative: 'Session focused on photosynthesis and the light reactions.',
  topicsCovered: ['photosynthesis'],
  sessionState: 'completed',
  reEntryRecommendation: 'Review.',
});

interface Scenario {
  profileId: string;
  subjectId: string;
  topicId: string;
  sessionId: string;
}

let db: Database;
const seededPersonIds: string[] = [];
const seededOrgIds: string[] = [];
let seedCounter = 0;

async function seedScenario(): Promise<Scenario> {
  const [org] = await db
    .insert(organization)
    .values({ name: `WI-3141 Org ${++seedCounter}` })
    .returning({ id: organization.id });
  seededOrgIds.push(org!.id);

  const [learner] = await db
    .insert(person)
    .values({
      displayName: 'WI-3141 Learner',
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
      endedAt: new Date(),
    })
    .returning({ id: learningSessions.id });

  await db.insert(sessionEvents).values([
    {
      sessionId: session!.id,
      profileId,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'user_message' as const,
      content: RAW_LEARNER_TURN_1,
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
      content: RAW_LEARNER_TURN_2,
    },
  ]);

  await db.insert(learningProfiles).values({
    profileId,
    memoryConsentStatus: 'granted',
    memoryCollectionEnabled: true,
    memoryEnabled: true,
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

async function loadEmbeddings(scenario: Scenario) {
  return db.query.sessionEmbeddings.findMany({
    where: and(
      eq(sessionEmbeddings.sessionId, scenario.sessionId),
      eq(sessionEmbeddings.profileId, scenario.profileId),
    ),
  });
}

beforeAll(() => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for WI-3141 integration tests');
  }
  db = createDatabase(databaseUrl);

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Match on the parsed hostname, never a prefix: `startsWith` on the origin
    // would also match a lookalike host such as `api.voyageai.com.evil.test`.
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (new URL(url).hostname === VOYAGE_HOST) {
      voyageBodies.push(String(init?.body ?? ''));
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

describe('WI-3141 summary-safe session-embedding content', () => {
  let routeAndCallSpy: jest.SpiedFunction<typeof llm.routeAndCall>;

  beforeEach(() => {
    voyageBodies.length = 0;
    process.env['VOYAGE_API_KEY'] = 'voyage-wi3141-test-key';
    routeAndCallSpy = jest.spyOn(llm, 'routeAndCall').mockResolvedValue({
      response: COMPLETE_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });
  });

  afterEach(() => {
    routeAndCallSpy.mockRestore();
    delete process.env['VOYAGE_API_KEY'];
  });

  it('[BREAK] a freshly written embedding row contains no verbatim learner turn', async () => {
    const scenario = await seedScenario();

    await runPipeline(scenario);

    const embeddings = await loadEmbeddings(scenario);
    expect(embeddings).toHaveLength(1);

    const content = embeddings[0]!.content;
    // Positive: it IS the summary-safe form the purge also writes.
    expect(content).toContain('Narrative: Session focused on photosynthesis');
    expect(content).toContain('Session state: completed');
    // Negative: neither learner turn survives anywhere in the stored row.
    expect(content).not.toContain(RAW_LEARNER_TURN_1);
    expect(content).not.toContain(RAW_LEARNER_TURN_2);
    expect(content).not.toContain('dyslexic');

    // …nor in what left the building for Voyage.
    expect(voyageBodies.length).toBeGreaterThan(0);
    for (const body of voyageBodies) {
      expect(body).not.toContain(RAW_LEARNER_TURN_1);
      expect(body).not.toContain('dyslexic');
    }
  }, 60_000);

  it('[BREAK] fails closed — an unusable summary yields no row at all, not a raw one', async () => {
    routeAndCallSpy.mockResolvedValue({
      response: UNUSABLE_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });
    const scenario = await seedScenario();

    await runPipeline(scenario);

    // llm_summary never landed, so there is nothing summary-safe to embed.
    const summary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, scenario.sessionId),
        eq(sessionSummaries.profileId, scenario.profileId),
      ),
      columns: { llmSummary: true },
    });
    expect(summary?.llmSummary ?? null).toBeNull();

    expect(await loadEmbeddings(scenario)).toHaveLength(0);
    for (const body of voyageBodies) {
      expect(body).not.toContain(RAW_LEARNER_TURN_1);
    }
  }, 60_000);

  it('the backfill writes the deferred row once the summary is repaired', async () => {
    routeAndCallSpy.mockResolvedValue({
      response: UNUSABLE_LLM_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
    });
    const scenario = await seedScenario();
    await runPipeline(scenario);
    expect(await loadEmbeddings(scenario)).toHaveLength(0);

    // Stand in for summary-reconciliation repairing llm_summary.
    await db
      .update(sessionSummaries)
      .set({
        llmSummary: {
          narrative:
            'Session focused on photosynthesis and the light reactions.',
          topicsCovered: ['photosynthesis'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Review the light reactions again at the start of the next session.',
        },
        summaryGeneratedAt: new Date(),
      })
      .where(
        and(
          eq(sessionSummaries.sessionId, scenario.sessionId),
          eq(sessionSummaries.profileId, scenario.profileId),
        ),
      );

    const backfill = (
      sessionEmbeddingBackfill as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    const result = (await backfill({
      event: {
        name: 'app/session.embedding.backfill',
        data: {
          profileId: scenario.profileId,
          sessionId: scenario.sessionId,
          topicId: scenario.topicId,
        },
      },
      step: buildStep(),
    })) as { status: string };

    expect(result.status).toBe('embedded');
    const embeddings = await loadEmbeddings(scenario);
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]!.content).toContain(
      'Narrative: Session focused on photosynthesis',
    );
    expect(embeddings[0]!.content).not.toContain(RAW_LEARNER_TURN_1);
  }, 60_000);
});
