/**
 * WI-620 break test (unit) — the learner's raw calibration answer / topic title
 * must NEVER land in the `app/review.calibration.requested` Inngest event
 * payload. The dispatch now carries only an opaque `learnerMessageEventId`
 * (a session_events row id); the consumer rehydrates the answer + title from
 * the DB scoped by profileId.
 *
 * This is the DB-free counterpart to the integration break test
 * (session-exchange-calibration-pii.integration.test.ts, which exercises the
 * same property against a real seeded Neon row in CI's integration lane). It
 * stubs the `db` dependency the dispatcher receives as a parameter — NOT a
 * jest.mock of an internal module — so the real payload-construction code path
 * runs and the captured inngest.send payload can be asserted.
 *
 * Red-green-REVERT: with the fix the dispatched payload carries no sentinel and
 * has no learnerMessage/topicTitle key; reverting the session-exchange.ts
 * payload build (raw text back) re-introduces the sentinel and fails the
 * "never lands in the payload" assertion.
 */
import { inngest } from '../../inngest/client';
import { maybeDispatchReviewCalibration } from './session-exchange';

// A "known minor identifier" in the bundle-AC sense: raw learner free-text and
// a topic title that must never reach the third-party event store.
const LEARNER_SENTINEL = 'MiloJanssenDrammen-answer';
const TOPIC_SENTINEL = 'Photosynthesis-Milo-title';
const LEARNER_MESSAGE_EVENT_ID = '00000000-0000-4000-8000-0000000000aa';
const SESSION_ID = '00000000-0000-4000-8000-0000000000bb';
const PROFILE_ID = '00000000-0000-4000-8000-0000000000cc';
const TOPIC_ID = '00000000-0000-4000-8000-0000000000dd';

// Minimal chainable stub for the `db` the dispatcher receives. `transaction`
// invokes the callback with a `tx` whose select returns a metadata row with no
// prior `reviewCalibrationFiredAt` (so the dispatch is allowed to fire) and
// whose update is a no-op. This is a passed-in dependency, not an internal
// jest.mock.
function makeFakeDb() {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => ({
            limit: async () => [{ metadata: {} }],
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  };
  return {
    transaction: async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> =>
      fn(tx),
  } as unknown as Parameters<typeof maybeDispatchReviewCalibration>[0];
}

describe('maybeDispatchReviewCalibration WI-620 PII egress (unit)', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    sendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('[WI-620 break test] dispatched payload carries the opaque eventId, never the raw learner answer or topic title', async () => {
    await maybeDispatchReviewCalibration(
      makeFakeDb(),
      PROFILE_ID,
      { id: SESSION_ID, topicId: TOPIC_ID },
      'review',
      'en',
      // A substantive answer (>= 4 words, >= 18 chars) so the dispatch fires.
      `Plants make their own food using ${LEARNER_SENTINEL}`,
      TOPIC_SENTINEL,
      LEARNER_MESSAGE_EVENT_ID,
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

    // Opaque reference present; raw text/title absent.
    expect(payload.learnerMessageEventId).toBe(LEARNER_MESSAGE_EVENT_ID);
    expect(payload).not.toHaveProperty('learnerMessage');
    expect(payload).not.toHaveProperty('topicTitle');

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(LEARNER_SENTINEL);
    expect(serialized).not.toContain(TOPIC_SENTINEL);
  });

  it('[WI-620] skips the dispatch entirely when no persisted message id is available (no PII-safe reference)', async () => {
    await maybeDispatchReviewCalibration(
      makeFakeDb(),
      PROFILE_ID,
      { id: SESSION_ID, topicId: TOPIC_ID },
      'review',
      'en',
      `Plants make their own food using ${LEARNER_SENTINEL}`,
      TOPIC_SENTINEL,
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
