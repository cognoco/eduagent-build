import {
  mentorNoticeDeferResponseSchema,
  mentorNoticeNudgeStatusSchema,
  mentorNoticeRecheckOutcomeSchema,
  mentorNoticeRecheckResponseSchema,
  mentorNoticeSchema,
  mentorNoticeStatusSchema,
} from './mentor-notices.js';

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
