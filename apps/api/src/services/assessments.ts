import { routeAndCall } from './llm';
import type { ChatMessage } from './llm';

// ---------------------------------------------------------------------------
// Assessment Engine — Stories 3.1, 3.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Verification depth levels (UX-19) */
export type VerificationDepth = 'recall' | 'explain' | 'transfer';

export interface QuickCheckContext {
  topicTitle: string;
  topicDescription: string;
  recentExchanges: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface QuickCheckResult {
  questions: string[];
  checkType: 'concept_boundary';
}

export interface AssessmentContext {
  topicTitle: string;
  topicDescription: string;
  currentDepth: VerificationDepth;
  exchangeHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AssessmentEvaluation {
  feedback: string;
  passed: boolean;
  shouldEscalateDepth: boolean;
  nextDepth?: VerificationDepth;
  masteryScore: number; // 0-1, capped by depth: recall max 0.5, explain max 0.8, transfer max 1.0
  qualityRating: number; // 0-5 for SM-2 input
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mastery score caps per verification depth */
const DEPTH_CAPS: Record<VerificationDepth, number> = {
  recall: 0.5,
  explain: 0.8,
  transfer: 1.0,
};

/** Depth progression order */
const DEPTH_ORDER: VerificationDepth[] = ['recall', 'explain', 'transfer'];

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const QUICK_CHECK_SYSTEM_PROMPT = `You are EduAgent's assessment engine. Generate 2-3 inline comprehension questions for a quick check.

Rules:
- Questions must require the learner to EXPLAIN their reasoning, not just give final answers (FR44).
- Focus on concept boundaries — where understanding typically breaks down.
- Questions should be concise and specific.
- Use "you" to address the learner directly.

Respond in this exact JSON format:
{
  "questions": ["Question 1?", "Question 2?", "Question 3?"]
}

Generate exactly 2-3 questions.`;

const ASSESSMENT_EVAL_SYSTEM_PROMPT = `You are EduAgent's assessment evaluator. Evaluate the learner's answer at the specified verification depth.

Verification depths:
- recall: Can the learner remember key facts and definitions?
- explain: Can the learner explain the concept in their own words?
- transfer: Can the learner apply the concept to a new situation?

Rules:
- NEVER use the words "wrong", "incorrect", or "mistake".
- Use "Not Yet" framing — if the learner missed something, they haven't got it *yet*.
- Identify WHERE the learner's thinking went wrong (FR45), not just THAT it was wrong.
- Be encouraging and specific.
- qualityRating: 0 = no understanding, 1 = very poor, 2 = poor, 3 = adequate, 4 = good, 5 = excellent.
- passed: true if the learner demonstrated sufficient understanding at this depth.
- shouldEscalateDepth: true if the learner should attempt the next deeper verification level.
- rawScore: a score between 0 and 1 representing answer quality at this depth.

Respond in this exact JSON format:
{
  "feedback": "Your feedback here (2-4 sentences, using Not Yet framing)",
  "passed": true/false,
  "shouldEscalateDepth": true/false,
  "rawScore": 0.0-1.0,
  "qualityRating": 0-5
}`;

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Generates 2-3 inline comprehension questions for a quick check.
 *
 * Uses routeAndCall with rung 2 (Gemini Flash sufficient).
 * Questions require learner to explain reasoning (FR44).
 */
export async function generateQuickCheck(
  context: QuickCheckContext
): Promise<QuickCheckResult> {
  const exchangeContext = context.recentExchanges
    .map((e) => `${e.role}: ${e.content}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: QUICK_CHECK_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Topic: ${context.topicTitle}\n` +
        `Description: ${context.topicDescription}\n\n` +
        `Recent conversation:\n${exchangeContext}\n\n` +
        `Generate 2-3 quick check questions for this topic.`,
    },
  ];

  const result = await routeAndCall(messages, 2);
  return parseQuickCheckResult(result.response);
}

/**
 * Evaluates a learner's answer at the current verification depth.
 *
 * Uses routeAndCall with rung 2.
 * Mastery score is capped by depth achieved:
 * - recall: max 0.5
 * - explain: max 0.8
 * - transfer: max 1.0
 */
export async function evaluateAssessmentAnswer(
  context: AssessmentContext,
  answer: string
): Promise<AssessmentEvaluation> {
  const exchangeContext = context.exchangeHistory
    .map((e) => `${e.role}: ${e.content}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: ASSESSMENT_EVAL_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Topic: ${context.topicTitle}\n` +
        `Description: ${context.topicDescription}\n` +
        `Verification depth: ${context.currentDepth}\n\n` +
        `Conversation history:\n${exchangeContext}\n\n` +
        `Learner's answer:\n${answer}`,
    },
  ];

  const result = await routeAndCall(messages, 2);
  return parseAssessmentEvaluation(result.response, context.currentDepth);
}

/**
 * Returns the next verification depth, or null if at the deepest level.
 *
 * Progression: recall -> explain -> transfer -> null
 */
export function getNextVerificationDepth(
  current: VerificationDepth
): VerificationDepth | null {
  const currentIndex = DEPTH_ORDER.indexOf(current);
  if (currentIndex === -1 || currentIndex >= DEPTH_ORDER.length - 1) {
    return null;
  }
  return DEPTH_ORDER[currentIndex + 1];
}

/**
 * Calculates mastery score, capped by depth achieved.
 *
 * recall: max 0.5, explain: max 0.8, transfer: max 1.0
 */
export function calculateMasteryScore(
  depth: VerificationDepth,
  rawScore: number
): number {
  const cap = DEPTH_CAPS[depth];
  const clamped = Math.max(0, Math.min(1, rawScore));
  return Math.min(clamped, cap);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseQuickCheckResult(response: string): QuickCheckResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.questions) && parsed.questions.length >= 2) {
        return {
          questions: parsed.questions.slice(0, 3).map(String),
          checkType: 'concept_boundary',
        };
      }
    }
  } catch {
    // Fall through to default
  }

  // Graceful fallback — return generic questions
  return {
    questions: [
      `Can you explain the key idea behind ${response.slice(
        0,
        30
      )}... in your own words?`,
      `Why is this concept important? What problem does it solve?`,
    ],
    checkType: 'concept_boundary',
  };
}

function parseAssessmentEvaluation(
  response: string,
  depth: VerificationDepth
): AssessmentEvaluation {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const rawScore = Number(parsed.rawScore ?? 0);
      const masteryScore = calculateMasteryScore(depth, rawScore);
      const qualityRating = Math.max(
        0,
        Math.min(5, Number(parsed.qualityRating ?? 0))
      );
      const passed = Boolean(parsed.passed);
      const shouldEscalateDepth = Boolean(parsed.shouldEscalateDepth);
      const nextDepth = shouldEscalateDepth
        ? getNextVerificationDepth(depth)
        : undefined;

      return {
        feedback: String(parsed.feedback ?? response),
        passed,
        shouldEscalateDepth,
        nextDepth: nextDepth ?? undefined,
        masteryScore,
        qualityRating,
      };
    }
  } catch {
    // Fall through to default
  }

  // Graceful fallback
  return {
    feedback: response,
    passed: false,
    shouldEscalateDepth: false,
    masteryScore: 0,
    qualityRating: 0,
  };
}
