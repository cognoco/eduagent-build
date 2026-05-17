import { resolve } from 'path';
import { eq, like } from 'drizzle-orm';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  accounts,
  createDatabase,
  curriculumBooks,
  curriculumTopics,
  curricula,
  generateUUIDv7,
  profiles,
  subjects,
  type Database,
} from '@eduagent/database';
import * as llm from '../../services/llm';
import { subjectPrewarmCurriculum } from './subject-prewarm-curriculum';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

let db: Database;

const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_spc_integ_${RUN_ID}`;
let seedCounter = 0;

const BOOK_TOPIC_RESPONSE = JSON.stringify({
  topics: [
    {
      title: 'Tea Plant Basics',
      description: 'How tea plants grow and are cultivated',
      chapter: 'Foundations',
      sortOrder: 0,
      estimatedMinutes: 30,
    },
    {
      title: 'Leaves and Processing',
      description: 'How leaves become different kinds of tea',
      chapter: 'Production',
      sortOrder: 1,
      estimatedMinutes: 30,
    },
    {
      title: 'Tea Types',
      description: 'How black, green, white, and oolong teas differ',
      chapter: 'Production',
      sortOrder: 2,
      estimatedMinutes: 25,
    },
    {
      title: 'Brewing Choices',
      description: 'How water temperature and steeping time affect flavor',
      chapter: 'Preparation',
      sortOrder: 3,
      estimatedMinutes: 20,
    },
    {
      title: 'Tea Around the World',
      description: 'How tea is used in different places and traditions',
      chapter: 'Culture',
      sortOrder: 4,
      estimatedMinutes: 25,
    },
  ],
  connections: [
    { topicA: 'Tea Plant Basics', topicB: 'Leaves and Processing' },
    { topicA: 'Leaves and Processing', topicB: 'Tea Types' },
    { topicA: 'Tea Types', topicB: 'Brewing Choices' },
  ],
});

async function seedAccount(): Promise<{ accountId: string }> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `${CLERK_PREFIX}_${idx}`,
      email: `spc-integ-${RUN_ID}-${idx}@test.invalid`,
    })
    .returning({ id: accounts.id });
  return { accountId: account!.id };
}

async function seedProfile(accountId: string): Promise<{ profileId: string }> {
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: 'Test User',
      birthYear: new Date().getUTCFullYear() - 12,
      isOwner: true,
    })
    .returning({ id: profiles.id });
  return { profileId: profile!.id };
}

async function seedSubject(profileId: string): Promise<{ subjectId: string }> {
  const [subject] = await db
    .insert(subjects)
    .values({ profileId, name: 'Botany' })
    .returning({ id: subjects.id });
  return { subjectId: subject!.id };
}

async function seedFocusedBook(subjectId: string): Promise<{ bookId: string }> {
  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: 'Tea',
      description: 'The tea plant and drink',
      sortOrder: 1,
      topicsGenerated: false,
    })
    .returning({ id: curriculumBooks.id });
  return { bookId: book!.id };
}

function makeStep() {
  return {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function getHandler() {
  return (subjectPrewarmCurriculum as any).fn as (ctx: {
    event: { data: Record<string, unknown> };
    step: ReturnType<typeof makeStep>;
  }) => Promise<unknown>;
}

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set for subject-prewarm-curriculum integration tests',
    );
  }
  db = createDatabase(databaseUrl);
}, 30_000);

afterAll(async () => {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
}, 30_000);

describe('subject-prewarm-curriculum integration', () => {
  let routeAndCallSpy: jest.SpiedFunction<typeof llm.routeAndCall>;

  beforeEach(() => {
    routeAndCallSpy = jest.spyOn(llm, 'routeAndCall').mockResolvedValue({
      response: BOOK_TOPIC_RESPONSE,
      provider: 'test',
      model: 'fixture',
      latencyMs: 1,
      stopReason: 'stop',
    });
  });

  afterEach(() => {
    routeAndCallSpy.mockRestore();
  });

  it('rejects a cross-profile event with book-profile-mismatch (IDOR break test)', async () => {
    const { accountId: acctA } = await seedAccount();
    const { profileId: profileIdA } = await seedProfile(acctA);

    const { accountId: acctB } = await seedAccount();
    const { profileId: profileIdB } = await seedProfile(acctB);
    const { subjectId: subjectIdB } = await seedSubject(profileIdB);
    const { bookId: bookIdB } = await seedFocusedBook(subjectIdB);

    const step = makeStep();

    await expect(
      getHandler()({
        event: {
          data: {
            version: 1,
            profileId: profileIdA,
            subjectId: subjectIdB,
            bookId: bookIdB,
            timestamp: new Date().toISOString(),
          },
        },
        step,
      }),
    ).rejects.toThrow('book-profile-mismatch');
  });

  it('persists topics and marks the focused book generated', async () => {
    const { accountId } = await seedAccount();
    const { profileId } = await seedProfile(accountId);
    const { subjectId } = await seedSubject(profileId);
    const { bookId } = await seedFocusedBook(subjectId);
    const step = makeStep();

    await getHandler()({
      event: {
        data: {
          version: 1,
          profileId,
          subjectId,
          bookId,
          timestamp: new Date().toISOString(),
        },
      },
      step,
    });

    expect(routeAndCallSpy).toHaveBeenCalledTimes(1);
    const book = await db.query.curriculumBooks.findFirst({
      where: eq(curriculumBooks.id, bookId),
    });
    expect(book?.topicsGenerated).toBe(true);

    const curriculum = await db.query.curricula.findFirst({
      where: eq(curricula.subjectId, subjectId),
    });
    expect(curriculum).toBeDefined();

    const topics = await db.query.curriculumTopics.findMany({
      where: eq(curriculumTopics.bookId, bookId),
    });
    expect(
      topics
        .map((topic: typeof curriculumTopics.$inferSelect) => topic.title)
        .sort(),
    ).toEqual([
      'Brewing Choices',
      'Leaves and Processing',
      'Tea Around the World',
      'Tea Plant Basics',
      'Tea Types',
    ]);
    expect(step.sendEvent).toHaveBeenCalledWith('emit-topics-generated', {
      name: 'app/book.topics-generated',
      data: { subjectId, bookId, profileId },
    });
  });
});
