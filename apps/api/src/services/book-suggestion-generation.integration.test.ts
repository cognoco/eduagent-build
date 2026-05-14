import { resolve } from 'path';

import { eq, and, isNull, like } from 'drizzle-orm';
import {
  accounts,
  profiles,
  subjects,
  bookSuggestions,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';

import { registerLlmProviderFixture } from '../test-utils/llm-provider-fixtures';
import { _resetCircuits } from './llm';
import { generateCategorizedBookSuggestions } from './book-suggestion-generation';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integ-bsg';
let counter = 0;

const db = createIntegrationDb();
const llmFixture = registerLlmProviderFixture();

async function seedProfile() {
  counter++;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${PREFIX}-${counter}-${Date.now()}`,
      email: `${PREFIX}-${counter}-${Date.now()}@integration.test`,
    })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Test Profile ${counter}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  return profile!;
}

async function seedSubject(profileId: string, name: string) {
  const [subject] = await db
    .insert(subjects)
    .values({
      profileId,
      name,
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning();
  return subject!;
}

async function cleanup() {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(like(accounts.clerkUserId, `${PREFIX}%`));
  if (rows.length > 0) {
    await db.delete(accounts).where(like(accounts.clerkUserId, `${PREFIX}%`));
  }
}

const FOUR_SUGGESTIONS = {
  response: JSON.stringify({
    suggestions: [
      {
        title: 'Mesopotamia',
        description: 'd',
        emoji: '🏺',
        category: 'related',
      },
      {
        title: 'Ancient Egypt',
        description: 'd',
        emoji: '🐫',
        category: 'related',
      },
      {
        title: 'Bronze Age Aegean',
        description: 'd',
        emoji: '⚱️',
        category: 'explore',
      },
      {
        title: 'Phoenician Trade',
        description: 'd',
        emoji: '⛵',
        category: 'explore',
      },
    ],
  }),
};

describe('generateCategorizedBookSuggestions — integration', () => {
  beforeEach(async () => {
    _resetCircuits();
    llmFixture.clearCalls();
    llmFixture.clearChatError();
    llmFixture.setChatResponse(JSON.parse(FOUR_SUGGESTIONS.response));
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    llmFixture.dispose();
    _resetCircuits();
  });

  it('two parallel calls produce exactly one LLM call and 4 inserts', async () => {
    const profile = await seedProfile();
    const subject = await seedSubject(profile.id, 'History');

    await Promise.all([
      generateCategorizedBookSuggestions(db, profile.id, subject.id),
      generateCategorizedBookSuggestions(db, profile.id, subject.id),
    ]);

    expect(llmFixture.chatCalls).toHaveLength(1);

    const rows = await db
      .select()
      .from(bookSuggestions)
      .where(
        and(
          eq(bookSuggestions.subjectId, subject.id),
          isNull(bookSuggestions.pickedAt),
        ),
      );
    expect(rows).toHaveLength(4);
  });

  it('cool-down blocks a second call within 5 minutes', async () => {
    const profile = await seedProfile();
    const subject = await seedSubject(profile.id, 'Biology');

    llmFixture.setChatError(new Error('quota exceeded'));
    await generateCategorizedBookSuggestions(db, profile.id, subject.id);

    llmFixture.clearCalls();
    llmFixture.clearChatError();
    llmFixture.setChatResponse({ suggestions: [] });
    await generateCategorizedBookSuggestions(db, profile.id, subject.id);

    expect(llmFixture.chatCalls).toHaveLength(0);
  });

  it('does not generate or insert for a subject owned by another profile', async () => {
    const owner = await seedProfile();
    const other = await seedProfile();
    const subject = await seedSubject(owner.id, 'Physics');

    await generateCategorizedBookSuggestions(db, other.id, subject.id);

    expect(llmFixture.chatCalls).toHaveLength(0);
    const rows = await db
      .select()
      .from(bookSuggestions)
      .where(eq(bookSuggestions.subjectId, subject.id));
    expect(rows).toHaveLength(0);
  });
});
