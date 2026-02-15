import {
  createInitialEscalationState,
  evaluateEscalation,
  getEscalationPromptGuidance,
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
});
