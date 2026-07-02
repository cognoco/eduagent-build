// ---------------------------------------------------------------------------
// Pure resolver for the post-display suitability-judge dispatch decision
// (MMT-ADR-0016 §3/§7 phase 4). Gating + payload shaping only — no I/O.
// ---------------------------------------------------------------------------

import { resolveSuitabilityJudgeDispatch } from './judge-dispatch';

// Birth years chosen far from the 13/18 boundaries so the age-bracket mapping
// is stable across calendar years (computeAgeBracket uses the real current year).
const ADULT_BIRTH_YEAR = 1990; // unambiguously 18+
const ADOLESCENT_BIRTH_YEAR = 2011; // 13–17 for several years around 2026
const CHILD_BIRTH_YEAR = 2020; // under 13

function baseInput() {
  return {
    enabled: true,
    profileId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    replyEventId: '33333333-3333-4333-8333-333333333333',
    precedingLearnerMessageEventId: '44444444-4444-4444-8444-444444444444',
    birthYear: ADULT_BIRTH_YEAR,
    tutorVendor: 'gemini',
    tutorModel: 'gemini-2.5-flash',
    flow: 'exchange',
    conversationLanguage: 'en' as const,
    rng: 0.0, // always within any non-zero sampling rate
    timestamp: '2026-06-24T00:00:00.000Z',
  };
}

describe('resolveSuitabilityJudgeDispatch', () => {
  it('returns null when the flag is disabled', () => {
    expect(
      resolveSuitabilityJudgeDispatch({ ...baseInput(), enabled: false }),
    ).toBeNull();
  });

  it('returns null when there is no persisted reply event id (no PII-safe ref)', () => {
    expect(
      resolveSuitabilityJudgeDispatch({
        ...baseInput(),
        replyEventId: undefined,
      }),
    ).toBeNull();
  });

  it('returns null when the tutor vendor is missing', () => {
    expect(
      resolveSuitabilityJudgeDispatch({
        ...baseInput(),
        tutorVendor: undefined,
      }),
    ).toBeNull();
  });

  it('returns null when the tutor model is missing', () => {
    expect(
      resolveSuitabilityJudgeDispatch({
        ...baseInput(),
        tutorModel: undefined,
      }),
    ).toBeNull();
  });

  it('builds the event payload for an adult drawn within the sampling rate', () => {
    const event = resolveSuitabilityJudgeDispatch({
      ...baseInput(),
      birthYear: ADULT_BIRTH_YEAR,
      rng: 0.05, // < 0.1 adult sampling
    });

    expect(event).toEqual({
      profileId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      replyEventId: '33333333-3333-4333-8333-333333333333',
      precedingLearnerMessageEventId: '44444444-4444-4444-8444-444444444444',
      ageBracket: 'adult',
      tutorVendor: 'gemini',
      tutorModel: 'gemini-2.5-flash',
      flow: 'exchange',
      conversationLanguage: 'en',
      timestamp: '2026-06-24T00:00:00.000Z',
    });
  });

  it('returns null for an adult drawn outside the sampling rate', () => {
    expect(
      resolveSuitabilityJudgeDispatch({
        ...baseInput(),
        birthYear: ADULT_BIRTH_YEAR,
        rng: 0.5, // >= 0.1 adult sampling
      }),
    ).toBeNull();
  });

  it('always judges an adolescent (full minor coverage) even at a high draw', () => {
    const event = resolveSuitabilityJudgeDispatch({
      ...baseInput(),
      birthYear: ADOLESCENT_BIRTH_YEAR,
      rng: 0.99,
    });
    expect(event).toMatchObject({ ageBracket: 'adolescent' });
  });

  it('always judges a child (full minor coverage) even at a high draw', () => {
    const event = resolveSuitabilityJudgeDispatch({
      ...baseInput(),
      birthYear: CHILD_BIRTH_YEAR,
      rng: 0.99,
    });
    expect(event).toMatchObject({ ageBracket: 'child' });
  });

  it('treats unknown age as a minor (full coverage) and tags the payload child', () => {
    const event = resolveSuitabilityJudgeDispatch({
      ...baseInput(),
      birthYear: null,
      rng: 0.99,
    });
    expect(event).toMatchObject({ ageBracket: 'child' });
  });

  it('[WI-367] uses the exact birth date to catch a still-17 draw that year-only would read as adult (full coverage, not sampled)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
    try {
      // Year-only (2026 - 2008 = 18) would read 'adult' → 10% sampling, and
      // this high draw would be dropped. Exact date (birthday June 15 not
      // yet reached on March 1) is still 17 → 'adolescent' → full coverage.
      const event = resolveSuitabilityJudgeDispatch({
        ...baseInput(),
        birthYear: 2008,
        birthMonth: 6,
        birthDay: 15,
        rng: 0.99,
      });
      expect(event).toMatchObject({ ageBracket: 'adolescent' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('carries a null preceding-message id when none was persisted', () => {
    const event = resolveSuitabilityJudgeDispatch({
      ...baseInput(),
      precedingLearnerMessageEventId: undefined,
    });
    expect(event?.precedingLearnerMessageEventId).toBeNull();
  });

  it('omits conversationLanguage from the payload when not provided', () => {
    const { conversationLanguage: _omit, ...rest } = baseInput();
    const event = resolveSuitabilityJudgeDispatch(rest);
    expect(event).not.toBeNull();
    expect(event && 'conversationLanguage' in event).toBe(false);
  });
});
