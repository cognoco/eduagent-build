import type { EscalationRung } from './llm';

// ---------------------------------------------------------------------------
// Socratic Escalation Ladder — Stories 2.2, 2.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Tracks escalation state within a learning session */
export interface EscalationState {
  currentRung: EscalationRung;
  hintCount: number;
  questionsAtCurrentRung: number;
  totalExchanges: number;
}

/** Result of evaluating whether to escalate */
export interface EscalationDecision {
  shouldEscalate: boolean;
  newRung: EscalationRung;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of questions at a rung before escalation is considered */
const QUESTIONS_BEFORE_ESCALATION = 3;

/** Phrases that indicate the learner is stuck — valid input, not failure (UX-16) */
const STUCK_INDICATORS = [
  "i don't know",
  'i dont know',
  'idk',
  "i'm not sure",
  'im not sure',
  'no idea',
  "i'm stuck",
  'im stuck',
  'help me',
  'can you explain',
  'i give up',
  "i'm confused",
  'im confused',
  "i don't understand",
  'i dont understand',
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the initial escalation state at rung 1 */
export function createInitialEscalationState(): EscalationState {
  return {
    currentRung: 1,
    hintCount: 0,
    questionsAtCurrentRung: 0,
    totalExchanges: 0,
  };
}

// ---------------------------------------------------------------------------
// Escalation evaluation
// ---------------------------------------------------------------------------

/**
 * Determines whether to escalate based on the learner's response.
 *
 * Rung 1-2: Socratic Questions (Gemini Flash). Escalate after 2-3 questions
 *           without progress.
 * Rung 3:   Parallel Example — demonstrate method on a different problem.
 * Rung 4:   Transfer Bridge — ask learner to apply method to original problem.
 * Rung 5:   Teaching Mode Pivot — full teaching, learner does final step.
 *
 * "I don't know" is treated as a valid signal (UX-16) and triggers faster
 * escalation (after 1 exchange at current rung) rather than being treated
 * as failure.
 */
export function evaluateEscalation(
  state: EscalationState,
  userResponse: string
): EscalationDecision {
  const normalised = userResponse.toLowerCase().trim();
  const isStuck = STUCK_INDICATORS.some((phrase) =>
    normalised.includes(phrase)
  );

  const updatedExchanges = state.questionsAtCurrentRung + 1;

  // Never escalate beyond rung 5
  if (state.currentRung >= 5) {
    return {
      shouldEscalate: false,
      newRung: 5 as EscalationRung,
      reason: 'Already at maximum escalation rung',
    };
  }

  // "I don't know" (UX-16) — escalate faster, after 1 exchange at current rung
  if (isStuck) {
    const nextRung = Math.min(state.currentRung + 1, 5) as EscalationRung;
    return {
      shouldEscalate: true,
      newRung: nextRung,
      reason: 'Learner indicated they are stuck — adjusting approach',
    };
  }

  // Standard path — escalate after QUESTIONS_BEFORE_ESCALATION at current rung
  if (updatedExchanges >= QUESTIONS_BEFORE_ESCALATION) {
    const nextRung = Math.min(state.currentRung + 1, 5) as EscalationRung;
    return {
      shouldEscalate: true,
      newRung: nextRung,
      reason: `No progress after ${updatedExchanges} exchanges at rung ${state.currentRung}`,
    };
  }

  return {
    shouldEscalate: false,
    newRung: state.currentRung,
  };
}

// ---------------------------------------------------------------------------
// Prompt guidance per escalation rung
// ---------------------------------------------------------------------------

/**
 * Returns prompt additions for the current escalation rung.
 * For homework sessions: Socratic-only, never give direct answers.
 */
export function getEscalationPromptGuidance(
  rung: EscalationRung,
  sessionType: 'learning' | 'homework'
): string {
  const homeworkGuard =
    sessionType === 'homework'
      ? '\nCRITICAL: This is a homework session. You must NEVER give the answer directly. Use only Socratic questioning to guide the learner.'
      : '';

  switch (rung) {
    case 1:
      return (
        `Escalation Rung 1 — Socratic Questions (Easy):\n` +
        `Ask simple, guiding questions to help the learner discover the answer themselves.\n` +
        `Use open-ended questions that point toward the right direction.\n` +
        `Keep the cognitive load low — one concept at a time.` +
        homeworkGuard
      );

    case 2:
      return (
        `Escalation Rung 2 — Socratic Questions (Deeper):\n` +
        `Ask more specific guiding questions. Narrow the focus.\n` +
        `Reference what the learner already knows to build bridges.\n` +
        `If the learner expresses confusion, acknowledge it positively — they haven't got it *yet*.` +
        homeworkGuard
      );

    case 3:
      return (
        `Escalation Rung 3 — Parallel Example:\n` +
        `Demonstrate the method or concept using a DIFFERENT but similar problem.\n` +
        `Walk through the parallel example step-by-step.\n` +
        `Do NOT solve the original problem — show the approach on a new one.\n` +
        `After the example, ask the learner what they noticed.` +
        homeworkGuard
      );

    case 4:
      return (
        `Escalation Rung 4 — Transfer Bridge:\n` +
        `Ask the learner to apply the method from the parallel example to the original problem.\n` +
        `Provide scaffolding: break the original problem into smaller steps.\n` +
        `Guide them through each step, but let them do the work.\n` +
        `Celebrate partial progress — every step forward matters.` +
        homeworkGuard
      );

    case 5:
      return (
        `Escalation Rung 5 — Teaching Mode Pivot:\n` +
        `Provide a full, clear explanation of the concept or method.\n` +
        `Walk through the solution, but STOP before the very last step.\n` +
        `Ask the learner to complete the final step themselves.\n` +
        `This preserves learner agency even in full-teaching mode.` +
        homeworkGuard
      );

    default:
      return '';
  }
}
