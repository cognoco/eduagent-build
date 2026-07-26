import { z } from 'zod';

import {
  mentorNoticeDeferResponseSchema,
  mentorNoticeNudgeStatusSchema,
  mentorNoticePolicyObservationSchema,
  mentorNoticeRecheckOutcomeSchema,
  mentorNoticeRecheckResponseSchema,
  mentorNoticeSchema,
  mentorNoticeStatusSchema,
} from './mentor-notices.js';
import { nowOverflowResponseSchema, nowResponseSchema } from './now-feed.js';
import {
  messageResultSchema,
  sessionSummaryGetResponseSchema,
} from './sessions.js';

const ids = {
  notice: '00000000-0000-4000-8000-000000000001',
  profile: '00000000-0000-4000-8000-000000000002',
  subject: '00000000-0000-4000-8000-000000000003',
  session: '00000000-0000-4000-8000-000000000004',
};

describe('mentor notice schemas', () => {
  it('pins lifecycle values including non-terminal deferral', () => {
    expect(mentorNoticeStatusSchema.options).toEqual([
      'open',
      'locked_in',
      'dismissed',
      'faded',
      'not_yet',
    ]);
    expect(mentorNoticeNudgeStatusSchema.options).toEqual([
      'pending',
      'sent',
      'skipped',
      'suppressed',
    ]);
    expect(mentorNoticeRecheckOutcomeSchema.options).toEqual([
      'locked_in',
      'not_yet',
      'dismissed',
      'deferred',
    ]);
  });

  it('parses a topicless open notice with nullable lifecycle timestamps', () => {
    const parsed = mentorNoticeSchema.parse({
      id: ids.notice,
      profileId: ids.profile,
      subjectId: ids.subject,
      topicId: null,
      sourceSessionId: ids.session,
      concept: 'Sign changes when moving terms',
      correctionHint: null,
      status: 'open',
      lastOfferedSessionId: null,
      lastOfferedAt: null,
      lastDeferredAt: null,
      offerCount: 0,
      recheckAttemptCount: 0,
      firstRecheckAt: null,
      lastRecheckAt: null,
      lastRecheckOutcome: null,
      nudgeStatus: 'pending',
      nudgedAt: null,
      createdAt: '2026-07-19T10:00:00.000Z',
      resolvedAt: null,
    });

    expect(parsed.topicId).toBeNull();
    expect(parsed.lastDeferredAt).toBeNull();
  });

  it('types idempotent re-check and same-day defer responses', () => {
    expect(
      mentorNoticeRecheckResponseSchema.parse({ sessionId: ids.session }),
    ).toEqual({ sessionId: ids.session });
    expect(
      mentorNoticeDeferResponseSchema.parse({
        noticeId: ids.notice,
        deferredAt: '2026-07-19T11:00:00.000Z',
      }),
    ).toEqual({
      noticeId: ids.notice,
      deferredAt: '2026-07-19T11:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-2627] The observation must SURVIVE the client-side parse.
//
// Emission and survival are different properties, and only survival is what the
// monotonic store depends on. A non-strict `z.object` does not throw on an
// unknown key — it STRIPS it — so a surface whose client contract omits the
// field receives a response that carried the observation and hands its consumer
// an object that does not. The server tests prove emission; these prove the
// field is still there after the exact schema the mobile client parses through.
//
// Client parse path per surface (verified in code, not assumed):
//   /now                  → nowResponseSchema                (now-feed.ts)
//   /now/overflow         → nowOverflowResponseSchema         (now-feed.ts)
//   GET summary           → sessionSummaryGetResponseSchema   (sessions.ts)
//   non-stream message    → messageResultSchema               (sessions.ts)
//   recheck / defer       → mentorNotice{Recheck,Defer}ResponseSchema
//   SSE done              → isValidStreamEvent in apps/mobile/src/lib/sse.ts,
//                           a positive check that yields `parsed as StreamEvent`
//                           with no reconstruction — so it survives THAT hop.
// ---------------------------------------------------------------------------
describe('[WI-2627] policy observation survives every notice-bearing client parse', () => {
  const OBSERVATION = {
    rolloutRevision: 4,
    rolloutEnabled: true,
    projectionEpoch: 'notice-policy-v1:r4:on:self:consented',
  };

  it('is a valid observation in its own right', () => {
    expect(mentorNoticePolicyObservationSchema.parse(OBSERVATION)).toEqual(
      OBSERVATION,
    );
  });

  it.each([
    [
      '/now',
      nowResponseSchema,
      {
        scope: 'self' as const,
        cards: [],
        overflowCount: 0,
        generatedAt: '2026-07-25T00:00:00.000Z',
      },
    ],
    [
      '/now/overflow',
      nowOverflowResponseSchema,
      { scope: 'self' as const, items: [] },
    ],
    [
      'GET /sessions/:id/summary',
      sessionSummaryGetResponseSchema,
      { summary: null },
    ],
    [
      'POST /sessions/:id/messages (non-streaming)',
      messageResultSchema,
      {
        response: 'Here is the next step.',
        escalationRung: 1,
        isUnderstandingCheck: false,
        exchangeCount: 2,
        expectedResponseMinutes: 3,
      },
    ],
    [
      'POST /mentor-notices/:id/recheck',
      mentorNoticeRecheckResponseSchema,
      { sessionId: ids.session },
    ],
    [
      'POST /mentor-notices/:id/defer',
      mentorNoticeDeferResponseSchema,
      { noticeId: ids.notice, deferredAt: '2026-07-19T11:00:00.000Z' },
    ],
  ])(
    '%s retains mentorNoticePolicy after parsing',
    (_surface, schema, base) => {
      const parsed = schema.parse({ ...base, mentorNoticePolicy: OBSERVATION });
      // The assertion that matters: the observation is present AND unmangled after
      // the parse. `toHaveProperty` alone would pass on a partially-stripped
      // object, so compare the whole value.
      expect(
        (parsed as { mentorNoticePolicy?: unknown }).mentorNoticePolicy,
      ).toEqual(OBSERVATION);
    },
  );

  // The failure mode this whole block exists to catch, stated as its own case:
  // a surface that omits the declaration parses SUCCESSFULLY and silently
  // returns an object without the field. Nothing throws — which is why only an
  // explicit survival assertion catches it.
  it('demonstrates the silent-strip failure mode a missing declaration produces', () => {
    const undeclared = z.object({ response: z.string() });
    const parsed = undeclared.parse({
      response: 'ok',
      mentorNoticePolicy: OBSERVATION,
    });
    expect(parsed).toEqual({ response: 'ok' });
    expect(parsed).not.toHaveProperty('mentorNoticePolicy');
  });
});
