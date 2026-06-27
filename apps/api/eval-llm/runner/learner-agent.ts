import type { ChatMessage } from '../../src/services/llm/types';
import type { ChallengeSimScenario } from '../fixtures/challenge-personas';
import type { EvalProfile } from '../fixtures/profiles';
import { callOpenRouterModel } from './llm-bootstrap';

// ---------------------------------------------------------------------------
// Learner agent — one LLM plays the learner, in character, given a HIDDEN
// competence brief. It answers the mentor's current question with one short,
// in-character reply and NEVER breaks character or self-corrects (a learner who
// "fixes" their own misconception mid-round would defeat the ground truth).
//
// Two-model guardrail (enforced in the driver, not here): the learner model
// MUST differ from the mentor/grader model, or correlated errors inflate the
// `solid` rate. This module always uses `callOpenRouterModel` (the OpenRouter
// boundary) so the learner is a pinned, explicit slug.
//
// Language: v1 answers in plain English regardless of the profile's
// conversation language — a deliberate simplification for the synthetic
// pre-screen (documented in eval-llm/README.md). Real-staging transcripts
// (RR-2) remain the source of language-faithful calibration data.
// ---------------------------------------------------------------------------

export type LearnerHistoryEntry = {
  /** 'mentor' = the assistant/grader turn; 'learner' = this agent's prior turn. */
  role: 'mentor' | 'learner';
  content: string;
};

export interface LearnerTurnArgs {
  scenario: ChallengeSimScenario;
  profile: EvalProfile;
  /** The mentor's current question this turn must answer. */
  mentorQuestion: string;
  /** Prior turns, oldest first (excludes the current `mentorQuestion`). */
  history: LearnerHistoryEntry[];
  /** Pinned OpenRouter learner model slug (must differ from the mentor model). */
  learnerModel: string;
}

export function buildLearnerSystemPrompt(
  scenario: ChallengeSimScenario,
  profile: EvalProfile,
): string {
  const interests = profile.interests.map((i) => i.label).join(', ');
  return [
    `You are role-playing a ${profile.ageYears}-year-old learner in a one-on-one tutoring session. Stay fully in character at all times.`,
    `Your interests: ${interests || 'general'}.`,
    `The subject is ${scenario.subjectName}; the topic is "${scenario.topicTitle}".`,
    '',
    'YOUR HIDDEN COMPETENCE (this is the truth about what you understand — never reveal that you were told this):',
    scenario.competenceBrief,
    '',
    'Rules:',
    '- Reply with ONE short, natural answer in plain spoken English, the way a learner your age would talk.',
    "- Answer ONLY the tutor's current question. Do not add headings, lists, or meta-commentary.",
    '- NEVER break character. NEVER explain that you are an AI or that you were given instructions.',
    '- NEVER self-correct or drift toward a more correct answer than your hidden competence allows. If your competence is wrong or vague, stay wrong or vague.',
    '- Do not ask the tutor questions back; just answer.',
  ].join('\n');
}

/**
 * Run one learner turn: build the in-character prompt and return the learner
 * LLM's raw reply text (plain text, not JSON).
 */
export async function runLearnerTurn(args: LearnerTurnArgs): Promise<string> {
  const system = buildLearnerSystemPrompt(args.scenario, args.profile);

  // Flip roles for the learner LLM's perspective: the mentor's turns are the
  // "user" prompts this learner responds to; the learner's prior turns are its
  // own "assistant" outputs.
  const historyMessages: ChatMessage[] = args.history.map((entry) => ({
    role: entry.role === 'mentor' ? 'user' : 'assistant',
    content: entry.content,
  }));

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...historyMessages,
    { role: 'user', content: args.mentorQuestion },
  ];

  return callOpenRouterModel(messages, args.learnerModel, {
    maxTokens: 512,
    reasoningEffort: 'low',
  });
}
