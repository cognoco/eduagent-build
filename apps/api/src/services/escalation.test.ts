import {
  createInitialEscalationState,
  evaluateEscalation,
  getEscalationPromptGuidance,
  getRetentionAwareStartingRung,
  detectPartialProgress,
  getPartialProgressInstruction,
} from './escalation';
import type { EscalationState } from './escalation';

// ---------------------------------------------------------------------------
// createInitialEscalationState
// ---------------------------------------------------------------------------

describe('createInitialEscalationState', () => {
  it('starts at rung 1 with zero counters', () => {
    const state = createInitialEscalationState();

    expect(state.currentRung).toBe(1);
    expect(state.hintCount).toBe(0);
    expect(state.questionsAtCurrentRung).toBe(0);
    expect(state.totalExchanges).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateEscalation
// ---------------------------------------------------------------------------

describe('evaluateEscalation', () => {
  const baseState: EscalationState = {
    currentRung: 1,
    hintCount: 0,
    questionsAtCurrentRung: 0,
    totalExchanges: 0,
  };

  it('does not escalate on a normal response with few exchanges', () => {
    const decision = evaluateEscalation(baseState, 'I think the answer is 42');

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.newRung).toBe(1);
  });

  it('escalates after reaching question threshold at rung 1', () => {
    const state: EscalationState = {
      ...baseState,
      questionsAtCurrentRung: 2, // will become 3 (>= threshold)
    };

    const decision = evaluateEscalation(state, 'Hmm, let me think...');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
    expect(decision.reason).toBeDefined();
  });

  it('escalates from rung 2 to rung 3 on threshold', () => {
    const state: EscalationState = {
      currentRung: 2,
      hintCount: 0,
      questionsAtCurrentRung: 2,
      totalExchanges: 5,
    };

    const decision = evaluateEscalation(state, 'Still not sure');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(3);
  });

  it('escalates from rung 3 to rung 4', () => {
    const state: EscalationState = {
      currentRung: 3,
      hintCount: 1,
      questionsAtCurrentRung: 2,
      totalExchanges: 8,
    };

    const decision = evaluateEscalation(state, 'Maybe?');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(4);
  });

  it('escalates from rung 4 to rung 5', () => {
    const state: EscalationState = {
      currentRung: 4,
      hintCount: 2,
      questionsAtCurrentRung: 2,
      totalExchanges: 11,
    };

    const decision = evaluateEscalation(state, 'I still cannot figure it out');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(5);
  });

  it('never escalates beyond rung 5', () => {
    const state: EscalationState = {
      currentRung: 5,
      hintCount: 3,
      questionsAtCurrentRung: 10,
      totalExchanges: 20,
    };

    const decision = evaluateEscalation(state, 'I still do not get it');

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.newRung).toBe(5);
    expect(decision.reason).toContain('maximum');
  });

  // UX-16: "I don't know" is valid input, not failure
  describe('"I don\'t know" handling (UX-16)', () => {
    it('escalates immediately when learner says "I don\'t know"', () => {
      const decision = evaluateEscalation(baseState, "I don't know");

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.newRung).toBe(2);
      expect(decision.reason).toContain('stuck');
    });

    it('handles "idk" as a stuck indicator', () => {
      const decision = evaluateEscalation(baseState, 'idk');

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.newRung).toBe(2);
    });

    it('handles "I\'m stuck" as a stuck indicator', () => {
      const decision = evaluateEscalation(baseState, "I'm stuck on this");

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.newRung).toBe(2);
    });

    it('handles "I\'m confused" as a stuck indicator', () => {
      const decision = evaluateEscalation(baseState, "I'm confused about this");

      expect(decision.shouldEscalate).toBe(true);
    });

    it('caps stuck escalation at rung 5', () => {
      const state: EscalationState = {
        currentRung: 4,
        hintCount: 2,
        questionsAtCurrentRung: 0,
        totalExchanges: 10,
      };

      const decision = evaluateEscalation(state, "I don't know at all");

      expect(decision.shouldEscalate).toBe(true);
      expect(decision.newRung).toBe(5);
    });

    it('does not escalate beyond 5 even with stuck at rung 5', () => {
      const state: EscalationState = {
        currentRung: 5,
        hintCount: 3,
        questionsAtCurrentRung: 0,
        totalExchanges: 15,
      };

      const decision = evaluateEscalation(state, "I don't know");

      expect(decision.shouldEscalate).toBe(false);
      expect(decision.newRung).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// getEscalationPromptGuidance
// ---------------------------------------------------------------------------

describe('getEscalationPromptGuidance', () => {
  it('returns Socratic guidance for rung 1', () => {
    const guidance = getEscalationPromptGuidance(1, 'learning');

    expect(guidance).toContain('Socratic');
    expect(guidance).toContain('Rung 1');
  });

  it('returns Socratic guidance for rung 2', () => {
    const guidance = getEscalationPromptGuidance(2, 'learning');

    expect(guidance).toContain('Socratic');
    expect(guidance).toContain('Rung 2');
  });

  it('returns Parallel Example guidance for rung 3', () => {
    const guidance = getEscalationPromptGuidance(3, 'learning');

    expect(guidance).toContain('Parallel Example');
  });

  it('returns Transfer Bridge guidance for rung 4', () => {
    const guidance = getEscalationPromptGuidance(4, 'learning');

    expect(guidance).toContain('Transfer Bridge');
  });

  it('returns Teaching Mode guidance for rung 5', () => {
    const guidance = getEscalationPromptGuidance(5, 'learning');

    expect(guidance).toContain('Teaching Mode');
    expect(guidance).toContain('last step');
  });

  it('adds homework guard for homework sessions', () => {
    const guidance = getEscalationPromptGuidance(1, 'homework');

    expect(guidance).toContain('homework session');
    expect(guidance).toContain('NEVER give the answer directly');
  });

  it('does not add homework guard for learning sessions', () => {
    const guidance = getEscalationPromptGuidance(1, 'learning');

    expect(guidance).not.toContain('homework session');
  });

  it('includes homework guard at every rung for homework sessions', () => {
    for (const rung of [1, 2, 3, 4, 5] as const) {
      const guidance = getEscalationPromptGuidance(rung, 'homework');
      expect(guidance).toContain('NEVER give the answer directly');
    }
  });

  it('rung 2 includes negative constraints', () => {
    const guidance = getEscalationPromptGuidance(2, 'learning');

    expect(guidance).toContain('Do NOT ask the same question');
    expect(guidance).toContain('Do NOT ask a question that requires');
    expect(guidance).toContain('Do NOT ask open-ended questions');
    expect(guidance).toContain('binary or single-variable');
  });
});

// ---------------------------------------------------------------------------
// Partial progress detection (Gap 3)
// ---------------------------------------------------------------------------

describe('partial progress detection', () => {
  const baseState: EscalationState = {
    currentRung: 1,
    hintCount: 0,
    questionsAtCurrentRung: 2,
    totalExchanges: 2,
  };

  it('holds rung when response is long enough at early exchanges (engaged heuristic)', () => {
    const decision = evaluateEscalation(
      baseState, // questionsAtCurrentRung: 2 (below threshold 3)
      'I think the answer involves the mitochondria because it produces energy for the cell'
    );

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.newRung).toBe(1);
    expect(decision.reason).toContain('Partial progress');
  });

  it('does NOT hold on verbose wrong answer past threshold without LLM signal', () => {
    const state: EscalationState = {
      ...baseState,
      questionsAtCurrentRung: 3, // at threshold — heuristic alone insufficient
    };

    const decision = evaluateEscalation(
      state,
      'I think I know but I am not really sure about this to be honest with you'
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
  });

  it('holds rung when previous AI response had [PARTIAL_PROGRESS]', () => {
    const state: EscalationState = {
      ...baseState,
      previousResponseHadPartialProgress: true,
    };

    const decision = evaluateEscalation(state, 'yes');

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.newRung).toBe(1);
    expect(decision.reason).toContain('Partial progress');
  });

  it('still escalates on stuck indicator even with long response', () => {
    const decision = evaluateEscalation(
      baseState,
      "I don't know what the answer is, I'm completely lost and confused"
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
  });

  it('escalates short non-engaged responses past threshold', () => {
    const decision = evaluateEscalation(baseState, 'no');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
  });

  it('detectPartialProgress returns true for marker', () => {
    expect(detectPartialProgress('Good attempt!\n[PARTIAL_PROGRESS]')).toBe(
      true
    );
  });

  it('detectPartialProgress returns false without marker', () => {
    expect(detectPartialProgress('Good attempt! Keep trying.')).toBe(false);
  });

  it('escalates after MAX_PARTIAL_PROGRESS_HOLDS consecutive holds (cap)', () => {
    const state: EscalationState = {
      ...baseState,
      consecutiveHolds: 2,
    };

    const decision = evaluateEscalation(
      state,
      'I think the answer involves the mitochondria because it produces energy for the cell'
    );

    // Despite engaged response, hold budget is exhausted — escalate normally
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
  });

  it('holds when within hold budget', () => {
    const state: EscalationState = {
      ...baseState,
      consecutiveHolds: 1,
    };

    const decision = evaluateEscalation(
      state,
      'I think the answer involves the mitochondria because it produces energy for the cell'
    );

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.reason).toContain('Partial progress');
  });
});

// ---------------------------------------------------------------------------
// Retention-aware starting rung (Gap 4)
// ---------------------------------------------------------------------------

describe('getRetentionAwareStartingRung', () => {
  it('returns rung 1 for strong retention', () => {
    expect(getRetentionAwareStartingRung('strong')).toBe(1);
  });

  it('returns rung 1 for fading retention (threshold is reduced instead)', () => {
    expect(getRetentionAwareStartingRung('fading')).toBe(1);
  });

  it('returns rung 2 for weak retention', () => {
    expect(getRetentionAwareStartingRung('weak')).toBe(2);
  });

  it('returns rung 3 for forgotten retention', () => {
    expect(getRetentionAwareStartingRung('forgotten')).toBe(3);
  });

  it('returns rung 1 for new topics', () => {
    expect(getRetentionAwareStartingRung('new')).toBe(1);
  });

  it('returns rung 1 when undefined', () => {
    expect(getRetentionAwareStartingRung(undefined)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Retention-aware escalation speed (Gap 4)
// ---------------------------------------------------------------------------

describe('retention-aware escalation speed', () => {
  it('escalates after 2 exchanges for fading retention (reduced threshold)', () => {
    const state: EscalationState = {
      currentRung: 1,
      hintCount: 0,
      questionsAtCurrentRung: 1,
      totalExchanges: 1,
      retentionStatus: 'fading',
    };

    const decision = evaluateEscalation(state, 'no');

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.newRung).toBe(2);
  });

  it('does not escalate after 1 exchange for strong retention', () => {
    const state: EscalationState = {
      currentRung: 1,
      hintCount: 0,
      questionsAtCurrentRung: 1,
      totalExchanges: 1,
      retentionStatus: 'strong',
    };

    const decision = evaluateEscalation(state, 'no');

    expect(decision.shouldEscalate).toBe(false);
    expect(decision.newRung).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getPartialProgressInstruction
// ---------------------------------------------------------------------------

describe('getPartialProgressInstruction', () => {
  it('includes PARTIAL_PROGRESS marker instruction', () => {
    const instruction = getPartialProgressInstruction();

    expect(instruction).toContain('[PARTIAL_PROGRESS]');
    expect(instruction).toContain('partial understanding');
  });

  it('includes negative constraints for marker usage', () => {
    const instruction = getPartialProgressInstruction();

    expect(instruction).toContain('Do NOT use [PARTIAL_PROGRESS] if');
  });
});
