import type { SessionTranscript } from '@eduagent/schemas';
import { TEST_SESSION_ID, TEST_SUBJECT_ID } from '@eduagent/test-utils';

import { registerProvider, _clearProviders, _resetCircuits } from '../llm';
import { createMockProvider } from '../llm/test-utils';
import type { LLMProvider } from '../llm';
import { evaluateSessionDepth } from './session-depth';

function makeTranscript(
  pairs: Array<{ user: string; assistant: string }>,
): SessionTranscript {
  const startedAt = new Date('2026-04-19T10:00:00.000Z').toISOString();
  return {
    session: {
      sessionId: TEST_SESSION_ID,
      subjectId: TEST_SUBJECT_ID,
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
          `2026-04-19T10:00:${String(index).padStart(2, '0')}.000Z`,
        ).toISOString(),
      },
      {
        role: 'assistant' as const,
        content: pair.assistant,
        timestamp: new Date(
          `2026-04-19T10:01:${String(index).padStart(2, '0')}.000Z`,
        ).toISOString(),
      },
    ]),
  };
}

describe('evaluateSessionDepth', () => {
  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
    // Register a default no-op provider; individual tests override chat as needed.
    registerProvider(createMockProvider('gemini'));
  });

  it('returns not meaningful for short sessions', async () => {
    const mockChat = jest.fn();
    const provider: LLMProvider = {
      ...createMockProvider('gemini'),
      chat: mockChat,
    };
    _clearProviders();
    registerProvider(provider);

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
    // provider.chat should NOT have been called for short sessions
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('returns meaningful for long sessions and only detects topics', async () => {
    const rawResponse = JSON.stringify({
      meaningful: true,
      reason: 'Deep session',
      topics: [{ summary: 'Photosynthesis basics', depth: 'substantial' }],
    });
    const provider: LLMProvider = {
      ...createMockProvider('gemini'),
      chat: jest.fn().mockResolvedValue(rawResponse),
    };
    _clearProviders();
    registerProvider(provider);

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
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('uses the LLM gate for ambiguous middle-length sessions', async () => {
    const rawResponse = JSON.stringify({
      meaningful: false,
      reason: 'Mostly factual lookup',
      topics: [{ summary: 'Roman Empire', depth: 'introduced' }],
    });
    const provider: LLMProvider = {
      ...createMockProvider('gemini'),
      chat: jest.fn().mockResolvedValue(rawResponse),
    };
    _clearProviders();
    registerProvider(provider);

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
    const provider: LLMProvider = {
      ...createMockProvider('gemini'),
      chat: jest.fn().mockResolvedValue('not json'),
    };
    _clearProviders();
    registerProvider(provider);

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

  // ---------------------------------------------------------------------------
  // [BUG-772] Break test — extractFirstJsonObject must succeed on prose
  // preambles that the old 3-regex strip would have failed on.
  // ---------------------------------------------------------------------------
  it('[BUG-772] parses depth response when LLM emits a prose preamble before the JSON', async () => {
    const proseWrappedJson =
      "Here's the analysis you asked for:\n\n" +
      '{"meaningful": true, "reason": "deep follow-ups about fractions", "topics": []}\n' +
      'Hope that helps.';
    const provider: LLMProvider = {
      ...createMockProvider('gemini'),
      chat: jest.fn().mockResolvedValue(proseWrappedJson),
    };
    _clearProviders();
    registerProvider(provider);

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

    // Old behavior: cleaned still contained the prose preamble, JSON.parse
    // would throw, parseDepthResponse returned null, and the gate failed open.
    // New behavior: extractFirstJsonObject finds the JSON despite the prose,
    // and the LLM's actual decision propagates.
    expect(result.method).toBe('llm_gate');
    expect(result.meaningful).toBe(true);
    expect(result.reason).toBe('deep follow-ups about fractions');
  });

  // ---------------------------------------------------------------------------
  // Break test — the timeout race in callWithTimeout must clear its setTimeout
  // when the LLM call wins. Pre-fix the dangling timer (a) keeps the worker
  // event loop alive for up to timeoutMs after the request resolved and (b)
  // later rejects a handler-less Promise<never> -> unhandled rejection.
  // ---------------------------------------------------------------------------
  it('clears the timeout timer when the LLM call wins the race (no dangling timer)', async () => {
    jest.useFakeTimers();
    try {
      const rawResponse = JSON.stringify({
        meaningful: true,
        reason: 'Deep session',
        topics: [{ summary: 'Photosynthesis basics', depth: 'substantial' }],
      });
      const provider: LLMProvider = {
        ...createMockProvider('gemini'),
        // Resolve synchronously so the llmPromise wins the race deterministically.
        chat: jest.fn().mockResolvedValue(rawResponse),
      };
      _clearProviders();
      registerProvider(provider);

      // 5-exchange "deep heuristic" session routes through detectTopicsOnly ->
      // callWithTimeout, exercising the timeout race.
      const transcript = makeTranscript([
        {
          user: 'Tell me about photosynthesis.',
          assistant: 'Plants use light.',
        },
        { user: 'What does chlorophyll do?', assistant: 'It absorbs light.' },
        {
          user: 'Why are leaves green then?',
          assistant: 'They reflect green.',
        },
        { user: 'Which colors absorb most?', assistant: 'Red and blue.' },
        { user: 'Does that change under water?', assistant: 'Other pigments.' },
      ]);

      const result = await evaluateSessionDepth(transcript);

      expect(result.method).toBe('heuristic_deep');
      // Core assertion: the timeout timer must be cleared on the happy path.
      // Pre-fix this is 1 (the uncleared setTimeout); post-fix 0.
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
