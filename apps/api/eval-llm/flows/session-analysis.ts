import { SESSION_ANALYSIS_PROMPT } from '../../src/services/learner-profile';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';

// ---------------------------------------------------------------------------
// Flow adapter — Session Analysis
//
// Runs AFTER a session ends. Takes a transcript + subject/topic context and
// extracts signals (interests, struggles, strengths, engagement, deadlines)
// that get written back to learning_profiles.
//
// Audit P0 item: this prompt doesn't receive the learner's EXISTING struggles
// / interests / suppressed-inferences — so it re-emits signals the system
// already knows about. Also no age, so engagement signals aren't calibrated.
// ---------------------------------------------------------------------------

interface SessionAnalysisInput {
  subject: string;
  topic: string;
  rawInput: string;
  /** Synthesized transcript passed as the user message. */
  transcriptText: string;
}

/**
 * Derive a synthetic session context from the profile so each snapshot
 * exercises a plausible post-session scenario.
 */
function synthesizeSessionContext(profile: EvalProfile): SessionAnalysisInput {
  const topic = profile.libraryTopics[0] ?? 'General';
  const subject = inferSubjectFromTopic(topic);
  const primaryInterest = profile.interests[0]?.label ?? 'learning';
  const rawInput = `I want to learn about ${topic}. I'm into ${primaryInterest}.`;

  // Fake a short 5-turn transcript that touches the profile's first struggle
  // so the snapshot shows the model having real signal to extract.
  const struggleTopic = profile.struggles[0]?.topic ?? 'something new';
  const transcript = [
    `Learner: Can we start with ${topic}?`,
    `Mentor: Sure! Let's see what you already know. What comes to mind first?`,
    `Learner: I know a little, but ${struggleTopic} always confuses me.`,
    `Mentor: Good that you said that. Let me show it step by step.`,
    `Learner: Oh! Okay that makes more sense now. Can we try one more?`,
  ].join('\n\n');

  return {
    subject,
    topic,
    rawInput,
    transcriptText: transcript,
  };
}

/** Crude subject inference — enough for a synthetic fixture. */
function inferSubjectFromTopic(topic: string): string {
  const lower = topic.toLowerCase();
  if (/spanish|french|italian|german|english|czech/.test(lower))
    return 'Languages';
  if (
    /algebra|fraction|multiplication|division|polynomial|arithmetic/.test(lower)
  )
    return 'Mathematics';
  if (/physic|newton|force|motion/.test(lower)) return 'Physics';
  if (/history|civil war|reconstruction|enlightenment/.test(lower))
    return 'History';
  if (/philosoph|existentialis|camus/.test(lower)) return 'Philosophy';
  if (
    /biolog|body|cycle|animal|dinosaur|fossil|paleontolog|mesozoic|plate/.test(
      lower
    )
  )
    return 'Science';
  if (/read|comprehension|essay|subjunctive|writing|story|reading/.test(lower))
    return 'Language Arts';
  return 'Freeform';
}

export const sessionAnalysisFlow: FlowDefinition<SessionAnalysisInput> = {
  id: 'session-analysis',
  name: 'Session Analysis (post-session)',
  sourceFile:
    'apps/api/src/services/learner-profile.ts:SESSION_ANALYSIS_PROMPT',

  buildPromptInput(profile: EvalProfile): SessionAnalysisInput {
    return synthesizeSessionContext(profile);
  },

  buildPrompt(input: SessionAnalysisInput): PromptMessages {
    // Reproduce the production substitution logic verbatim.
    const system = SESSION_ANALYSIS_PROMPT.replace('{subject}', input.subject)
      .replace('{topic}', input.topic)
      .replace('{rawInput}', input.rawInput);

    return {
      system,
      user: input.transcriptText,
      notes: [
        `Interpolates: subject=${input.subject}, topic=${input.topic}.`,
        `MISSING: existing struggles/interests — prompt emits duplicates it can't see.`,
        `MISSING: suppressed_inferences — LLM will re-emit signals the learner explicitly deleted.`,
        `MISSING: age — engagement/confidence signals aren't age-calibrated.`,
        `Transcript (user msg) is a synthetic 5-turn fake for snapshot purposes.`,
      ],
    };
  },
};
