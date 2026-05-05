import { llmSummarySchema } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { buildSessionSummaryPrompt } from '../../src/services/session-llm-summary';
import { callLlm } from '../runner/llm-bootstrap';

interface SessionSummaryInput {
  transcriptText: string;
  subjectName: string | null;
  topicTitle: string | null;
}

function inferSubject(profile: EvalProfile): string | null {
  return profile.strengths[0]?.subject ?? profile.struggles[0]?.subject ?? null;
}

function synthesizeTranscript(profile: EvalProfile): string {
  const topic = profile.libraryTopics[0] ?? 'this topic';
  const struggle = profile.struggles[0]?.topic ?? 'the trickiest step';
  const explanation =
    profile.preferredExplanations[0] ?? 'worked example explanations';

  return [
    `Learner: Can we go over ${topic}?`,
    `Mentor: Absolutely. Let us use ${explanation} and take it one step at a time.`,
    `Learner: I keep getting stuck on ${struggle}.`,
    `Mentor: Let us slow that step down and compare two versions side by side.`,
    `Learner: I think I see how ${topic} connects back to the earlier example now.`,
    `Mentor: Great. Explain the pattern in your own words so we know where to resume next time.`,
  ].join('\n\n');
}

export const sessionSummaryFlow: FlowDefinition<SessionSummaryInput> = {
  id: 'session-summary',
  name: 'Session Summary (retention self-note)',
  sourceFile:
    'apps/api/src/services/session-llm-summary.ts:buildSessionSummaryPrompt',

  buildPromptInput(profile: EvalProfile): SessionSummaryInput {
    return {
      transcriptText: synthesizeTranscript(profile),
      subjectName: inferSubject(profile),
      topicTitle: profile.libraryTopics[0] ?? null,
    };
  },

  buildPrompt(input: SessionSummaryInput): PromptMessages {
    const prompt = buildSessionSummaryPrompt(input);
    return {
      system: prompt.system,
      user: prompt.user,
      notes: [
        ...(prompt.notes ?? []),
        'Synthetic transcript mirrors the retention-summary schema contract.',
      ],
    };
  },

  expectedResponseSchema: {
    safeParse(value: unknown) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return llmSummarySchema.safeParse(parsed);
      } catch (error) {
        return { success: false, error };
      }
    },
  },

  async runLive(
    _input: SessionSummaryInput,
    messages: PromptMessages
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'session-summary', rung: 2 }
    );
  },
};
