// ---------------------------------------------------------------------------
// Challenge Round grader rubric prompt builder (2026-06-26 plan T4).
//
// Builds the model-agnostic grading rubric as a system+user ChatMessage pair.
// The model receives only:
//   - the mentor's asked question
//   - the learner's verbatim answer
//   - a coarse age band (tone calibration only — no feature gating)
//   - an optional language hint
//
// No IDs, profile data, or exchange history reach the model — data minimization
// mirrors the suitability judge pattern (MMT-ADR-0016 §2).
//
// Model-agnostic by construction: no vendor or model name appears in the prompt.
// ---------------------------------------------------------------------------

import type { AgeBracket, ConversationLanguage } from '@eduagent/schemas';
import type { ChatMessage } from '../llm';

export interface GraderPromptInput {
  /** The mentor's question that the learner was answering. */
  askedQuestion: string;
  /** The learner's verbatim answer — never modified before this call. */
  learnerAnswer: string;
  /** Optional conversation language for learner-facing output fields. */
  conversationLanguage?: ConversationLanguage;
  /** Coarse age band — calibrates tone only. */
  ageBracket: AgeBracket;
}

function buildSystemPrompt(): string {
  return [
    'You are a precise grading assistant for an educational mentoring app. Your only',
    "task is to grade a learner's answer to a specific question.",
    '',
    'Scoring rubric — assign exactly ONE result per concept:',
    '  solid         — the answer correctly demonstrates the concept with no significant gaps.',
    '  partial       — the answer shows some understanding but has notable gaps or inaccuracies.',
    '  missing       — the answer does not address the concept at all.',
    '  misconception — the answer reveals a demonstrably incorrect understanding.',
    '',
    'Instructions:',
    '1. Identify the ONE concept that the given question is designed to test.',
    "2. Score the learner's answer using the rubric above.",
    '3. Select a short verbatim excerpt from the learner\'s answer as "learnerQuote".',
    '   Do NOT fabricate or paraphrase — use exact words from the answer.',
    '4. Write a single-sentence "evidence" justifying the score.',
    '5. Include a "correction" field ONLY when the result is not "solid".',
    '',
    'Return ONLY a single JSON object — no prose, no explanation, no code fence, nothing',
    'before or after it. The object must have EXACTLY this shape:',
    '{',
    '  "items": [',
    '    {',
    '      "concept": "<the single concept the question tests>",',
    '      "result": "solid | partial | missing | misconception",',
    '      "evidence": "<one-sentence justification>",',
    '      "learnerQuote": "<verbatim excerpt from the learner answer>",',
    '      "correction": "<brief correction — ONLY present when result is not solid>"',
    '    }',
    '  ]',
    '}',
    '',
    'items MUST contain AT LEAST ONE entry. Omit "correction" when result is "solid".',
  ].join('\n');
}

function buildUserPrompt(input: GraderPromptInput): string {
  const ageLine = `Learner age band: ${input.ageBracket} (child = under 13, adolescent = 13–17, adult = 18+). Calibrate tone accordingly.`;
  const langLine = input.conversationLanguage
    ? `Language: ${input.conversationLanguage}. Write the "concept", "evidence", "learnerQuote", and "correction" fields in this language.`
    : 'Language: unspecified (use the same language as the question and answer).';

  return [
    ageLine,
    langLine,
    '',
    'Question asked by the mentor:',
    input.askedQuestion,
    '',
    "Learner's answer:",
    input.learnerAnswer,
  ].join('\n');
}

/**
 * Build the challenge-round grader rubric as a system+user ChatMessage pair,
 * ready to pass to the LLM router.
 */
export function buildChallengeRoundGraderPrompt(
  input: GraderPromptInput,
): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(input) },
  ];
}
