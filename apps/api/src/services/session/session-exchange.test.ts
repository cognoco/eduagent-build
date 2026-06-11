import {
  buildExchangeHistory,
  mergeMemoryContexts,
  computeCorrectStreak,
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
  resolveChallengeRoundRuntimeSignalState,
  resolveChallengeRoundRuntimeStartState,
  checkExchangeLimit,
  resolveReadyToFinish,
  resolvePromptLearnerName,
  type ExchangeHistoryEvent,
} from './session-exchange';
import type { processMessage, streamMessage } from './session-exchange';
import {
  ConflictError,
  MAX_EXCHANGES_PER_SESSION,
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundSessionState,
} from '@eduagent/schemas';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import { MAX_INTERVIEW_EXCHANGES } from '../exchanges';
import { SessionExchangeLimitError } from './session-crud';

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
        private_sources?: {
          relied_on?: string[];
          insufficient?: boolean;
          reason?: string;
        };
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
      expect(envelope.private_sources).toEqual({
        relied_on: ['conversation_history'],
        insufficient: false,
        reason: 'Rewrapped prior assistant turn for conversation continuity.',
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
  it('keeps Plus easy turns on standard Gemini routing', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'plus_standard_below_advanced_rung',
    });
  });

  it('routes Plus rung 3 through the standard Gemini path', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'plus_standard_below_advanced_rung',
    });
  });

  it('routes Plus rung 4 to advanced help (premium tier)', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
      }),
    ).toEqual({
      llmTier: 'premium',
      routingReason: 'plus_included_advanced_rung',
    });
  });

  it('routes Plus rung 5+ to premium tier', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 5,
      }),
    ).toEqual({
      llmTier: 'premium',
      routingReason: 'plus_included_advanced_rung',
    });
  });

  it('keeps upgraded Family profiles on standard routing below rung 4', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 3,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'premium_profile_or_addon_standard_below_advanced_rung',
    });
  });

  it('routes upgraded Family profiles to premium tier from rung 4+', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 4,
      }),
    ).toEqual({
      llmTier: 'premium',
      routingReason: 'premium_profile_or_addon_advanced_rung',
    });
  });

  it('routes upgraded Family profiles to premium tier from rung 5+', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 5,
      }),
    ).toEqual({
      llmTier: 'premium',
      routingReason: 'premium_profile_or_addon_advanced_rung',
    });
  });

  it('keeps Family standard profiles Gemini-only without the add-on', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'family_standard_gemini_only',
    });
  });

  it('returns no explicit tier or policy for unknown subscriptionTier (passthrough)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: undefined,
      requestedLlmTier: 'standard',
      effectiveRung: 2,
    });
    // No special routing rule matched — falls through to default
    expect(result.llmTier).toBe('standard');
    expect(result.providerPolicy).toBeUndefined();
    expect(result.routingReason).toBeUndefined();
  });
});

describe('resolveChallengeRoundLlmRoutingRung', () => {
  it.each(['accepted', 'active', 'drafting'] as const)(
    'floors %s rounds to the advanced routing rung',
    (state) => {
      expect(resolveChallengeRoundLlmRoutingRung(1, { state })).toBe(4);
      expect(resolveChallengeRoundLlmRoutingRung(3, { state })).toBe(4);
      expect(resolveChallengeRoundLlmRoutingRung(5, { state })).toBe(5);
    },
  );

  it.each(['offered', 'declined', 'complete', 'aborted'] as const)(
    'keeps normal routing for %s rounds',
    (state) => {
      expect(resolveChallengeRoundLlmRoutingRung(1, { state })).toBe(1);
      expect(resolveChallengeRoundLlmRoutingRung(4, { state })).toBe(4);
    },
  );

  it('keeps normal routing when no Challenge Round is in progress', () => {
    expect(resolveChallengeRoundLlmRoutingRung(2, undefined)).toBe(2);
  });
});

describe('Challenge Round runtime state decisions', () => {
  const topicId = '550e8400-e29b-41d4-a716-446655440000';
  const answerEventId = '550e8400-e29b-41d4-a716-446655440010';
  const evaluation: ChallengeRoundEvaluationItem = {
    concept: 'inputs and energy',
    result: 'solid',
    evidence: 'The learner connected inputs to energy.',
    answerEventId,
    learnerQuote: 'Cells use inputs to make energy.',
  };

  it('starts an accepted round before the first Challenge Round question when runtime is enabled', () => {
    const accepted: ChallengeRoundSessionState = {
      state: 'accepted',
      offerCount: 1,
      topicId,
      declinedDontAskAgain: false,
      evaluations: [],
    };

    const result = resolveChallengeRoundRuntimeStartState({
      runtimeEnabled: true,
      challengeRound: accepted,
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.challengeRound).toEqual(
      expect.objectContaining({
        state: 'active',
        questionIndex: 0,
        totalQuestions: MAX_CHALLENGE_QUESTIONS,
        topicId,
      }),
    );
  });

  it('does not start an accepted round while the runtime flag is disabled', () => {
    const accepted: ChallengeRoundSessionState = {
      state: 'accepted',
      offerCount: 1,
      topicId,
      declinedDontAskAgain: false,
      evaluations: [],
    };

    const result = resolveChallengeRoundRuntimeStartState({
      runtimeEnabled: false,
      challengeRound: accepted,
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.challengeRound).toBe(accepted);
  });

  it('creates an offered state only when the offer signal passes the server gate', () => {
    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: true,
      challengeRound: undefined,
      topicId,
      challengeEligible: true,
      challengeRoundOffer: true,
      challengeRoundEvaluation: [],
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.challengeRound).toEqual(
      expect.objectContaining({
        state: 'offered',
        topicId,
        offerCount: 1,
      }),
    );
  });

  it('ignores offer signals while the runtime flag is disabled', () => {
    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: false,
      challengeRound: undefined,
      topicId,
      challengeEligible: true,
      challengeRoundOffer: true,
      challengeRoundEvaluation: [],
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.challengeRound).toBeUndefined();
  });

  it('ignores offer signals when challenge readiness rejected the turn', () => {
    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: true,
      challengeRound: undefined,
      topicId,
      challengeEligible: false,
      challengeRoundOffer: true,
      challengeRoundEvaluation: [],
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.challengeRound).toBeUndefined();
  });

  it('appends active-round evaluations and moves to drafting at the question cap', () => {
    const active: ChallengeRoundSessionState = {
      state: 'active',
      offerCount: 1,
      topicId,
      declinedDontAskAgain: false,
      questionIndex: MAX_CHALLENGE_QUESTIONS - 1,
      totalQuestions: MAX_CHALLENGE_QUESTIONS,
      evaluations: [],
    };

    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: true,
      challengeRound: active,
      topicId,
      challengeEligible: false,
      challengeRoundOffer: false,
      challengeRoundEvaluation: [evaluation],
    });

    expect(result.shouldPersist).toBe(true);
    expect(result.challengeRound).toEqual(
      expect.objectContaining({
        state: 'drafting',
        evaluations: [evaluation],
      }),
    );
  });

  it('does not advance an active round on an empty evaluation array', () => {
    const active: ChallengeRoundSessionState = {
      state: 'active',
      offerCount: 1,
      topicId,
      declinedDontAskAgain: false,
      questionIndex: MAX_CHALLENGE_QUESTIONS - 1,
      totalQuestions: MAX_CHALLENGE_QUESTIONS,
      evaluations: [],
    };

    const result = resolveChallengeRoundRuntimeSignalState({
      runtimeEnabled: true,
      challengeRound: active,
      topicId,
      challengeEligible: false,
      challengeRoundOffer: false,
      challengeRoundEvaluation: [],
    });

    expect(result.shouldPersist).toBe(false);
    expect(result.challengeRound).toBe(active);
  });
});

// ---------------------------------------------------------------------------
// buildExchangeHistory — additional edge cases
// ---------------------------------------------------------------------------

describe('buildExchangeHistory — edge cases', () => {
  it('includes orphan_reason on user message when present', () => {
    const events: ExchangeHistoryEvent[] = [
      {
        eventType: 'user_message',
        content: 'lost message',
        orphanReason: 'llm_stream_error',
      },
    ];
    const history = buildExchangeHistory(events);
    expect(history[0]).toEqual({
      role: 'user',
      content: 'lost message',
      orphan_reason: 'llm_stream_error',
    });
  });

  it('omits orphan_reason field when not set on user message', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'normal message' },
    ];
    const history = buildExchangeHistory(events);
    expect(history[0]).not.toHaveProperty('orphan_reason');
  });

  it('filters out escalation events (non-conversational)', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'escalation', content: 'rung change' },
      { eventType: 'user_message', content: 'hello' },
    ];
    const history = buildExchangeHistory(events);
    expect(history).toHaveLength(1);
    expect(history[0]?.role).toBe('user');
  });

  it('filters out silence_prompt events', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'hello' },
      { eventType: 'silence_prompt', content: 'still there?' },
      { eventType: 'ai_response', content: 'yes, still here' },
    ];
    const history = buildExchangeHistory(events);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.role)).toEqual(['user', 'assistant']);
  });

  it('re-wraps ai_response as valid JSON envelope', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'ai_response', content: 'plain prose response' },
    ];
    const history = buildExchangeHistory(events);
    expect(history[0]?.role).toBe('assistant');
    const parsed = JSON.parse(history[0]!.content) as { reply: string };
    expect(parsed.reply).toBe('plain prose response');
  });

  it('handles null eventType without throwing', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: null, content: 'mystery event' },
      { eventType: 'user_message', content: 'real message' },
    ];
    const history = buildExchangeHistory(events);
    // null eventType is not in the filter list — should be excluded
    expect(history).toHaveLength(1);
    expect(history[0]?.content).toBe('real message');
  });
});

// ---------------------------------------------------------------------------
// buildExchangeHistory — system_prompt provenance (WI-240 · DS-151)
// ---------------------------------------------------------------------------
// Defense-in-depth: a system_prompt event is replayed as a trusted
// role:'system' message ONLY if it is server-authored (metadata.source ===
// 'server') OR a legacy untagged row (no source — historically benign static
// strings, kept per the keep-legacy decision). Any row whose source is present
// but not 'server' (e.g. a hypothetical client-authored row that should never
// exist post-fix) is dropped, never replayed as system.
describe('buildExchangeHistory — system_prompt provenance (WI-240)', () => {
  it("replays a server-sourced system_prompt as role:'system'", () => {
    const events: ExchangeHistoryEvent[] = [
      {
        eventType: 'system_prompt',
        content: 'server-resolved nudge',
        metadata: { source: 'server', intent: { kind: 'silence_nudge' } },
      },
    ];
    const history = buildExchangeHistory(events);
    expect(history).toEqual([
      { role: 'system', content: 'server-resolved nudge' },
    ]);
  });

  it('drops a system_prompt whose metadata.source is not server (never replayed as system)', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'hi' },
      {
        eventType: 'system_prompt',
        content: 'evil injected instruction',
        metadata: { source: 'client' },
      },
    ];
    const history = buildExchangeHistory(events);
    expect(history).toEqual([{ role: 'user', content: 'hi' }]);
    expect(history.some((h) => h.role === 'system')).toBe(false);
  });

  it("still replays a legacy untagged system_prompt as role:'system' (keep-legacy)", () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'system_prompt', content: 'legacy nudge' },
      {
        eventType: 'system_prompt',
        content: 'legacy with empty metadata',
        metadata: {},
      },
    ];
    const history = buildExchangeHistory(events);
    expect(history).toEqual([
      { role: 'system', content: 'legacy nudge' },
      { role: 'system', content: 'legacy with empty metadata' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// mergeMemoryContexts — additional edge cases
// ---------------------------------------------------------------------------

describe('mergeMemoryContexts — additional edge cases', () => {
  it('handles whitespace-only messageMemory as falsy', () => {
    // An empty string is falsy; whitespace-only strings are truthy.
    // The function only checks for falsy (empty string), so whitespace
    // is treated as real content.
    const result = mergeMemoryContexts('   ', 'raw-input context');
    expect(result).toContain('raw-input context');
  });

  it('uses the longer string when rawInput is a prefix of messageMemory', () => {
    const longer = 'Memory about chemistry including acid-base reactions';
    const shorter = 'Memory about chemistry';
    expect(mergeMemoryContexts(longer, shorter)).toBe(longer);
  });

  it('uses the longer string when messageMemory is a prefix of rawInput', () => {
    const longer = 'Raw input context about physics waves and energy';
    const shorter = 'Raw input context about physics';
    expect(mergeMemoryContexts(shorter, longer)).toBe(longer);
  });

  it('produces output containing both inputs when neither is a subset of the other', () => {
    const result = mergeMemoryContexts(
      'context A about math',
      'context B about history',
    );
    expect(result).toContain('context A about math');
    expect(result).toContain('context B about history');
  });
});

// ---------------------------------------------------------------------------
// checkExchangeLimit — profile-scoping and limit enforcement
// ---------------------------------------------------------------------------

// checkExchangeLimit uses createScopedRepository which calls
// db.query.learningSessions.findFirst internally (not db.select).
function makeExchangeLimitDb(
  sessionRow: {
    id: string;
    profileId: string;
    exchangeCount: number;
    subjectId: string;
    status?: 'active' | 'completed' | 'auto_closed';
  } | null,
) {
  return {
    query: {
      learningSessions: {
        findFirst: jest.fn().mockResolvedValue(sessionRow ?? undefined),
      },
    },
  } as never;
}

describe('checkExchangeLimit', () => {
  it('throws "Session not found" when scoped repo returns no row', async () => {
    const db = makeExchangeLimitDb(null);
    await expect(
      checkExchangeLimit(db, 'prof-1', 'nonexistent-sess'),
    ).rejects.toThrow('Session not found');
  });

  it('throws SessionExchangeLimitError when exchangeCount equals the limit', async () => {
    const db = makeExchangeLimitDb({
      id: 'sess-at-limit',
      profileId: 'prof-1',
      exchangeCount: MAX_EXCHANGES_PER_SESSION,
      subjectId: 'subj-1',
    });
    await expect(
      checkExchangeLimit(db, 'prof-1', 'sess-at-limit'),
    ).rejects.toBeInstanceOf(SessionExchangeLimitError);
  });

  it('throws SessionExchangeLimitError when exchangeCount exceeds the limit', async () => {
    const db = makeExchangeLimitDb({
      id: 'sess-over-limit',
      profileId: 'prof-1',
      exchangeCount: MAX_EXCHANGES_PER_SESSION + 5,
      subjectId: 'subj-1',
    });
    const err = await checkExchangeLimit(db, 'prof-1', 'sess-over-limit').catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(SessionExchangeLimitError);
    expect((err as SessionExchangeLimitError).exchangeCount).toBe(
      MAX_EXCHANGES_PER_SESSION + 5,
    );
  });

  it('resolves without throwing when exchangeCount is below the limit', async () => {
    const db = makeExchangeLimitDb({
      id: 'sess-under-limit',
      profileId: 'prof-1',
      exchangeCount: MAX_EXCHANGES_PER_SESSION - 1,
      subjectId: 'subj-1',
      status: 'active',
    });
    await expect(
      checkExchangeLimit(db, 'prof-1', 'sess-under-limit'),
    ).resolves.toBeUndefined();
  });

  it.each(['completed', 'auto_closed'] as const)(
    '[WI-78 DS-313] rejects exchange attempts against %s sessions',
    async (status) => {
      const db = makeExchangeLimitDb({
        id: `sess-${status}`,
        profileId: 'prof-1',
        exchangeCount: 1,
        subjectId: 'subj-1',
        status,
      });

      await expect(
        checkExchangeLimit(db, 'prof-1', `sess-${status}`),
      ).rejects.toBeInstanceOf(ConflictError);
    },
  );

  it('does not allow a different profile to check a session it does not own', async () => {
    // The scoped repo scopes findFirst to the caller's profileId. A session owned
    // by 'prof-victim' returns undefined when queried as 'prof-attacker'.
    const db = makeExchangeLimitDb(null); // null → not found for wrong profile
    await expect(
      checkExchangeLimit(db, 'attacker-profile', 'sess-owned-by-victim'),
    ).rejects.toThrow('Session not found');
  });
});

// ---------------------------------------------------------------------------
// resolveReadyToFinish — interview / onboarding hard cap
// ---------------------------------------------------------------------------
//
// [BUG-92 / CR-2026-05-19-C4] The envelope contract in AGENTS.md mandates a
// server-side hard cap per envelope signal so the flow terminates even if
// the LLM never emits the signal. resolveReadyToFinish is the single source
// of truth for the interview-close decision. These tests pin the contract:
//
//   1. The LLM signal alone is honored (LLM-driven close before the cap).
//   2. The hard cap fires even when the LLM never emits the signal —
//      WITHOUT this branch the interview can run unbounded up to
//      MAX_EXCHANGES_PER_SESSION (50), which is the bug we are fixing.
//   3. Non-interview sessions never trigger the cap — they are bounded by
//      MAX_EXCHANGES_PER_SESSION instead.

describe('resolveReadyToFinish', () => {
  const onboardingMeta = { onboardingFastPath: { extractedSignals: {} } };

  it('[BUG-92] returns true when the LLM signalled ready_to_finish (before cap)', () => {
    // LLM says we are done at exchange 2 — close immediately, do not wait
    // for the cap. This is the LLM-driven close path.
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: true,
        exchangeCount: 2,
        sessionMetadata: onboardingMeta,
      }),
    ).toBe(true);
  });

  it('[BUG-92] returns true when the hard cap is reached even if the LLM never emits the signal', () => {
    // LLM never emits — we are at the cap. WITHOUT this branch the
    // interview runs all the way to MAX_EXCHANGES_PER_SESSION (50), which
    // is the original unbounded-interview bug. This assertion is the
    // server-side safety net mandated by the envelope contract.
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: false,
        exchangeCount: MAX_INTERVIEW_EXCHANGES,
        sessionMetadata: onboardingMeta,
      }),
    ).toBe(true);
  });

  it('[BUG-92] returns false below the cap when the LLM has not signalled', () => {
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: false,
        exchangeCount: MAX_INTERVIEW_EXCHANGES - 1,
        sessionMetadata: onboardingMeta,
      }),
    ).toBe(false);
  });

  it('[BUG-92] returns false for non-interview sessions even past the cap (no onboardingFastPath)', () => {
    // Regular learning session — the interview cap MUST NOT apply.
    // MAX_EXCHANGES_PER_SESSION (50) is the relevant ceiling, enforced
    // elsewhere. A false-positive here would close every long
    // learning session at exchange 4.
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: false,
        exchangeCount: MAX_INTERVIEW_EXCHANGES + 10,
        sessionMetadata: { effectiveMode: 'learning' },
      }),
    ).toBe(false);
  });

  it('[BUG-92] returns false when session metadata is null', () => {
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: false,
        exchangeCount: MAX_INTERVIEW_EXCHANGES + 1,
        sessionMetadata: null,
      }),
    ).toBe(false);
  });

  it('[BUG-92] rejects malformed onboardingFastPath (array instead of object)', () => {
    // Defensive: an array under onboardingFastPath is not the documented
    // fast-path shape. Treat as non-interview.
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: false,
        exchangeCount: MAX_INTERVIEW_EXCHANGES,
        sessionMetadata: {
          onboardingFastPath: ['not-an-object'],
        },
      }),
    ).toBe(false);
  });

  it('[BUG-92] LLM signal wins even on a non-interview session', () => {
    // The LLM-emitted signal is honored regardless of flow — if the model
    // explicitly says it is done, we close. The cap is the safety net,
    // not a veto.
    expect(
      resolveReadyToFinish({
        llmReadyToFinish: true,
        exchangeCount: 1,
        sessionMetadata: { effectiveMode: 'learning' },
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// [#419] streamMessage.onComplete return shape — readyToFinish must be present
// ---------------------------------------------------------------------------
//
// Break test: TypeScript will error at the assignment below if `readyToFinish`
// is removed from the onComplete return type. This prevents the streaming path
// from silently omitting the hard-cap signal and running unbounded.
//
// We cannot call streamMessage in a unit test (requires DB + LLM context), so
// we pin the contract at the type level. The integration test for this lives
// in session-exchange-assessment-signals.integration.test.ts.

type StreamOnCompleteResult = Awaited<
  ReturnType<Awaited<ReturnType<typeof streamMessage>>['onComplete']>
>;

// Each assignment will produce a TS error if the field is absent.
// `extends { readyToFinish?: boolean }` was vacuous (any object satisfies it
// because the field is optional). The key-existence form below is strict: it
// produces `never` if the key is removed from StreamOnCompleteResult.
type _assertStreamReadyToFinish =
  'readyToFinish' extends keyof StreamOnCompleteResult ? true : never;
const _streamReadyToFinishCheck: _assertStreamReadyToFinish = true;
void _streamReadyToFinishCheck;

// ---------------------------------------------------------------------------
// [#384] processMessage return shape — notePrompt / notePromptPostSession /
//         confidence must be present so non-streaming clients get all fields.
// ---------------------------------------------------------------------------

type ProcessMessageResult = Awaited<ReturnType<typeof processMessage>>;

// Same fix as above: optional-extends is vacuous. Key-existence checks are
// strict — any removed field collapses the type to `never`.
type _assertProcessNotePrompt = 'notePrompt' extends keyof ProcessMessageResult
  ? 'notePromptPostSession' extends keyof ProcessMessageResult
    ? 'confidence' extends keyof ProcessMessageResult
      ? true
      : never
    : never
  : never;
const _processNotePromptCheck: _assertProcessNotePrompt = true;
void _processNotePromptCheck;

// ---------------------------------------------------------------------------
// WI-580 (F-076) — resolvePromptLearnerName: a minor's real name must never
// enter the LLM prompt context. Fail-closed: only a verified adult owner's
// display name passes the gate.
// ---------------------------------------------------------------------------

describe('resolvePromptLearnerName', () => {
  const currentYear = new Date().getFullYear();

  it('[F-076] returns undefined for a child profile on a parent account (non-owner)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: false,
        birthYear: currentYear - 12,
        displayName: 'Zuzana',
      }),
    ).toBeUndefined();
  });

  it('[F-076] returns undefined for an under-18 owner (solo minor)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: true,
        birthYear: currentYear - 15,
        displayName: 'Zuzana',
      }),
    ).toBeUndefined();
  });

  it('[F-076 / PR #900 Codex P1] treats the birth-year boundary as minor (owner born currentYear - 18 may still be 17)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: true,
        birthYear: currentYear - 18,
        displayName: 'Zuzana',
      }),
    ).toBeUndefined();
  });

  it('[F-076] returns undefined for an adult-aged non-owner (fail-closed on ownership)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: false,
        birthYear: currentYear - 30,
        displayName: 'Nikolaj',
      }),
    ).toBeUndefined();
  });

  it('[F-076] returns undefined when birthYear is unknown (fail-closed on age)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: true,
        birthYear: null,
        displayName: 'Zuzana',
      }),
    ).toBeUndefined();
  });

  it('returns the display name for an adult owner (consented personalization preserved)', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: true,
        birthYear: currentYear - 30,
        displayName: 'Astrid',
      }),
    ).toBe('Astrid');
  });

  it('returns undefined for an adult owner without a display name', () => {
    expect(
      resolvePromptLearnerName({
        isOwner: true,
        birthYear: currentYear - 30,
        displayName: null,
      }),
    ).toBeUndefined();
  });
});
