import {
  buildDeescalationTelemetry,
  buildCorrectStreakOfferTelemetry,
  buildDownwardRungMovementAudit,
  buildExchangeHistory,
  mergeMemoryContexts,
  computeCorrectStreak,
  resolveExchangeLlmRouting,
  resolveChallengeRoundLlmRoutingRung,
  resolveChallengeRoundRuntimeSignalState,
  resolveChallengeRoundRuntimeStartState,
  checkExchangeLimit,
  prepareExchangeContext,
  persistChallengeRoundState,
  resolveReadyToFinish,
  resolvePromptLearnerName,
  type ExchangeHistoryEvent,
} from './session-exchange';
import type { processMessage, streamMessage } from './session-exchange';
import {
  ConflictError,
  NotFoundError,
  MAX_EXCHANGES_PER_SESSION,
  type ChallengeRoundEvaluationItem,
  type ChallengeRoundSessionState,
} from '@eduagent/schemas';
import { MAX_CHALLENGE_QUESTIONS } from '../challenge-round/caps';
import { MAX_INTERVIEW_EXCHANGES } from '../exchanges';
import { buildSystemPrompt } from '../exchange-prompts';
import { SessionExchangeLimitError } from './session-crud';
import { computeNextPracticePointer } from '../language-session-engine';
import { resetSessionStaticContextCache } from './session-cache';
import { recitationSetupClaimMetadataKey } from './session-recitation-setup';

type ExchangeHistoryEntry = ReturnType<typeof buildExchangeHistory>[number];

describe('downward rung audit', () => {
  it('builds the exact non-escalation persistence and telemetry payloads', () => {
    const movement = buildDownwardRungMovementAudit(5, 4, {
      rungMovementStreak: 4,
      rungDirection: 'down',
      rungReason: 'Four correct answers at the current rung — reducing support',
    });

    expect(movement).toEqual({
      fromRung: 5,
      toRung: 4,
      action: 'deescalate',
      direction: 'down',
      streak: 4,
      reason: 'Four correct answers at the current rung — reducing support',
    });
    expect(buildDeescalationTelemetry('session-1', movement!)).toEqual({
      event: 'llm.deescalation_applied',
      sessionId: 'session-1',
      fromRung: 5,
      toRung: 4,
      action: 'deescalate',
      direction: 'down',
      streak: 4,
      reason: 'Four correct answers at the current rung — reducing support',
    });
  });
});

describe('correct-streak offer telemetry', () => {
  it('does not label a stuck-driven upward movement as a correct-streak offer', () => {
    expect(
      buildCorrectStreakOfferTelemetry('session-1', {
        correctStreak: 4,
        rungDirection: 'up',
      }),
    ).toBeUndefined();
  });
});

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

  it('prefers canonical correct over a conflicting legacy false', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'correct' },
          correctAnswer: false,
        },
      },
    ];

    expect(computeCorrectStreak(events, 2)).toBe(1);
  });

  it.each(['partial', 'incorrect'] as const)(
    'canonical %s resets even when legacy boolean conflicts',
    (correctness) => {
      const events = [
        {
          eventType: 'ai_response',
          metadata: {
            escalationRung: 2,
            answerEvaluation: { correctness: 'correct' },
          },
        },
        {
          eventType: 'ai_response',
          metadata: {
            escalationRung: 2,
            answerEvaluation: { correctness },
            correctAnswer: true,
          },
        },
      ];

      expect(computeCorrectStreak(events, 2)).toBe(0);
    },
  );

  it('resets at canonical partial within correct → partial → correct', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'correct' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'partial' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'correct' },
        },
      },
    ];

    expect(computeCorrectStreak(events, 2)).toBe(1);
  });

  it('skips canonical na and unevaluated turns', () => {
    const events = [
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'correct' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: {
          escalationRung: 2,
          answerEvaluation: { correctness: 'na' },
        },
      },
      { eventType: 'ai_response', metadata: { escalationRung: 2 } },
    ];

    expect(computeCorrectStreak(events, 2)).toBe(1);
  });
});

describe('resolveExchangeLlmRouting', () => {
  it('keeps Plus easy turns on standard Gemini routing (adult learner)', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 1,
        isAdultLearner: true,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'plus_standard_below_advanced_rung',
    });
  });

  it('routes Plus rung 3 through the standard Gemini path (adult learner)', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'plus',
        requestedLlmTier: 'standard',
        effectiveRung: 3,
        isAdultLearner: true,
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

  it('keeps upgraded Family profiles on standard routing below rung 4 (adult learner)', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'premium',
        effectiveRung: 3,
        isAdultLearner: true,
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

  it('keeps Family standard profiles Gemini-only without the add-on (adult learner)', () => {
    expect(
      resolveExchangeLlmRouting({
        subscriptionTier: 'family',
        requestedLlmTier: 'standard',
        effectiveRung: 4,
        isAdultLearner: true,
      }),
    ).toEqual({
      llmTier: 'standard',
      providerPolicy: 'gemini_only',
      routingReason: 'family_standard_gemini_only',
    });
  });

  // MMT-ADR-0016 §10.1 regression: under-18 must never route to Gemini (WI-1099)
  it('does not apply gemini_only for under-18 family-plan standard learners (MMT-ADR-0016 §10.1)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: 'family',
      requestedLlmTier: 'standard',
      effectiveRung: 2,
      isAdultLearner: false,
    });
    expect(result.providerPolicy).not.toBe('gemini_only');
  });

  it('does not apply gemini_only for under-18 plus-tier learners (MMT-ADR-0016 §10.1)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: 'plus',
      requestedLlmTier: 'standard',
      effectiveRung: 1,
      isAdultLearner: false,
    });
    expect(result.providerPolicy).not.toBe('gemini_only');
  });

  it('does not apply gemini_only for under-18 premium-addon learners below rung 4 (MMT-ADR-0016 §10.1)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: 'family',
      requestedLlmTier: 'premium',
      effectiveRung: 2,
      isAdultLearner: false,
    });
    expect(result.providerPolicy).not.toBe('gemini_only');
  });

  // SF2: omitted isAdultLearner (undefined) mimics a null/unknown birthYear —
  // must fail closed to no Gemini routing, exactly like isAdultLearner: false.
  it('does not apply gemini_only for plus-tier learners when isAdultLearner is omitted (null birthYear) (MMT-ADR-0016 §10.1)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: 'plus',
      requestedLlmTier: 'standard',
      effectiveRung: 1,
    });
    expect(result.providerPolicy).not.toBe('gemini_only');
  });

  it('does not apply gemini_only for family-plan standard learners when isAdultLearner is omitted (null birthYear) (MMT-ADR-0016 §10.1)', () => {
    const result = resolveExchangeLlmRouting({
      subscriptionTier: 'family',
      requestedLlmTier: 'standard',
      effectiveRung: 2,
    });
    expect(result.providerPolicy).not.toBe('gemini_only');
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
// T6 — askedQuestion sourcing from last assistant message in exchangeHistory
// Plan: 2026-06-26-challenge-round-grader-judge §T6
//
// applyChallengeRoundRuntimeSignals receives `askedQuestion` from the caller,
// which extracts it from context.exchangeHistory (the last assistant entry).
// This test verifies the sourcing pattern: filter assistant turns → at(-1) →
// content is a re-wrapped JSON envelope → must project to clean prose.
// ---------------------------------------------------------------------------

describe('T6 — askedQuestion extraction from exchangeHistory', () => {
  it('returns clean prose from the last assistant entry in a multi-turn history', () => {
    // buildExchangeHistory re-wraps ai_response content as a JSON envelope
    // (BUG-560 fix). The sourcing code in processMessage/streamMessage uses
    // projectAiResponseContent to extract clean prose from that envelope.
    // This test validates the extraction pattern end-to-end using
    // buildExchangeHistory output.
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'ai_response', content: 'What is photosynthesis?' },
      { eventType: 'user_message', content: 'It makes food from sunlight.' },
      { eventType: 'ai_response', content: 'Correct! Now explain the inputs.' },
    ];
    const history = buildExchangeHistory(events);
    const assistantEntries = history.filter((e) => e.role === 'assistant');
    const lastAssistant = assistantEntries.at(-1);

    expect(lastAssistant).toBeDefined();
    expect(lastAssistant?.role).toBe('assistant');

    // The content from buildExchangeHistory is a re-wrapped JSON envelope.
    // Parse it to verify the reply field contains the clean question text.
    const parsed = JSON.parse(lastAssistant!.content) as { reply: string };
    expect(parsed.reply).toBe('Correct! Now explain the inputs.');

    // There should be 2 assistant entries (the first ai_response + the last)
    expect(assistantEntries).toHaveLength(2);
    // The LAST one is the mentor question the learner is currently answering
    expect(assistantEntries.at(-1)?.content).not.toBe(
      assistantEntries.at(0)?.content,
    );
  });

  it('returns undefined for last assistant when there are no prior AI turns (first turn)', () => {
    const events: ExchangeHistoryEvent[] = [
      { eventType: 'user_message', content: 'What is 2+2?' },
    ];
    const history = buildExchangeHistory(events);
    const lastAssistant = history.filter((e) => e.role === 'assistant').at(-1);

    // First turn: no prior assistant message → askedQuestion falls back to ''
    expect(lastAssistant).toBeUndefined();
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
  it('throws NotFoundError when scoped repo returns no row', async () => {
    const db = makeExchangeLimitDb(null);
    await expect(
      checkExchangeLimit(db, 'prof-1', 'nonexistent-sess'),
    ).rejects.toBeInstanceOf(NotFoundError);
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
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// WI-650 sweep — prepareExchangeContext NotFoundError regression
// ---------------------------------------------------------------------------

describe('[WI-650] prepareExchangeContext — typed NotFoundError for missing session', () => {
  it('throws NotFoundError (not raw Error) when session does not exist', async () => {
    // getSession → createScopedRepository(db, profileId).sessions.findFirst.
    // Stub to return null/undefined so the !session guard fires immediately.
    const db = {
      query: {
        learningSessions: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    } as never;

    await expect(
      prepareExchangeContext(db, 'prof-1', 'sess-missing', 'hello'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('[WI-650] persistChallengeRoundState — typed NotFoundError for missing session', () => {
  it('throws NotFoundError (not raw Error) when persistSessionMetadata finds no session', async () => {
    // persistChallengeRoundState → persistSessionMetadata, which runs a
    // db.transaction whose in-tx SELECT ... FOR UPDATE returns no row →
    // returns null → the !updated guard fires. Stub the transaction to
    // invoke the callback with a tx whose select chain resolves empty.
    const txLimit = jest.fn().mockResolvedValue([]);
    const tx = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            for: jest.fn().mockReturnValue({ limit: txLimit }),
          }),
        }),
      }),
    };
    const db = {
      transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as never;

    await expect(
      persistChallengeRoundState(db, 'prof-1', 'sess-missing', undefined),
    ).rejects.toBeInstanceOf(NotFoundError);
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
//   1. The hard cap fires even when the LLM never emits the signal —
//      WITHOUT this branch the interview can run unbounded up to
//      MAX_EXCHANGES_PER_SESSION (50), which is the bug we are fixing.
//   2. Non-interview sessions never trigger the cap — they are bounded by
//      MAX_EXCHANGES_PER_SESSION instead.
//
// Note: the LLM-driven early-close path (llmReadyToFinish) was removed
// because `ready_to_finish` is absent from every exchange prompt template, so
// the LLM never emits it. The hard cap is the sole termination mechanism.

describe('resolveReadyToFinish', () => {
  const onboardingMeta = { onboardingFastPath: { extractedSignals: {} } };

  it('[BUG-92] returns true when the hard cap is reached even if the LLM never emits the signal', () => {
    // LLM never emits — we are at the cap. WITHOUT this branch the
    // interview runs all the way to MAX_EXCHANGES_PER_SESSION (50), which
    // is the original unbounded-interview bug. This assertion is the
    // server-side safety net mandated by the envelope contract.
    expect(
      resolveReadyToFinish({
        exchangeCount: MAX_INTERVIEW_EXCHANGES,
        sessionMetadata: onboardingMeta,
      }),
    ).toBe(true);
  });

  it('[BUG-92] returns false below the cap when the LLM has not signalled', () => {
    expect(
      resolveReadyToFinish({
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
        exchangeCount: MAX_INTERVIEW_EXCHANGES + 10,
        sessionMetadata: { effectiveMode: 'learning' },
      }),
    ).toBe(false);
  });

  it('[BUG-92] returns false when session metadata is null', () => {
    expect(
      resolveReadyToFinish({
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
        exchangeCount: MAX_INTERVIEW_EXCHANGES,
        sessionMetadata: {
          onboardingFastPath: ['not-an-object'],
        },
      }),
    ).toBe(false);
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

// ---------------------------------------------------------------------------
// WI-1552 (review rework, finding ac.4a.two_session_persistence_readback) —
// prepareExchangeContext persist->read-back boundary.
//
// The engine-level test in language-session-engine.test.ts ("seeds
// activeStrand at session start from a cross-session pointer") passes a
// crossSessionPointer straight into buildLanguageSessionState — it never
// exercises the DB read or the profileId-scoped repository lookup in
// prepareExchangeContext (session-exchange.ts, ~2636-2650) that "session two"
// actually depends on. This suite simulates the real boundary: "session one"
// persists a pointer on the subjects row (the shape session-completed.ts
// writes at session-close), and "session two"'s first exchange
// (exchangeCount 0) reads it back through the real prepareExchangeContext /
// createScopedRepository path and threads it into languageSessionState.
//
// No jest.mock of internal modules (GC1/GC6) — only a duck-typed db stub,
// following session-summary.test.ts's conventions. db.query.subjects.findFirst
// backs BOTH getSubject's pedagogyMode read (via getSessionStaticContext) and
// the cross-session-pointer scoped-repository read from Finding 1 of this
// rework — one fixture row serves both, since both route through the same
// scoped repository call in production.
// ---------------------------------------------------------------------------
describe('[WI-1552] prepareExchangeContext — cross-session pointer read-back', () => {
  beforeEach(() => {
    // prepareExchangeContext populates the module-level session-static-context
    // cache as a side effect; without a reset, a stale entry from an earlier
    // test (in this file or a sibling) would short-circuit past the DB reads
    // this suite exists to exercise.
    resetSessionStaticContextCache();
  });

  const PROFILE_ID = 'prof-wi1552';
  const SESSION_ID = 'sess-wi1552';
  const SUBJECT_ID = 'subj-wi1552';

  function buildSessionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: SESSION_ID,
      profileId: PROFILE_ID,
      subjectId: SUBJECT_ID,
      topicId: null,
      sessionType: 'learning',
      inputMode: 'text',
      verificationType: null,
      status: 'active',
      escalationRung: 1,
      exchangeCount: 0,
      startedAt: new Date('2026-01-02T10:00:00Z'),
      lastActivityAt: new Date('2026-01-02T10:00:00Z'),
      endedAt: null,
      durationSeconds: null,
      wallClockSeconds: null,
      rawInput: null,
      filedAt: null,
      filingStatus: null,
      filingRetryCount: 0,
      metadata: null,
      updatedAt: new Date('2026-01-02T10:00:00Z'),
      createdAt: new Date('2026-01-02T10:00:00Z'),
      ...overrides,
    };
  }

  // "Session one" ending: session-completed.ts computes and persists exactly
  // this shape on subjects.nextLanguagePracticePointer (WI-1552).
  const persistedPointer = computeNextPracticePointer({
    meaning_input: 4,
    meaning_output: 3,
    language_focus: 0,
    fluency: 3,
  });

  function buildSubjectRow(
    pointer: typeof persistedPointer | null = persistedPointer,
  ) {
    return {
      id: SUBJECT_ID,
      profileId: PROFILE_ID,
      name: 'Spanish',
      rawInput: null,
      status: 'active',
      pedagogyMode: 'four_strands' as string | null,
      languageCode: 'es' as string | null,
      createdAt: new Date('2026-01-01T09:00:00Z'),
      updatedAt: new Date('2026-01-01T09:00:00Z'),
      urgencyBoostUntil: null,
      urgencyBoostReason: null,
      nextLanguagePracticePointer: pointer,
    };
  }

  const personRow = {
    id: PROFILE_ID,
    organizationId: 'org-wi1552',
    displayName: 'Learner WI-1552',
    avatarUrl: null,
    birthDate: '2011-06-15',
    residenceJurisdiction: 'US',
    conversationLanguage: 'en',
    pronouns: null,
    defaultAppContext: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    updatedAt: new Date('2020-01-01T00:00:00Z'),
    roles: ['learner'],
  };

  // Every db.select().from(...) call site in prepareExchangeContext's
  // four_strands/exchangeCount-0 path either supports .where/.limit or
  // .innerJoin/.leftJoin/.orderBy, and several never call .limit() at all
  // (e.g. fetchPriorTopics ends on .orderBy()). Make every method return the
  // same thenable node so any call sequence resolves to `rows`, regardless of
  // where the real code stops chaining.
  function makeChainNode(rows: unknown[]) {
    const node: {
      where: () => typeof node;
      orderBy: () => typeof node;
      innerJoin: () => typeof node;
      leftJoin: () => typeof node;
      limit: () => typeof node;
      for: () => typeof node;
      then: (resolve: (v: unknown[]) => void) => void;
    } = {
      where: () => node,
      orderBy: () => node,
      innerJoin: () => node,
      leftJoin: () => node,
      limit: () => node,
      for: () => node,
      then: (resolve) => resolve(rows),
    };
    return node;
  }

  // loadProfileRowByIdV2 is the only .select() call site in this path whose
  // projection includes `organizationId` (the person/membership join) — use
  // that as the dispatch key to hand back the seeded person row; every other
  // .select() call site (vocabulary reads, urgency read, last-session-summary
  // read, fetchPriorTopics, fetchCrossSubjectHighlights) gets an empty result.
  function makeDb(
    subjectRow: ReturnType<typeof buildSubjectRow>,
    options?: {
      sessionRow?: ReturnType<typeof buildSessionRow>;
      events?: Array<{
        eventType: string;
        content: string;
        metadata?: unknown;
      }>;
    },
  ) {
    const sessionRow = options?.sessionRow ?? buildSessionRow();
    const subjectsFindFirst = jest.fn().mockResolvedValue(subjectRow);
    const transactionDb = {
      select: jest.fn(() => ({
        from: () =>
          makeChainNode([
            {
              metadata: sessionRow.metadata,
              exchangeCount: sessionRow.exchangeCount,
            },
          ]),
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn().mockResolvedValue(undefined),
        })),
      })),
    };
    return {
      query: {
        learningSessions: {
          findFirst: jest.fn().mockResolvedValue(sessionRow),
        },
        subjects: { findFirst: subjectsFindFirst },
        sessionEvents: {
          findMany: jest.fn().mockResolvedValue(options?.events ?? []),
        },
        teachingPreferences: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
        learningModes: { findFirst: jest.fn().mockResolvedValue(undefined) },
        learningProfiles: {
          findFirst: jest.fn().mockResolvedValue(undefined),
        },
      },
      select: jest.fn((cols: Record<string, unknown>) => ({
        from: () =>
          cols && 'organizationId' in cols
            ? makeChainNode([personRow])
            : makeChainNode([]),
      })),
      transaction: jest.fn(
        async (callback: (tx: typeof transactionDb) => unknown) =>
          callback(transactionDb),
      ),
    } as never;
  }

  it('seeds session two, exchange 0 from the pointer session one persisted to subjects (AC1/AC4a)', async () => {
    const db = makeDb(buildSubjectRow(persistedPointer));

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      'Hola, quiero seguir practicando',
      { semanticMemoryRetrievalEnabled: false },
    );

    // language_focus is the least-practiced strand in persistedPointer's
    // counts (0, vs. 3-4 for the others) — this is only reachable if the
    // pointer was actually read back off the subjects row and threaded
    // through to buildLanguageSessionState/chooseNextLanguageStrand.
    expect(result.context.languageSessionState?.activeStrand).toBe(
      'language_focus',
    );
    expect(result.context.pedagogyMode).toBe('four_strands');
  });

  it('falls back to the default strand when no pointer was persisted (no prior session)', async () => {
    const db = makeDb(buildSubjectRow(null));

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      'Hola, quiero empezar',
      { semanticMemoryRetrievalEnabled: false },
    );

    expect(result.context.languageSessionState?.activeStrand).toBe(
      'meaning_input',
    );
  });

  it('restores recitation setup state and resolves the current turn in shared context preparation', async () => {
    const db = makeDb(
      { ...buildSubjectRow(null), pedagogyMode: null, languageCode: null },
      {
        sessionRow: buildSessionRow({
          exchangeCount: 1,
          metadata: {
            effectiveMode: 'recitation',
            [recitationSetupClaimMetadataKey]: {
              phase: 'awaiting_selection',
              clarificationCount: 1,
              lastAction: 'clarify_selection',
              recentClaims: [],
            },
          },
        }),
        events: [
          { eventType: 'user_message', content: 'unclear' },
          {
            eventType: 'ai_response',
            content: 'clarification',
            metadata: {
              recitationSetup: {
                phase: 'awaiting_selection',
                clarificationCount: 1,
              },
            },
          },
        ],
      },
    );

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      'Ozymandias',
      { semanticMemoryRetrievalEnabled: false },
    );

    expect(
      (db as unknown as { transaction: jest.Mock }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(result.context.recitationSetup).toEqual({
      action: 'invite_to_begin',
      state: { phase: 'ready', clarificationCount: 1 },
    });
  });

  it('applies 5→4 from a source-rung streak without prompting upward escalation', async () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      id: `ai-${index}`,
      eventType: 'ai_response',
      content: 'Keep going.',
      metadata: {
        escalationRung: 5,
        answerEvaluation: { correctness: 'correct' },
        correctAnswer: true,
      },
      createdAt: new Date(`2026-01-02T10:0${index}:00Z`),
    }));
    const db = makeDb(buildSubjectRow(null), {
      sessionRow: buildSessionRow({ escalationRung: 5, exchangeCount: 4 }),
      events,
    });

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      '42',
      {
        semanticMemoryRetrievalEnabled: false,
        answerEvaluationEnabled: true,
      },
    );

    expect(result.sourceCorrectStreak).toBe(4);
    expect(result.escalationDecision).toMatchObject({
      action: 'deescalate',
      direction: 'down',
      newRung: 4,
    });
    expect(result.context.correctStreak).toBeUndefined();
    expect(buildSystemPrompt(result.context)).not.toContain(
      'ADAPTIVE ESCALATION',
    );
    expect(result.effectiveRung).toBe(4);
  });

  it('keeps a source streak for audit but removes it from the prompt on stuck 3→4 movement', async () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      id: `ai-up-${index}`,
      eventType: 'ai_response',
      content: 'Keep going.',
      metadata: {
        escalationRung: 3,
        answerEvaluation: { correctness: 'correct' },
      },
      createdAt: new Date(`2026-01-02T10:0${index}:00Z`),
    }));
    const db = makeDb(buildSubjectRow(null), {
      sessionRow: buildSessionRow({ escalationRung: 3, exchangeCount: 4 }),
      events,
    });

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      "I don't know",
      {
        semanticMemoryRetrievalEnabled: false,
        answerEvaluationEnabled: true,
      },
    );

    expect(result.sourceCorrectStreak).toBe(4);
    expect(result.escalationDecision).toMatchObject({
      action: 'escalate',
      direction: 'up',
      newRung: 4,
    });
    expect(result.context.correctStreak).toBeUndefined();
    expect(buildSystemPrompt(result.context)).not.toContain(
      'ADAPTIVE ESCALATION',
    );
  });

  it.each([
    {
      label: 'app-help',
      message: 'Where do I find my notes?',
      metadata: null,
    },
    {
      label: 'recitation',
      message: "I don't know",
      metadata: { effectiveMode: 'recitation' },
    },
    {
      label: 'Challenge accepted',
      message: "I don't know",
      metadata: {
        challengeRound: {
          state: 'accepted',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      },
    },
    {
      label: 'Challenge active',
      message: "I don't know",
      metadata: {
        challengeRound: {
          state: 'active',
          offerCount: 1,
          questionIndex: 1,
          totalQuestions: 4,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      },
    },
  ])(
    'prepareExchangeContext freezes $label turns without prompt or telemetry streak leakage',
    async ({ message, metadata }) => {
      const events = Array.from({ length: 4 }, (_, index) => ({
        id: `ai-freeze-${index}`,
        eventType: 'ai_response',
        content: 'Keep going.',
        metadata: {
          escalationRung: 3,
          answerEvaluation: { correctness: 'correct' },
        },
        createdAt: new Date(`2026-01-02T10:0${index}:00Z`),
      }));
      const db = makeDb(buildSubjectRow(null), {
        sessionRow: buildSessionRow({
          escalationRung: 3,
          exchangeCount: 4,
          metadata,
        }),
        events,
      });

      const result = await prepareExchangeContext(
        db,
        PROFILE_ID,
        SESSION_ID,
        message,
        {
          semanticMemoryRetrievalEnabled: false,
          answerEvaluationEnabled: true,
        },
      );

      expect(result.sourceCorrectStreak).toBe(4);
      expect(result.escalationDecision).toMatchObject({
        action: 'hold',
        direction: 'none',
        newRung: 3,
      });
      expect(result.effectiveRung).toBe(3);
      expect({
        promptCorrectStreak: result.context.correctStreak,
        promptIncludesAdaptiveEscalation: buildSystemPrompt(
          result.context,
        ).includes('ADAPTIVE ESCALATION'),
        offerTelemetry: buildCorrectStreakOfferTelemetry(SESSION_ID, {
          correctStreak: result.context.correctStreak,
          rungDirection: result.escalationDecision.direction,
        }),
      }).toEqual({
        promptCorrectStreak: undefined,
        promptIncludesAdaptiveEscalation: false,
        offerTelemetry: undefined,
      });
    },
  );

  it('scopes question and streak counts to the latest contiguous rung visit', async () => {
    const makeEvent = (id: string, escalationRung: number) => ({
      id,
      eventType: 'ai_response',
      content: 'Keep going.',
      metadata: {
        escalationRung,
        answerEvaluation: { correctness: 'correct' },
      },
      createdAt: new Date('2026-01-02T10:00:00Z'),
    });
    // findMany returns DESC and prepareExchangeContext reverses to chronological.
    const events = [
      makeEvent('new-r3', 3),
      makeEvent('visit-r4', 4),
      makeEvent('old-r3-3', 3),
      makeEvent('old-r3-2', 3),
      makeEvent('old-r3-1', 3),
    ];
    const db = makeDb(buildSubjectRow(null), {
      sessionRow: buildSessionRow({ escalationRung: 3, exchangeCount: 5 }),
      events,
    });

    const result = await prepareExchangeContext(
      db,
      PROFILE_ID,
      SESSION_ID,
      'maybe',
      {
        semanticMemoryRetrievalEnabled: false,
        answerEvaluationEnabled: true,
      },
    );

    expect(result.sourceCorrectStreak).toBe(1);
    expect(result.escalationDecision.direction).toBe('none');
    expect(result.effectiveRung).toBe(3);
  });
});
