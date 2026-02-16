// ---------------------------------------------------------------------------
// Adaptive Teaching — Stories 3.7, 3.8, 3.9
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

export interface StrikeState {
  conceptId: string;
  wrongCount: number;
  maxStrikes: number;
}

export interface StrikeResult {
  action: 'continue_socratic' | 'switch_to_direct' | 'flag_needs_deepening';
  strikesUsed: number;
}

export interface NeedsDeepeningState {
  topicId: string;
  subjectId: string;
  consecutiveSuccessCount: number;
  status: 'active' | 'resolved';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum strikes before switching to direct instruction */
const DEFAULT_MAX_STRIKES = 3;

/** Maximum active "Needs Deepening" topics per subject */
const MAX_NEEDS_DEEPENING_PER_SUBJECT = 10;

/** Consecutive successes required to exit Needs Deepening (FR63) */
const EXIT_CONSECUTIVE_SUCCESSES = 3;

/** Available teaching method options */
const TEACHING_METHODS = [
  'visual_diagrams',
  'step_by_step',
  'real_world_examples',
  'practice_problems',
] as const;

// ---------------------------------------------------------------------------
// Strike system — 3-strike rule per concept per session
// ---------------------------------------------------------------------------

/** Create the initial strike state for a concept */
export function createStrikeState(conceptId: string): StrikeState {
  return {
    conceptId,
    wrongCount: 0,
    maxStrikes: DEFAULT_MAX_STRIKES,
  };
}

/**
 * Records a wrong answer and determines the next action.
 *
 * Strike 1-2: continue_socratic — keep using Socratic method
 * Strike 3: switch_to_direct — switch to direct instruction with examples
 * After direct instruction fails: flag_needs_deepening
 */
export function recordWrongAnswer(state: StrikeState): StrikeResult {
  const newWrongCount = state.wrongCount + 1;

  if (newWrongCount < state.maxStrikes) {
    return {
      action: 'continue_socratic',
      strikesUsed: newWrongCount,
    };
  }

  if (newWrongCount === state.maxStrikes) {
    return {
      action: 'switch_to_direct',
      strikesUsed: newWrongCount,
    };
  }

  // Beyond max strikes — direct instruction was already tried
  return {
    action: 'flag_needs_deepening',
    strikesUsed: newWrongCount,
  };
}

// ---------------------------------------------------------------------------
// Direct instruction
// ---------------------------------------------------------------------------

/**
 * Returns prompt text for direct instruction mode.
 *
 * Uses "Not Yet" framing throughout — the learner hasn't mastered this *yet*.
 */
export function getDirectInstructionPrompt(
  topicTitle: string,
  concept: string
): string {
  return (
    `The learner hasn't mastered "${concept}" in "${topicTitle}" yet. ` +
    `Switch to direct instruction mode:\n\n` +
    `1. Acknowledge that this concept is challenging — they haven't got it *yet*, and that is okay.\n` +
    `2. Explain the concept clearly and directly with a concrete example.\n` +
    `3. Walk through the example step-by-step.\n` +
    `4. Use a "Not Yet" frame: "You're building understanding of this. Let's look at it from a different angle."\n` +
    `5. After explaining, ask the learner to restate the concept in their own words.\n` +
    `6. If the learner still struggles, that is a signal for Needs Deepening — this topic needs more time.`
  );
}

// ---------------------------------------------------------------------------
// Needs Deepening
// ---------------------------------------------------------------------------

/**
 * Determines if a concept should be added to the Needs Deepening list.
 *
 * True when 3 strikes have been used (direct instruction was applied).
 */
export function shouldAddToNeedsDeepening(state: StrikeState): boolean {
  return state.wrongCount >= state.maxStrikes;
}

/**
 * Determines if a topic can exit the Needs Deepening list.
 *
 * Requires 3+ consecutive successes (FR63).
 */
export function canExitNeedsDeepening(state: NeedsDeepeningState): boolean {
  return state.consecutiveSuccessCount >= EXIT_CONSECUTIVE_SUCCESSES;
}

/**
 * Checks capacity of Needs Deepening topics for a subject.
 *
 * Max 10 active topics per subject. If at capacity and trying to add another,
 * the one closest to exit (highest consecutiveSuccessCount) should be promoted.
 */
export function checkNeedsDeepeningCapacity(currentCount: number): {
  atCapacity: boolean;
  shouldPromote: boolean;
} {
  const atCapacity = currentCount >= MAX_NEEDS_DEEPENING_PER_SUBJECT;
  return {
    atCapacity,
    shouldPromote: atCapacity,
  };
}

// ---------------------------------------------------------------------------
// Teaching method preferences
// ---------------------------------------------------------------------------

/** Returns the available teaching method options */
export function getTeachingMethodOptions(): string[] {
  return [...TEACHING_METHODS];
}

/**
 * Builds prompt context for the chosen teaching method.
 *
 * This context is injected into the system prompt to guide the AI's
 * teaching approach for the current exchange.
 */
export function buildMethodPreferencePrompt(method: string): string {
  switch (method) {
    case 'visual_diagrams':
      return (
        `Teaching method preference: visual_diagrams\n` +
        `Use ASCII diagrams, tables, and visual representations to explain concepts.\n` +
        `Draw relationships between ideas visually. Use arrows, boxes, and structured layouts.\n` +
        `Prefer showing over telling whenever possible.`
      );

    case 'step_by_step':
      return (
        `Teaching method preference: step_by_step\n` +
        `Break every explanation into clearly numbered steps.\n` +
        `Each step should build on the previous one. Keep steps small and focused.\n` +
        `Check understanding after each step before moving to the next.`
      );

    case 'real_world_examples':
      return (
        `Teaching method preference: real_world_examples\n` +
        `Ground every concept in a real-world analogy or example.\n` +
        `Connect abstract ideas to everyday experiences the learner can relate to.\n` +
        `Use stories, scenarios, and practical applications to make concepts tangible.`
      );

    case 'practice_problems':
      return (
        `Teaching method preference: practice_problems\n` +
        `Teach through guided practice. Present problems of increasing difficulty.\n` +
        `Start with simple cases and build complexity gradually.\n` +
        `Provide immediate feedback on each attempt.`
      );

    default:
      return `Teaching method preference: ${method}\nAdapt your teaching style to this method.`;
  }
}
