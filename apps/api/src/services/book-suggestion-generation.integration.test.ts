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

async function waitForCooldownReservation(subjectId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [row] = await db
      .select({
        lastAttemptedAt: subjects.bookSuggestionsLastGenerationAttemptedAt,
      })
      .from(subjects)
      .where(eq(subjects.id, subjectId))
      .limit(1);
    if (row?.lastAttemptedAt) return;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error('Timed out waiting for cooldown reservation to commit.');
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

  // -------------------------------------------------------------------------
  // [WI-194] LLM call must run OUTSIDE the open DB transaction and outside
  // the advisory lock. With the previous tx-around-LLM shape, a 1s LLM call
  // would pin a DB connection and the advisory lock for ~1s — a sequential
  // second caller arriving 50ms after the first would NOT see the cooldown
  // (the reservation was inside an uncommitted tx) and would block on the
  // advisory lock until the first finished. After the refactor, the first
  // caller commits the cooldown reservation BEFORE starting the LLM call,
  // so a sequential second caller short-circuits on 'cooldown'.
  //
  // Mechanism: we wrap the fixture's chat() with a 250ms delay via a queued
  // delay marker. The first call enters the (slow) LLM phase; the second
  // call fires after a small delay; it must see the committed cooldown row
  // and exit BEFORE acquiring its own LLM connection.
  // -------------------------------------------------------------------------
  it('[WI-194] LLM call runs outside the open transaction — concurrent caller sees committed cooldown', async () => {
    const profile = await seedProfile();
    const subject = await seedSubject(profile.id, 'Astronomy');

    // Force a slow LLM via fixture: swap chat() to one that resolves after
    // 250ms. The fixture provider is registered as 'gemini' by default.
    const slowResponse = FOUR_SUGGESTIONS.response;
    const baseProvider = (
      llmFixture as unknown as {
        provider: { chat: (...args: unknown[]) => Promise<unknown> };
      }
    ).provider;
    const originalChat = baseProvider.chat.bind(baseProvider);
    baseProvider.chat = async (...args: unknown[]) => {
      await new Promise((res) => setTimeout(res, 250));
      return originalChat(...args);
    };
    llmFixture.setChatResponse(JSON.parse(slowResponse));

    let firstPromise:
      | ReturnType<typeof generateCategorizedBookSuggestions>
      | undefined;
    try {
      // Start first call — it enters Phase 1 (commits cooldown reservation),
      // then awaits the 250ms LLM call.
      firstPromise = generateCategorizedBookSuggestions(
        db,
        profile.id,
        subject.id,
      );

      await waitForCooldownReservation(subject.id);

      // Second call: should observe the committed cooldown reservation row
      // and exit early ('cooldown') without entering Phase 1.
      const secondOutcome = await generateCategorizedBookSuggestions(
        db,
        profile.id,
        subject.id,
      );
      expect(secondOutcome).toBe('cooldown');

      // First call eventually completes normally.
      const firstOutcome = await firstPromise;
      expect(firstOutcome).toBe('success');

      // Exactly one LLM call across both attempts.
      expect(llmFixture.chatCalls).toHaveLength(1);
    } finally {
      // Restore the original chat to avoid leaking the delay into other tests.
      baseProvider.chat = originalChat;
      await firstPromise?.catch(() => undefined);
    }
  }, 30_000);
});
