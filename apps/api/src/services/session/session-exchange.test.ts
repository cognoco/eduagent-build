import {
  buildExchangeHistory,
  mergeMemoryContexts,
  computeCorrectStreak,
  resolveExchangeLlmRouting,
  type ExchangeHistoryEvent,
} from './session-exchange';

type ExchangeHistoryEntry = ReturnType<typeof buildExchangeHistory>[number];

describe('buildExchangeHistory', () => {
  it('filters out non-conversational event types', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'hello' },
      { eventType: 'ai_response', content: 'hi back' },
      { eventType: 'escalation', content: 'rung change' },
      { eventType: 'silence_prompt', content: 'still there?' },
      { eventType: 'system_prompt', content: 'sys note' },
    ];

    const history = buildExchangeHistory(events);

    expect(history.map((h: ExchangeHistoryEntry) => h.role)).toEqual([
      'user',
      'assistant',
      'system',
    ]);
  });

  it('re-wraps every prior assistant turn in a JSON envelope with FULL default signals [BUG-560 / BUG-610]', () => {
    // Repro: empty `signals: {}` contradicts the system prompt's signal spec
    // and triggers LLM format drift after 2+ re-wrapped turns, leaving the
    // SSE stream with no parseable `reply` field — the user sees an empty
    // bubble after the first exchange. The fix is to emit explicit `false`
    // for every signal so the conversation history matches the expected
    // envelope shape exactly.
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'first question' },
      { eventType: 'ai_response', content: 'first reply prose' },
      { eventType: 'user_message', content: 'second question' },
      { eventType: 'ai_response', content: 'second reply prose' },
    ];

    const history = buildExchangeHistory(events);
    const assistantTurns = history.filter(
      (h: ExchangeHistoryEntry) => h.role === 'assistant',
    );
    expect(assistantTurns).toHaveLength(2);

    for (const turn of assistantTurns) {
      const envelope = JSON.parse(turn.content) as {
        reply: string;
        signals: {
          partial_progress: boolean;
          needs_deepening: boolean;
          understanding_check: boolean;
        };
        ui_hints: { note_prompt: { show: boolean; post_session: boolean } };
      };

      // Reply text is preserved verbatim.
      expect(typeof envelope.reply).toBe('string');
      expect(envelope.reply.length).toBeGreaterThan(0);

      // Every signal is present with an explicit boolean — never missing,
      // never empty `{}`. This is the BUG-610 invariant.
      expect(envelope.signals).toEqual({
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      });
      expect(Object.keys(envelope.signals).sort()).toEqual([
        'needs_deepening',
        'partial_progress',
        'understanding_check',
      ]);

      // ui_hints.note_prompt also fully populated — same drift class.
      expect(envelope.ui_hints).toEqual({
        note_prompt: { show: false, post_session: false },
      });
    }
  });

  it('preserves user_message content as plain text (no envelope wrapping)', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'plain text question' },
    ];

    const history = buildExchangeHistory(events);

    expect(history[0]).toEqual({
      role: 'user',
      content: 'plain text question',
    });
  });

  it('preserves system_prompt content as plain text', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'system_prompt', content: 'silence nudge' },
    ];

    const history = buildExchangeHistory(events);

    expect(history[0]).toEqual({ role: 'system', content: 'silence nudge' });
  });

  it('produces empty history when no events', () => {
    expect(buildExchangeHistory([])).toEqual([]);
  });

  it('[BUG-934] projects legacy raw-envelope ai_response content to plain reply before re-wrapping', () => {
    // Repro: a legacy DB row where content is raw envelope JSON (not cleaned
    // prose). buildExchangeHistory must extract reply from the raw envelope so
    // the LLM receives plain text in the reply field — NOT a nested JSON string.
    const rawEnvelope = JSON.stringify({
      reply: 'hi',
      signals: {
        partial_progress: false,
        needs_deepening: false,
        understanding_check: false,
      },
      ui_hints: { note_prompt: { show: false, post_session: false } },
    });

    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'hello' },
      { eventType: 'ai_response', content: rawEnvelope },
    ];

    const history = buildExchangeHistory(events);
    const assistantTurn = history.find(
      (h: ExchangeHistoryEntry) => h.role === 'assistant',
    );
    expect(assistantTurn).toEqual(expect.objectContaining({}));

    const rewrapped = JSON.parse(assistantTurn!.content) as { reply: string };
    // The reply field must be plain text ("hi"), not the raw envelope JSON string.
    expect(rewrapped.reply).toBe('hi');
    expect(rewrapped.reply).not.toContain('"signals"');
    expect(rewrapped.reply).not.toContain('"ui_hints"');
  });
});

describe('mergeMemoryContexts', () => {
  it('returns empty when both inputs are empty', () => {
    expect(mergeMemoryContexts('', '')).toBe('');
  });

  it('returns the non-empty side when only one has content', () => {
    expect(mergeMemoryContexts('per-message', '')).toBe('per-message');
    expect(mergeMemoryContexts('', 'raw-input')).toBe('raw-input');
  });

  it('deduplicates identical inputs', () => {
    expect(mergeMemoryContexts('same', 'same')).toBe('same');
  });

  it('keeps the longer side when one fully contains the other', () => {
    const longer = 'shared prefix and extra context';
    expect(mergeMemoryContexts(longer, 'shared prefix')).toBe(longer);
    expect(mergeMemoryContexts('shared prefix', longer)).toBe(longer);
  });

  it('concatenates with a separator when both have unique content', () => {
    const merged = mergeMemoryContexts('A unique', 'B unique');
    expect(merged).toContain('A unique');
    expect(merged).toContain('B unique');
    expect(merged).toContain("learner's original question");
  });
});

describe('computeCorrectStreak', () => {
  it('returns 0 for empty events', () => {
    expect(computeCorrectStreak([], 2)).toBe(0);
  });

  it('counts consecutive correct answers at the current rung', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(3);
  });

  it('breaks on wrong answer', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: false },
      },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(1);
  });

  it('breaks on rung change', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 1, correctAnswer: true },
      },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(1);
  });

  it('caps at MAX_CORRECT_STREAK (5)', () => {
    const events = Array.from({ length: 10 }, () => ({
      eventType: 'ai_response' as const,
      metadata: { escalationRung: 2, correctAnswer: true },
    }));
    expect(computeCorrectStreak(events, 2)).toBe(5);
  });

  it('returns 0 when correctAnswer is not set in metadata', () => {
    const events = [
      { eventType: 'ai_response', metadata: { escalationRung: 2 } },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(0);
  });

  it('returns 0 when metadata is null', () => {
    const events = [{ eventType: 'ai_response', metadata: null }];
    expect(computeCorrectStreak(events, 2)).toBe(0);
  });

  it('skips user_message events when counting', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      { eventType: 'user_message', metadata: null },
      { eventType: 'user_message', metadata: null },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(2);
  });

  it('skips neutral ai_response events (no correctAnswer) rather than breaking the streak', () => {
    // A hint or encouragement turn (no correctAnswer) between correct answers
    // must NOT reset the streak. Only correctAnswer === false resets.
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      {
        // neutral hint turn — no correctAnswer field
        eventType: 'ai_response',
        metadata: { escalationRung: 2 },
      },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    expect(computeCorrectStreak(events, 2)).toBe(2);
  });

  it('breaks on explicit correctAnswer === false, not on undefined', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: false },
      },
      {
        eventType: 'ai_response',
        metadata: { escalationRung: 2, correctAnswer: true },
      },
    ];
    // Scanning backwards: first event (index 2) = correct → streak 1;
    // second event (index 1) = false → break. Result: 1.
    expect(computeCorrectStreak(events, 2)).toBe(1);
  });
});

describe('resolveExchangeLlmRouting', () => {
  it('keeps plus on standard routing below the hard-turn rung', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
      }),
    ).toEqual({ llmTier: 'standard' });
  });

  it('prefers Claude for plus hard turns at rung 4+', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
      }),
    ).toEqual({
      llmTier: 'standard',
      preferredProvider: 'anthropic',
      routingReason: 'plus_hard_turn_claude',
    });
  });

  it('does not override explicit premium profiles or add-ons', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'premium',
        effectiveRung: 4,
      }),
    ).toEqual({
      llmTier: 'premium',
      routingReason: 'premium_profile_or_addon',
    });
  });
});
