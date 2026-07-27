import { recapsResponseSchema } from './recaps.js';

const RECAP_LIST_ITEM = {
  recapId: '019e5e2c-7854-7976-a34e-0cacbb283254',
  sessionId: '33333333-3333-4333-8333-333333333333',
  childProfileId: '22222222-2222-4222-8222-222222222222',
  childDisplayName: 'Emma',
  subjectId: '44444444-4444-4444-8444-444444444444',
  subjectName: 'Maths',
  topicId: '55555555-5555-4555-8555-555555555555',
  topicTitle: 'Fractions',
  sessionType: 'learning',
  startedAt: '2026-05-20T10:00:00.000Z',
  endedAt: '2026-05-20T10:30:00.000Z',
  exchangeCount: 5,
  displayTitle: 'Maths session',
  displaySummary: 'Emma worked on fractions.',
  highlight: null,
  narrative: 'Emma had a great session on fractions.',
  conversationPrompt: null,
  engagementSignal: null,
};

describe('recapsResponseSchema', () => {
  it('distinguishes present, absent, and unavailable verified-proof lookups', () => {
    const availableProof = {
      topicId: '55555555-5555-4555-8555-555555555555',
      topicTitle: 'Fractions',
      subjectId: '44444444-4444-4444-8444-444444444444',
      verifiedAt: '2026-05-20T10:25:00.000Z',
      verificationState: 'fresh',
      retentionStatus: 'strong',
      nextReviewDate: '2026-05-27T10:25:00.000Z',
      evidenceAvailability: 'available',
      quote: 'Equivalent fractions name the same amount.',
    } as const;

    const parsed = recapsResponseSchema.parse({
      recaps: [
        {
          ...RECAP_LIST_ITEM,
          recapId: '11111111-1111-4111-8111-111111111111',
          verifiedProof: { status: 'present', proof: availableProof },
        },
        {
          ...RECAP_LIST_ITEM,
          recapId: '22222222-2222-4222-8222-222222222222',
          verifiedProof: { status: 'absent' },
        },
        {
          ...RECAP_LIST_ITEM,
          recapId: '33333333-3333-4333-8333-333333333333',
          verifiedProof: { status: 'unavailable' },
        },
        {
          ...RECAP_LIST_ITEM,
          recapId: '44444444-4444-4444-8444-444444444444',
          verifiedProof: {
            status: 'present',
            proof: {
              ...availableProof,
              evidenceAvailability: 'source_unavailable',
              quote: null,
            },
          },
        },
      ],
    });

    expect(parsed.recaps.map((recap) => recap.verifiedProof.status)).toEqual([
      'present',
      'absent',
      'unavailable',
      'present',
    ]);
    expect(parsed.recaps[0]?.verifiedProof).toEqual({
      status: 'present',
      proof: availableProof,
    });
    expect(parsed.recaps[3]?.verifiedProof).toMatchObject({
      status: 'present',
      proof: {
        evidenceAvailability: 'source_unavailable',
        quote: null,
      },
    });
  });

  it('defaults omitted additive fields for older recap responses', () => {
    const parsed = recapsResponseSchema.parse({
      recaps: [RECAP_LIST_ITEM],
    });

    expect(parsed.recaps[0]).toMatchObject({
      nextTopicTitle: null,
      nextTopicReason: null,
      verifiedProof: { status: 'absent' },
    });
  });

  it('round-trips an explicit absent verified-proof result', () => {
    const parsed = recapsResponseSchema.parse({
      recaps: [{ ...RECAP_LIST_ITEM, verifiedProof: { status: 'absent' } }],
    });

    expect(parsed.recaps[0]?.verifiedProof).toEqual({ status: 'absent' });
  });

  it('round-trips a populated verified-proof receipt', () => {
    const verifiedProof = {
      topicId: '55555555-5555-4555-8555-555555555555',
      topicTitle: 'Fractions',
      subjectId: '44444444-4444-4444-8444-444444444444',
      verifiedAt: '2026-05-20T10:25:00.000Z',
      verificationState: 'fresh',
      retentionStatus: 'strong',
      nextReviewDate: '2026-05-27T10:25:00.000Z',
      evidenceAvailability: 'available',
      quote: 'Equivalent fractions name the same amount.',
    } as const;

    const parsed = recapsResponseSchema.parse({
      recaps: [
        {
          ...RECAP_LIST_ITEM,
          verifiedProof: { status: 'present', proof: verifiedProof },
        },
      ],
    });

    expect(parsed.recaps[0]?.verifiedProof).toEqual({
      status: 'present',
      proof: verifiedProof,
    });
  });

  it('rejects an unavailable proof that still carries a quote', () => {
    const parsed = recapsResponseSchema.safeParse({
      recaps: [
        {
          ...RECAP_LIST_ITEM,
          verifiedProof: {
            status: 'present',
            proof: {
              topicId: '55555555-5555-4555-8555-555555555555',
              topicTitle: 'Fractions',
              subjectId: '44444444-4444-4444-8444-444444444444',
              verifiedAt: '2026-05-20T10:25:00.000Z',
              verificationState: 'fresh',
              retentionStatus: 'strong',
              nextReviewDate: null,
              evidenceAvailability: 'source_unavailable',
              quote: 'Must not render',
            },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
