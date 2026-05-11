import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  learningModes,
  profiles,
  sessionSummaries,
  subjects,
  type Database,
} from '@eduagent/database';
import { and, eq, like } from 'drizzle-orm';
import type { ChatMessage, LLMProvider, ModelConfig } from './llm';
import { _clearProviders, _resetCircuits, registerProvider } from './llm';

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

function createSessionSummaryProvider(): LLMProvider {
  return {
    id: 'gemini',
    async chat(messages, config) {
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

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: 'Summary Learner',
      birthYear: 2011,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
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
  _clearProviders();
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
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_session_summary_${RUN_ID}%`));
  _clearProviders();
  _resetCircuits();
});

describe('session summary integration', () => {
  it('returns null when no session summary exists yet', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);

    const session = await startSession(db, profileId, subjectId, { subjectId });
    const summary = await getSessionSummary(db, profileId, session.id);

    expect(summary).toBeNull();
  });

  it('creates a skipped summary and increments consecutive skip tracking once', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, { subjectId });

    await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });

    const firstResult = await skipSummary(db, profileId, session.id);
    const secondResult = await skipSummary(db, profileId, session.id);
    const learningModeRow = await db.query.learningModes.findFirst({
      where: eq(learningModes.profileId, profileId),
    });

    expect(firstResult.summary.status).toBe('skipped');
    expect(secondResult.summary.status).toBe('skipped');
    expect(learningModeRow?.consecutiveSummarySkips).toBe(1);
  });

  it('returns an existing submitted summary unchanged when skipping later', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, { subjectId });

    await db.insert(sessionSummaries).values({
      sessionId: session.id,
      profileId,
      status: 'submitted',
      content: 'Already written',
      aiFeedback: 'Nice work',
    });

    const result = await skipSummary(db, profileId, session.id);
    const learningModeRow = await db.query.learningModes.findFirst({
      where: eq(learningModes.profileId, profileId),
    });

    expect(result).toEqual({
      summary: {
        id: result.summary.id,
        sessionId: session.id,
        content: 'Already written',
        aiFeedback: 'Nice work',
        status: 'submitted',
      },
    });
    expect(learningModeRow).toBeUndefined();
  });

  it('evaluates and stores a submitted summary, then resets consecutive skips', async () => {
    const { profileId } = await seedProfile();
    const subjectId = await seedSubject(profileId);
    const session = await startSession(db, profileId, subjectId, { subjectId });

    await closeSession(db, profileId, session.id, {
      reason: 'user_ended',
      summaryStatus: 'pending',
    });
    await db.insert(learningModes).values({
      profileId,
      mode: 'serious',
      consecutiveSummarySkips: 3,
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
    const learningModeRow = await db.query.learningModes.findFirst({
      where: eq(learningModes.profileId, profileId),
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
    expect(learningModeRow?.consecutiveSummarySkips).toBe(0);
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
