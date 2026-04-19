import type { SessionTranscript } from '@eduagent/schemas';
import { routeAndCall } from '../llm';
import { evaluateSessionDepth } from './session-depth';

jest.mock('../llm', () => ({
  routeAndCall: jest.fn(),
}));

const mockRouteAndCall = routeAndCall as jest.MockedFunction<
  typeof routeAndCall
>;

function makeTranscript(
  pairs: Array<{ user: string; assistant: string }>
): SessionTranscript {
  const startedAt = new Date('2026-04-19T10:00:00.000Z').toISOString();
  return {
    session: {
      sessionId: '00000000-0000-0000-0000-000000000001',
      subjectId: '00000000-0000-0000-0000-000000000002',
      topicId: null,
      sessionType: 'learning',
      inputMode: 'text',
      verificationType: null,
      startedAt,
      exchangeCount: pairs.length,
      milestonesReached: [],
      wallClockSeconds: null,
    },
    exchanges: pairs.flatMap((pair, index) => [
      {
        role: 'user' as const,
        content: pair.user,
        timestamp: new Date(
          `2026-04-19T10:00:${String(index).padStart(2, '0')}.000Z`
        ).toISOString(),
      },
      {
        role: 'assistant' as const,
        content: pair.assistant,
        timestamp: new Date(
          `2026-04-19T10:01:${String(index).padStart(2, '0')}.000Z`
        ).toISOString(),
      },
    ]),
  };
}

describe('evaluateSessionDepth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not meaningful for short sessions', async () => {
    const transcript = makeTranscript([
      {
        user: 'What is the capital of France?',
        assistant: 'Paris is the capital of France.',
      },
      {
        user: 'Thanks',
        assistant: "You're welcome!",
      },
    ]);

    const result = await evaluateSessionDepth(transcript);

    expect(result).toEqual({
      meaningful: false,
      reason: expect.stringContaining('Quick Q&A'),
      method: 'heuristic_shallow',
      topics: [],
    });
    expect(mockRouteAndCall).not.toHaveBeenCalled();
  });

  it('returns meaningful for long sessions and only detects topics', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: JSON.stringify({
        meaningful: true,
        reason: 'Deep session',
        topics: [{ summary: 'Photosynthesis basics', depth: 'substantial' }],
      }),
      provider: 'mock',
      model: 'mock',
      latencyMs: 1,
    });

    const transcript = makeTranscript([
      {
        user: 'Tell me about photosynthesis.',
        assistant: 'Photosynthesis helps plants turn light into energy.',
      },
      {
        user: 'What does chlorophyll do?',
        assistant: 'It absorbs light energy for the plant.',
      },
      {
        user: 'Why are leaves green then?',
        assistant: 'They reflect green light more than red or blue.',
      },
      {
        user: 'So which colors get absorbed most?',
        assistant: 'Mostly red and blue wavelengths.',
      },
      {
        user: 'Does that change under water?',
        assistant: 'Some plants use other pigments in deeper water.',
      },
    ]);

    const result = await evaluateSessionDepth(transcript);

    expect(result).toEqual({
      meaningful: true,
      reason: expect.stringContaining('Deep session'),
      method: 'heuristic_deep',
      topics: [{ summary: 'Photosynthesis basics', depth: 'substantial' }],
    });
    expect(mockRouteAndCall).toHaveBeenCalledTimes(1);
  });

  it('uses the LLM gate for ambiguous middle-length sessions', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: JSON.stringify({
        meaningful: false,
        reason: 'Mostly factual lookup',
        topics: [{ summary: 'Roman Empire', depth: 'introduced' }],
      }),
      provider: 'mock',
      model: 'mock',
      latencyMs: 1,
    });

    const transcript = makeTranscript([
      {
        user: 'Can you explain how the Roman Empire started?',
        assistant: 'It began as a kingdom and later became a republic.',
      },
      {
        user: 'Who was Julius Caesar then?',
        assistant: 'He was a military leader who helped end the republic.',
      },
      {
        user: 'Was he the first emperor?',
        assistant: 'No, Augustus is usually considered the first emperor.',
      },
    ]);

    const result = await evaluateSessionDepth(transcript);

    expect(result).toEqual({
      meaningful: false,
      reason: 'Mostly factual lookup',
      method: 'llm_gate',
      topics: [{ summary: 'Roman Empire', depth: 'introduced' }],
    });
  });

  it('fails open when the LLM response is unparseable', async () => {
    mockRouteAndCall.mockResolvedValue({
      response: 'not json',
      provider: 'mock',
      model: 'mock',
      latencyMs: 1,
    });

    const transcript = makeTranscript([
      {
        user: 'Help me understand fractions.',
        assistant: 'A fraction shows part of a whole.',
      },
      {
        user: 'Why is one half bigger than one third?',
        assistant: 'Because the whole is split into fewer pieces.',
      },
      {
        user: 'Can you show me with pizza slices?',
        assistant: 'Sure, two larger slices versus three smaller ones.',
      },
    ]);

    const result = await evaluateSessionDepth(transcript);

    expect(result).toEqual({
      meaningful: true,
      reason: expect.stringContaining('fail'),
      method: 'fail_open',
      topics: [],
    });
  });
});
