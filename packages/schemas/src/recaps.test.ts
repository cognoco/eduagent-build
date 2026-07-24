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
  it('defaults omitted additive fields to null for older recap responses', () => {
    const parsed = recapsResponseSchema.parse({
      recaps: [RECAP_LIST_ITEM],
    });

    expect(parsed.recaps[0]).toMatchObject({
      nextTopicTitle: null,
      nextTopicReason: null,
      verifiedProof: null,
    });
  });

  it('round-trips an explicit null verified-proof field', () => {
    const parsed = recapsResponseSchema.parse({
      recaps: [{ ...RECAP_LIST_ITEM, verifiedProof: null }],
    });

    expect(parsed.recaps[0]?.verifiedProof).toBeNull();
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
      recaps: [{ ...RECAP_LIST_ITEM, verifiedProof }],
    });

    expect(parsed.recaps[0]?.verifiedProof).toEqual(verifiedProof);
  });

  it('rejects an unavailable proof that still carries a quote', () => {
    const parsed = recapsResponseSchema.safeParse({
      recaps: [
        {
          ...RECAP_LIST_ITEM,
          verifiedProof: {
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
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
