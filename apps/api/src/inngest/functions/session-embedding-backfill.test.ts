/**
 * [WI-3141] Catch-up for embeddings session-completed deferred.
 *
 * The pair under test is what makes fail-closed affordable: session-completed
 * writes no embedding when the summary is incomplete, and this sweep writes it
 * once the summary lands. The tests therefore assert both halves — the scan
 * only picks sessions that are complete-but-unembedded, and the handler writes
 * summary-safe text while re-applying the safety and consent gates.
 *
 * External-boundary mock only: globalThis.fetch (Voyage). `../helpers` is
 * stubbed to inject the DB and request-scoped env, matching the sibling cron
 * tests; the services under test run for real.
 */

const mockGetStepDatabase = jest.fn();
const mockGetStepVoyageApiKey = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: cron unit test injects DB and request-scoped env values; real helpers require live bindings */,
  () => {
    const actual = jest.requireActual(
      '../helpers',
    ) as typeof import('../helpers');
    return {
      ...actual,
      getStepDatabase: () => mockGetStepDatabase(),
      getStepVoyageApiKey: () => mockGetStepVoyageApiKey(),
    };
  },
);

import type { Database } from '@eduagent/database';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import {
  sessionEmbeddingBackfill,
  sessionEmbeddingBackfillCron,
} from './session-embedding-backfill';

const VOYAGE_HOST = 'api.voyageai.com';
const originalFetch = globalThis.fetch;
const voyageBodies: string[] = [];

const PROFILE_ID = '00000000-0000-4000-8000-0000000000a1';
const SESSION_ID = '00000000-0000-4000-8000-0000000000b1';
const TOPIC_ID = '00000000-0000-4000-8000-0000000000c1';

const LLM_SUMMARY = {
  narrative: 'Worked through fractions and compared equivalent forms.',
  topicsCovered: ['fractions'],
  sessionState: 'completed',
  reEntryRecommendation: 'Resume with one more equivalent-fractions example.',
};
const LEARNER_RECAP = 'You matched pictures to the fraction rule.';

/** Verbatim learner turn — must never appear in what is sent or stored. */
const RAW_LEARNER_TURN = 'i told my mum i think i have dyslexia';

interface FakeDbOptions {
  existingEmbedding?: { id: string };
  safetyFlaggedAt?: Date | null;
  summaryRow?: Record<string, unknown>;
}

function createHandlerDb(options: FakeDbOptions = {}) {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = jest.fn().mockReturnValue({ values });

  const db = {
    query: {
      sessionEmbeddings: {
        findFirst: jest.fn().mockResolvedValue(options.existingEmbedding),
      },
      learningSessions: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            safetyFlaggedAt: options.safetyFlaggedAt ?? null,
          }),
      },
      sessionSummaries: {
        findFirst: jest.fn().mockResolvedValue(
          'summaryRow' in options
            ? options.summaryRow
            : {
                topicId: TOPIC_ID,
                llmSummary: LLM_SUMMARY,
                learnerRecap: LEARNER_RECAP,
                purgedAt: null,
              },
        ),
      },
      // isLlmExchangeConsentAllowed reads these; all-undefined = allowed.
      membership: { findFirst: jest.fn().mockResolvedValue(undefined) },
      consentGrant: { findFirst: jest.fn().mockResolvedValue(undefined) },
      consentRequest: { findFirst: jest.fn().mockResolvedValue(undefined) },
    },
    insert,
  } as unknown as Database;

  return { db, insert, values, onConflictDoUpdate };
}

async function runHandler(data: unknown) {
  const runner = createInngestStepRunner();
  const handler = (
    sessionEmbeddingBackfill as unknown as {
      fn: (ctx: unknown) => Promise<unknown>;
    }
  ).fn;
  const result = await handler({
    event: { name: 'app/session.embedding.backfill', data },
    step: runner.step,
  });
  return { result: result as { status: string }, runner };
}

beforeAll(() => {
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    // Hostname-exact, never a prefix: `startsWith` on the origin would also
    // match a lookalike such as `api.voyageai.com.evil.test`.
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
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  voyageBodies.length = 0;
  mockGetStepVoyageApiKey.mockReturnValue('voyage-wi3141-test-key');
});

describe('sessionEmbeddingBackfillCron', () => {
  it('runs at 04:30 UTC — after summary reconciliation (04:00), before the transcript purge (05:00)', () => {
    const triggers = (
      sessionEmbeddingBackfillCron as unknown as {
        opts: { triggers: unknown[] };
      }
    ).opts.triggers;
    expect(triggers).toEqual([{ cron: '30 4 * * *' }]);
  });

  it('fans out one backfill event per complete-but-unembedded session', async () => {
    const rows = [
      { sessionId: SESSION_ID, profileId: PROFILE_ID, topicId: TOPIC_ID },
    ];
    const limit = jest.fn().mockResolvedValue(rows);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const leftJoin = jest.fn().mockReturnValue({ where });
    const innerJoin = jest.fn().mockReturnValue({ leftJoin });
    const from = jest.fn().mockReturnValue({ innerJoin });
    mockGetStepDatabase.mockReturnValue({
      select: jest.fn().mockReturnValue({ from }),
    });

    const runner = createInngestStepRunner();
    const handler = (
      sessionEmbeddingBackfillCron as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    const result = (await handler({ step: runner.step })) as {
      status: string;
      queued: number;
    };

    expect(result).toEqual({ status: 'completed', queued: 1 });
    expect(
      runner.sendEventPayloads('fan-out-session-embedding-backfill'),
    ).toEqual([
      [
        expect.objectContaining({
          name: 'app/session.embedding.backfill',
          data: expect.objectContaining({
            sessionId: SESSION_ID,
            profileId: PROFILE_ID,
            topicId: TOPIC_ID,
          }),
        }),
      ],
    ]);
  });

  it('dispatches nothing when every session is already embedded', async () => {
    const limit = jest.fn().mockResolvedValue([]);
    const orderBy = jest.fn().mockReturnValue({ limit });
    const where = jest.fn().mockReturnValue({ orderBy });
    const leftJoin = jest.fn().mockReturnValue({ where });
    const innerJoin = jest.fn().mockReturnValue({ leftJoin });
    const from = jest.fn().mockReturnValue({ innerJoin });
    mockGetStepDatabase.mockReturnValue({
      select: jest.fn().mockReturnValue({ from }),
    });

    const runner = createInngestStepRunner();
    const handler = (
      sessionEmbeddingBackfillCron as unknown as {
        fn: (ctx: unknown) => Promise<unknown>;
      }
    ).fn;
    const result = await handler({ step: runner.step });

    expect(result).toEqual({ status: 'completed', queued: 0 });
    expect(runner.sendEventCalls).toHaveLength(0);
  });
});

describe('sessionEmbeddingBackfill handler', () => {
  it('writes the summary-safe text and sends only that text to Voyage', async () => {
    const { db, values } = createHandlerDb();
    mockGetStepDatabase.mockReturnValue(db);

    const { result } = await runHandler({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
    });

    expect(result.status).toBe('embedded');
    const written = values.mock.calls[0]?.[0] as { content: string };
    expect(written.content).toContain('Narrative: Worked through fractions');
    expect(written.content).toContain('Learner recap: You matched pictures');
    expect(written.content).not.toContain(RAW_LEARNER_TURN);
    expect(voyageBodies).toHaveLength(1);
    expect(voyageBodies[0]).not.toContain(RAW_LEARNER_TURN);
  });

  it('[BREAK] refuses a safety-flagged session — no Voyage call, no write', async () => {
    const { db, insert } = createHandlerDb({ safetyFlaggedAt: new Date() });
    mockGetStepDatabase.mockReturnValue(db);

    const { result } = await runHandler({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
    });

    expect(result.status).toBe('skipped_safety_flagged');
    expect(insert).not.toHaveBeenCalled();
    expect(voyageBodies).toHaveLength(0);
  });

  it('[BREAK] still fails closed when the summary is not repaired yet', async () => {
    const { db, insert } = createHandlerDb({
      summaryRow: {
        topicId: null,
        llmSummary: null,
        learnerRecap: LEARNER_RECAP,
        purgedAt: null,
      },
    });
    mockGetStepDatabase.mockReturnValue(db);

    const { result } = await runHandler({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
    });

    expect(result).toEqual({
      status: 'skipped_summary_unavailable',
      reason: 'missing_llm_summary',
    });
    expect(insert).not.toHaveBeenCalled();
    expect(voyageBodies).toHaveLength(0);
  });

  it('skips a session that already has an embedding row', async () => {
    const { db, insert } = createHandlerDb({
      existingEmbedding: { id: 'embedding-1' },
    });
    mockGetStepDatabase.mockReturnValue(db);

    const { result } = await runHandler({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
    });

    expect(result.status).toBe('skipped_already_embedded');
    expect(insert).not.toHaveBeenCalled();
    expect(voyageBodies).toHaveLength(0);
  });

  it('rejects a malformed payload without retrying', async () => {
    mockGetStepDatabase.mockReturnValue(createHandlerDb().db);

    await expect(
      runHandler({ profileId: 'not-a-uuid', sessionId: SESSION_ID }),
    ).rejects.toThrow(/invalid payload/);
  });
});
