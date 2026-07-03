import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  createDatabase,
  generateUUIDv7,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { and, eq } from 'drizzle-orm';
import type { ChatMessage, LLMProvider, ModelConfig } from './llm';
import { _resetCircuits, registerProvider, unregisterProvider } from './llm';
import {
  deleteV2IdentitiesForTest,
  ensureV2IdentityForLegacyProfileTest,
} from '../test-utils/legacy-identity-anchors';

import {
  closeSession,
  getSessionSummary,
  skipSummary,
  startSession,
  submitSummary,
} from './session';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;
let llmResponse = '';
const llmProviderCalls: Array<{
  messages: ChatMessage[];
  config: ModelConfig;
}> = [];

const RUN_ID = generateUUIDv7();
let seedCounter = 0;
// [WI-1128] Legacy `accounts`/`profiles` dropped — track seeded ids for v2 cleanup.
const seededAccountIds: string[] = [];
const seededProfileIds: string[] = [];

function createSessionSummaryProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(messages: ChatMessage[], config: ModelConfig) {
      llmProviderCalls.push({ messages, config });
      return { content: llmResponse, stopReason: 'stop' };
    },
    chatStream() {
      throw new Error('session summary integration test does not stream');
    },
  };
}

async function seedProfile(): Promise<{
  accountId: string;
  profileId: string;
}> {
  const idx = ++seedCounter;
  const clerkUserId = `clerk_session_summary_${RUN_ID}_${idx}`;
  const email = `session-summary-${RUN_ID}-${idx}@test.invalid`;
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();

  await ensureV2IdentityForLegacyProfileTest(db, {
    accountId,
    profileId,
    clerkUserId,
    email,
    displayName: 'Summary Learner',
    birthYear: 2011,
    isOwner: true,
  });

  seededAccountIds.push(accountId);
  seededProfileIds.push(profileId);

  return { accountId, profileId };
}

async function seedSubject(profileId: string): Promise<string> {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name: 'Science',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  return subject!.id;
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for session summary integration tests',
    );
  }

  db = createDatabase(databaseUrl);
  unregisterProvider('gemini');
  _resetCircuits();
  registerProvider(createSessionSummaryProvider());
});

beforeEach(() => {
  llmProviderCalls.length = 0;
  _resetCircuits();
  llmResponse = JSON.stringify({
    feedback: 'Great summary! You captured the key idea.',
    hasUnderstandingGaps: false,
    gapAreas: [],
    isAccepted: true,
  });
});

afterAll(async () => {
  await deleteV2IdentitiesForTest(db, {
    accountIds: seededAccountIds,
    profileIds: seededProfileIds,
  });
  unregisterProvider('gemini');
  _resetCircuits();
});

describe('session summary integration', () => {
  it('returns null when no session summary exists yet', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });
    const summary = await getSessionSummary(db, profileId, session.id);

    expect(summary).toBeNull();
  });

  it('creates a skipped summary and increments consecutive skip tracking once', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });

    const firstResult = await skipSummary(db, profileId, session.id);
    const secondResult = await skipSummary(db, profileId, session.id);

    expect(firstResult.summary.status).toBe('skipped');
    expect(secondResult.summary.status).toBe('skipped');
  });

  it('returns an existing submitted summary unchanged when skipping later', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await db.insert(sessionSummaries).values({
      sessionId: session.id,
      profileId,
      status: 'submitted',
      content: 'Already written',
      aiFeedback: 'Nice work',
    });

    const result = await skipSummary(db, profileId, session.id);

    expect(result).toEqual({
      summary: {
        id: result.summary.id,
        sessionId: session.id,
        content: 'Already written',
        aiFeedback: 'Nice work',
        status: 'submitted',
      },
    });
  });

  it('[WI-247] short-circuits when summary already accepted; LLM is not called on replay', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });

    // First submit: LLM is called once and the row becomes `accepted`.
    const first = await submitSummary(db, profileId, session.id, {
      content: 'Photosynthesis turns sunlight into food.',
    });
    expect(first.summary.status).toBe('accepted');
    expect(llmProviderCalls).toHaveLength(1);

    // Second submit: existing accepted row → short-circuit, no LLM call.
    const second = await submitSummary(db, profileId, session.id, {
      content: 'A completely different and shorter summary.',
    });
    expect(second.summary.status).toBe('accepted');
    expect(second.summary.id).toBe(first.summary.id);
    // Original content preserved — short-circuit does not overwrite.
    expect(second.summary.content).toBe(
      'Photosynthesis turns sunlight into food.',
    );
    expect(llmProviderCalls).toHaveLength(1);
  });

  it('evaluates and stores a submitted summary', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, {
      subjectId,
      sessionType: 'learning',
      inputMode: 'text',
    });

    await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });

    const result = await submitSummary(db, profileId, session.id, {
      content:
        'Plants use sunlight, water, and carbon dioxide to make the food they need.',
    });

    const storedSummary = await db.query.sessionSummaries.findFirst({
      where: and(
        eq(sessionSummaries.sessionId, session.id),
        eq(sessionSummaries.profileId, profileId),
      ),
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        sessionId: session.id,
        status: 'accepted',
        aiFeedback: 'Great summary! You captured the key idea.',
      }),
    );
    expect(storedSummary).toEqual(
      expect.objectContaining({
        content:
          'Plants use sunlight, water, and carbon dioxide to make the food they need.',
        aiFeedback: 'Great summary! You captured the key idea.',
        status: 'accepted',
      }),
    );
    expect(llmProviderCalls).toHaveLength(1);
    expect(llmProviderCalls[0]!.config.model).toBe('gemini-2.5-flash');
    expect(llmProviderCalls[0]!.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('summary evaluator'),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining(
            '<topic_title>Science</topic_title>',
          ),
        }),
      ]),
    );
    const userPrompt = llmProviderCalls[0]!.messages.find(
      (message) => message.role === 'user',
    )!.content;
    expect(userPrompt).toContain(
      '<learner_summary>Plants use sunlight, water, and carbon dioxide to make the food they need.</learner_summary>',
    );
  });
});
