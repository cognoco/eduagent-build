/**
 * WI-620 break test (integration) — the learner's raw calibration answer /
 * topic title must never land in the `app/review.calibration.requested`
 * Inngest event payload (Inngest persists payloads in its third-party event
 * store). The dispatch was converted to the WI-577 reference-and-rehydrate
 * pattern: the payload carries only an opaque `learnerMessageEventId` (a
 * session_events row id); the consumer rehydrates the answer + title from the
 * DB scoped by profileId.
 *
 * Exercises the real egress path against a seeded row: minor profile + active
 * review session + persisted user_message → maybeDispatchReviewCalibration →
 * the captured inngest.send payload. The DB-free counterpart
 * (apps/api/src/services/session/session-exchange-calibration-pii.test.ts)
 * carries the red-green-REVERT proof; this one pins the property end-to-end.
 *
 * External boundary: inngest.send is spied (the event-store HTTP boundary).
 */
import { and, eq, like } from 'drizzle-orm';
import {
  accounts,
  curricula,
  curriculumBooks,
  curriculumTopics,
  generateUUIDv7,
  learningSessions,
  profiles,
  sessionEvents,
  subjects,
} from '@eduagent/database';

import { createIntegrationDb } from './helpers';
import { inngest } from '../../apps/api/src/inngest/client';
import { maybeDispatchReviewCalibration } from '../../apps/api/src/services/session/session-exchange';

const RUN_ID = generateUUIDv7();
let seedCounter = 0;

type IntegrationDb = ReturnType<typeof createIntegrationDb>;

async function seedReviewSession(
  db: IntegrationDb,
  input: { topicTitle: string; learnerMessage: string },
): Promise<{
  profileId: string;
  sessionId: string;
  topicId: string;
  learnerMessageEventId: string;
}> {
  const idx = ++seedCounter;
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `clerk_wi620_calib_${RUN_ID}_${idx}`,
      email: `wi620-calib-${RUN_ID}-${idx}@integration.test`,
    })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `WI620 Calibration ${idx}`,
      // 12 years old — minor (the PII-egress concern is under-18 learners).
      birthYear: new Date().getFullYear() - 12,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  const [subject] = await db
    .insert(subjects)
    .values({
      profileId: profile!.id,
      name: 'Biology',
      status: 'active',
      pedagogyMode: 'socratic',
    })
    .returning({ id: subjects.id });

  const [curriculum] = await db
    .insert(curricula)
    .values({ subjectId: subject!.id, version: 1 })
    .returning({ id: curricula.id });

  const [book] = await db
    .insert(curriculumBooks)
    .values({
      subjectId: subject!.id,
      title: 'Cell Energy Book',
      sortOrder: 0,
      topicsGenerated: true,
    })
    .returning({ id: curriculumBooks.id });

  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: curriculum!.id,
      bookId: book!.id,
      // Sentinel topic title — must not appear in the dispatched payload.
      title: input.topicTitle,
      description: 'Cell Energy description',
      sortOrder: 0,
      estimatedMinutes: 20,
      skipped: false,
    })
    .returning({ id: curriculumTopics.id });

  const [session] = await db
    .insert(learningSessions)
    .values({
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topic!.id,
      sessionType: 'learning',
      inputMode: 'text',
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      metadata: {},
    })
    .returning({ id: learningSessions.id });

  // The user message is persisted by the time the dispatch fires (the fix moved
  // the dispatch post-persist). Seed the row and reference its id.
  const [userEvent] = await db
    .insert(sessionEvents)
    .values({
      sessionId: session!.id,
      profileId: profile!.id,
      subjectId: subject!.id,
      topicId: topic!.id,
      eventType: 'user_message',
      content: input.learnerMessage,
    })
    .returning({ id: sessionEvents.id });

  return {
    profileId: profile!.id,
    sessionId: session!.id,
    topicId: topic!.id,
    learnerMessageEventId: userEvent!.id,
  };
}

describe('Integration: maybeDispatchReviewCalibration WI-620 PII egress', () => {
  let db: IntegrationDb;
  let sendSpy: jest.SpyInstance;

  beforeAll(() => {
    db = createIntegrationDb();
  });

  beforeEach(() => {
    sendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  afterAll(async () => {
    // ON DELETE CASCADE from accounts cleans the whole seeded chain.
    await db
      .delete(accounts)
      .where(like(accounts.clerkUserId, `clerk_wi620_calib_${RUN_ID}%`));
  });

  it('[WI-620 break test] dispatched payload carries the opaque eventId, never the raw learner answer or topic title', async () => {
    const learnerSentinel = `MiloJanssenDrammen-${RUN_ID}-answer`;
    const topicSentinel = `Photosynthesis-${RUN_ID}-title`;
    const seeded = await seedReviewSession(db, {
      topicTitle: topicSentinel,
      learnerMessage: `Plants make their own food using ${learnerSentinel}`,
    });

    await maybeDispatchReviewCalibration(
      db,
      seeded.profileId,
      { id: seeded.sessionId, topicId: seeded.topicId },
      'review',
      'en',
      `Plants make their own food using ${learnerSentinel}`,
      topicSentinel,
      seeded.learnerMessageEventId,
    );

    const calibrationCalls = sendSpy.mock.calls.filter(
      ([arg]) =>
        (arg as { name?: string } | undefined)?.name ===
        'app/review.calibration.requested',
    );
    expect(calibrationCalls).toHaveLength(1);

    const payload = (
      calibrationCalls[0]![0] as { data: Record<string, unknown> }
    ).data;

    expect(payload.learnerMessageEventId).toBe(seeded.learnerMessageEventId);
    expect(payload).not.toHaveProperty('learnerMessage');
    expect(payload).not.toHaveProperty('topicTitle');

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(learnerSentinel);
    expect(serialized).not.toContain(topicSentinel);

    // Sanity: the persisted row id resolves to the seeded user_message, scoped
    // by profileId — i.e. the opaque reference is rehydratable.
    const row = await db
      .select({ content: sessionEvents.content })
      .from(sessionEvents)
      .where(
        and(
          eq(sessionEvents.id, seeded.learnerMessageEventId),
          eq(sessionEvents.profileId, seeded.profileId),
        ),
      )
      .limit(1);
    expect(row[0]?.content).toContain(learnerSentinel);
  });

  it('[WI-620] skips the dispatch entirely when no persisted message id is available (no PII-safe reference)', async () => {
    const topicSentinel = `NoRef-${RUN_ID}-title`;
    const seeded = await seedReviewSession(db, {
      topicTitle: topicSentinel,
      learnerMessage: `Plants make their own food and energy here ${RUN_ID}`,
    });

    await maybeDispatchReviewCalibration(
      db,
      seeded.profileId,
      { id: seeded.sessionId, topicId: seeded.topicId },
      'review',
      'en',
      `Plants make their own food and energy here ${RUN_ID}`,
      topicSentinel,
      // No event id → must not dispatch (the only PII-safe carrier is missing).
      undefined,
    );

    expect(
      sendSpy.mock.calls.filter(
        ([arg]) =>
          (arg as { name?: string } | undefined)?.name ===
          'app/review.calibration.requested',
      ),
    ).toHaveLength(0);
  });
});
