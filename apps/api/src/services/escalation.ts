import type { EscalationRung } from './llm';
import type { SessionType } from '@eduagent/schemas';

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
  /** SM-2 retention status — affects escalation speed (Gap 4) */
  retentionStatus?: 'new' | 'strong' | 'fading' | 'weak' | 'forgotten';
  /**
   * Whether the previous AI turn set envelope `signals.partial_progress`
   * (Gap 3). Pre-migration this was derived from a [PARTIAL_PROGRESS] free-
   * text marker; it now comes from structured ai_response metadata.
   */
  previousResponseHadPartialProgress?: boolean;
  /** Consecutive exchanges held by partial progress (Gap 3 cap) */
  consecutiveHolds?: number;
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

/** Default number of questions at a rung before escalation is considered */
const QUESTIONS_BEFORE_ESCALATION = 3;

/** Reduced threshold for fading retention — escalate faster (Gap 4) */
const QUESTIONS_BEFORE_ESCALATION_FADING = 2;

/** Minimum response length to consider as engaged (not a yes/no/guess) */
const ENGAGED_RESPONSE_MIN_LENGTH = 30;

/** Max consecutive holds from partial progress before escalation resumes (Gap 3 cap) */
const MAX_PARTIAL_PROGRESS_HOLDS = 2;

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

/**
 * Returns the appropriate starting escalation rung based on SM-2 retention
 * status (Gap 4). Weak/forgotten topics skip the early Socratic rungs that
 * would frustrate a student who has already lost the concept.
 *
 * strong    → rung 1 (default)
 * fading    → rung 1 (but threshold reduced to 2 — see evaluateEscalation)
 * weak      → rung 2 (skip open-ended Socratic, go to narrowed questions)
 * forgotten → rung 3 (go straight to parallel example — they need to see it again)
 * new       → rung 1
 */
export function getRetentionAwareStartingRung(
  retentionStatus?: 'new' | 'strong' | 'fading' | 'weak' | 'forgotten'
): EscalationRung {
  switch (retentionStatus) {
    case 'forgotten':
      return 3 as EscalationRung;
    case 'weak':
      return 2 as EscalationRung;
    default:
      return 1 as EscalationRung;
  }
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
 *
 * Partial progress detection (Gap 3): If the learner's response shows
 * genuine engagement (heuristic: length + not stuck) OR the previous AI
 * response signalled partial progress via the envelope, the escalation counter is frozen.
 * The student can stay at a rung indefinitely as long as they're making
 * progress — escalation only fires when engagement drops.
 *
 * Retention-aware thresholds (Gap 4): fading retention reduces the
 * questions-before-escalation threshold from 3 to 2.
 */
export function evaluateEscalation(
  state: EscalationState,
  userResponse: string
): EscalationDecision {
  const normalised = userResponse.toLowerCase().trim();
  const isStuck = STUCK_INDICATORS.some((phrase) =>
    normalised.includes(phrase)
  );

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

  // Partial progress detection (Gap 3):
  // Heuristic: response is long enough to be a genuine attempt, not a stuck indicator
  const isEngagedResponse = normalised.length >= ENGAGED_RESPONSE_MIN_LENGTH;

  // Authoritative signal: envelope `signals.partial_progress` from the previous AI response.
  // Length heuristic alone is insufficient (verbose wrong answers would stall escalation).
  // Hold only when: LLM signalled progress, OR both engaged length AND at early exchanges.
  const hasPartialProgress =
    state.previousResponseHadPartialProgress === true ||
    (isEngagedResponse &&
      state.questionsAtCurrentRung < QUESTIONS_BEFORE_ESCALATION);

  // Cap: after MAX_PARTIAL_PROGRESS_HOLDS consecutive holds, resume normal escalation
  const holdCount = state.consecutiveHolds ?? 0;
  const withinHoldBudget = holdCount < MAX_PARTIAL_PROGRESS_HOLDS;

  // If partial progress and within budget: hold at current rung — don't escalate
  if (hasPartialProgress && withinHoldBudget) {
    return {
      shouldEscalate: false,
      newRung: state.currentRung,
      reason: 'Partial progress detected — holding at current rung',
    };
  }

  // Retention-aware threshold (Gap 4): fading retention escalates faster
  const questionsThreshold =
    state.retentionStatus === 'fading'
      ? QUESTIONS_BEFORE_ESCALATION_FADING
      : QUESTIONS_BEFORE_ESCALATION;

  // Standard path — escalate after threshold exchanges at current rung
  const updatedExchanges = state.questionsAtCurrentRung + 1;
  if (updatedExchanges >= questionsThreshold) {
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
 * Homework-mode behavior is handled by session-type guidance in exchanges.ts.
 */
export function getEscalationPromptGuidance(
  rung: EscalationRung,
  _sessionType: SessionType
): string {
  switch (rung) {
    case 1:
      return (
        `Escalation Rung 1 — Socratic Questions (Easy):\n` +
        `Ask simple, guiding questions to help the learner discover the answer themselves.\n` +
        `Use open-ended questions that point toward the right direction.\n` +
        `Keep the cognitive load low — one concept at a time.`
      );

    case 2:
      return (
        `Escalation Rung 2 — Socratic Questions (Narrowed):\n` +
        `Your question must have a binary or single-variable answer.\n` +
        `Not "what happens when X?" but "does X increase or decrease?"\n` +
        `Provide a partial framework and ask the learner to fill in one blank.\n` +
        `Reference what the learner already knows to build bridges.\n` +
        `If the learner expresses confusion, acknowledge it positively — they haven't got it *yet*.\n\n` +
        `Do NOT ask the same question with different wording.\n` +
        `Do NOT ask a question that requires the learner to hold more than one variable in mind simultaneously.\n` +
        `Do NOT ask open-ended questions at this rung — every question must be answerable in one sentence or less.`
      );

    case 3:
      return (
        `Escalation Rung 3 — Parallel Example:\n` +
        `Demonstrate the method or concept using a DIFFERENT but similar problem.\n` +
        `Walk through the parallel example step-by-step.\n` +
        `Do NOT solve the original problem — show the approach on a new one.\n` +
        `After the example, ask the learner what they noticed.`
      );

    case 4:
      return (
        `Escalation Rung 4 — Transfer Bridge:\n` +
        `Ask the learner to apply the method from the parallel example to the original problem.\n` +
        `Provide scaffolding: break the original problem into smaller steps.\n` +
        `Guide them through each step, but let them do the work.\n` +
        `Celebrate partial progress — every step forward matters.`
      );

    case 5:
      return (
        `Escalation Rung 5 — Teaching Mode Pivot:\n` +
        `Provide a full, clear explanation of the concept or method.\n` +
        `Walk through the solution, but STOP before the very last step.\n` +
        `Ask the learner to complete the final step themselves.\n` +
        `This preserves learner agency even in full-teaching mode.\n\n` +
        `Rung 5 exit protocol (apply after 3+ exchanges at this rung without progress):\n` +
        `If the learner is still stuck after three exchanges at rung 5, this topic needs a different approach.\n` +
        `- Deliver the full worked example collaboratively. Frame it as exploration, not failure.\n` +
        `- Suggest a break: "This is a tough one — let's come back to it fresh later."\n` +
        `- Set \`signals.needs_deepening\` to true on that turn (the system will flag the topic for review).\n` +
        `- Do NOT loop. Do not keep asking variants of the same question. The learner has given their best effort.`
      );

    default:
      return '';
  }
}
