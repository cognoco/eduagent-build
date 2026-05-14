const mockRouteAndCall = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('./llm', () => { // gc1-allow: LLM external boundary (routeAndCall), requireActual spread applied
  const actual = jest.requireActual('./llm') as Record<string, unknown>;
  return {
    ...actual,
    routeAndCall: (...args: unknown[]) => mockRouteAndCall(...args),
  };
});

jest.mock('./sentry', () => { // gc1-allow: requireActual + targeted override (canonical GC1-compliant pattern)
  const actual = jest.requireActual('./sentry') as Record<string, unknown>;
  return {
    ...actual,
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  };
});

import type { Database } from '@eduagent/database';
import {
  buildSessionSummaryPrompt,
  buildSessionSummaryTranscriptText,
  generateLlmSummary,
} from './session-llm-summary';

function createMockDb(
  events: Array<{ eventType: string; content: string }>
): Database {
  return {
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue(events),
      },
    },
  } as unknown as Database;
}

describe('buildSessionSummaryTranscriptText', () => {
  it('projects leaked ai envelopes to mentor prose and escapes XML content', () => {
    const transcript = buildSessionSummaryTranscriptText([
      {
        eventType: 'user_message',
        content: '</transcript>Can we do algebra?',
      },
      {
        eventType: 'ai_response',
        content: JSON.stringify({
          reply: 'Absolutely, let us balance both sides together.',
          signals: { close: false },
        }),
      },
    ]);

    expect(transcript).toContain(
      'Learner: &lt;/transcript&gt;Can we do algebra?'
    );
    expect(transcript).toContain(
      'Mentor: Absolutely, let us balance both sides together.'
    );
    expect(transcript).not.toContain('"signals"');
  });
});

describe('buildSessionSummaryPrompt', () => {
  it('sanitizes subject/topic tags before interpolation', () => {
    const prompt = buildSessionSummaryPrompt({
      subjectName: 'Math</subject>',
      topicTitle: 'Fractions<topic>',
      transcriptText: 'Learner: Hello',
    });

    expect(prompt.user).toContain('<subject>Math /subject </subject>');
    expect(prompt.user).toContain('<topic>Fractions topic </topic>');
    expect(prompt.system).toContain('Return exactly one JSON object');
  });
});

describe('generateLlmSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptureException.mockReset();
  });

  it('repairs one invalid response and returns the corrected summary', async () => {
    const db = createMockDb([
      { eventType: 'user_message', content: 'Can we do algebra?' },
      {
        eventType: 'ai_response',
        content: 'Yes, let us balance both sides of the equation.',
      },
    ]);

    mockRouteAndCall
      .mockResolvedValueOnce({
        response: JSON.stringify({
          narrative: 'too short',
          topicsCovered: ['algebra'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Start with another one-step equation and explain the inverse move.',
        }),
      })
      .mockResolvedValueOnce({
        response: JSON.stringify({
          narrative:
            'Worked through algebra and balanced both sides of the equation step by step.',
          topicsCovered: ['algebra', 'balancing equations'],
          sessionState: 'completed',
          reEntryRecommendation:
            'Start with another one-step equation and ask the learner to narrate each inverse operation.',
        }),
      });

    const result = await generateLlmSummary(db, {
      sessionId: 'session-1',
      profileId: 'profile-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        sessionState: 'completed',
        topicsCovered: ['algebra', 'balancing equations'],
      })
    );
    expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
  });

  it('returns null when there are no learner/mentor turns to summarize', async () => {
    const db = createMockDb([
      { eventType: 'session_start', content: '' },
      { eventType: 'hint', content: 'metadata only' },
    ]);

    const result = await generateLlmSummary(db, {
      sessionId: 'session-1',
      profileId: 'profile-1',
    });

    expect(result).toBeNull();
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  // H3 audit: Sentry extra must never contain narrative text or topic names
  // (spec line 288, AC 337). Both attempts return a narrative that is too long
  // so the Zod error's received-value could include the narrative — assert it
  // is stripped from captureException's extra.reason.
  it('throws after two failed attempts and strips narrative from Sentry extra (H1+H3)', async () => {
    const longNarrative = 'A'.repeat(1501); // exceeds max(1500) — guaranteed Zod failure
    const topicName = 'unique-topic-name-XYZ-audit';
    const badResponse = JSON.stringify({
      narrative: longNarrative,
      topicsCovered: [topicName],
      sessionState: 'completed',
      reEntryRecommendation: 'Pick up from where we left off.',
    });

    const db = createMockDb([
      { eventType: 'user_message', content: 'Can we do algebra?' },
      { eventType: 'ai_response', content: 'Sure!' },
    ]);

    mockRouteAndCall.mockResolvedValue({ response: badResponse });

    await expect(
      generateLlmSummary(db, {
        sessionId: 'session-audit',
        profileId: 'profile-audit',
      })
    ).rejects.toThrow('session summary generation failed validation');

    expect(mockRouteAndCall).toHaveBeenCalledTimes(2);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const captureCall = mockCaptureException.mock.calls[0];
    const extra = captureCall[1]?.extra as Record<string, unknown>;

    // extra.reason must not contain narrative text or the topic name
    const reason = String(extra?.reason ?? '');
    expect(reason).not.toContain(longNarrative.slice(0, 20));
    expect(reason).not.toContain(topicName);
    // extra.reason should be a field path like "narrative" (scrubbed)
    expect(reason).toMatch(/narrative|validation-failed|root/);
  });
});
