import { learnerRecapLlmOutputSchema } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import {
  buildRecapPrompt,
  getAgeVoiceTierLabel,
} from '../../src/services/session-recap';
import { callLlm } from '../runner/llm-bootstrap';

interface SessionRecapInput {
  transcriptText: string;
  ageVoiceTier: string;
  nextTopicTitle: string | null;
}

function synthesizeTranscript(profile: EvalProfile): string {
  const currentTopic = profile.libraryTopics[0] ?? 'a topic';
  const nextTopic = profile.libraryTopics[1] ?? 'the next topic';
  const struggle = profile.struggles[0]?.topic ?? 'the tricky part';

  return [
    `Student: Can we go over ${currentTopic}?`,
    `Mentor: Absolutely. What part feels most solid already?`,
    `Student: I know the basics, but ${struggle} keeps throwing me off.`,
    `Mentor: Let's unpack that step by step and connect it back to the bigger idea.`,
    `Student: So that means it loops back into ${nextTopic}?`,
    `Mentor: Yes — you just connected the output back to what starts the process.`,
    `Student: Okay, I think I finally see why that step matters.`,
    `Mentor: Great. Put it in your own words one more time.`,
  ].join('\n\n');
}

export const sessionRecapFlow: FlowDefinition<SessionRecapInput> = {
  id: 'session-recap',
  name: 'Session Recap (learner-facing)',
  sourceFile: 'apps/api/src/services/session-recap.ts:buildRecapPrompt',

  buildPromptInput(profile: EvalProfile): SessionRecapInput {
    return {
      transcriptText: synthesizeTranscript(profile),
      ageVoiceTier: getAgeVoiceTierLabel(profile.birthYear),
      nextTopicTitle: profile.libraryTopics[1] ?? null,
    };
  },

  buildPrompt(input: SessionRecapInput): PromptMessages {
    return {
      system: buildRecapPrompt(input.ageVoiceTier, input.nextTopicTitle),
      user: input.transcriptText,
      notes: [
        `Age tier: ${input.ageVoiceTier}`,
        `Next topic: ${input.nextTopicTitle ?? 'none'}`,
        'Transcript is a synthetic 8-turn learner recap fixture.',
      ],
    };
  },

  expectedResponseSchema: {
    safeParse(value: unknown) {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return learnerRecapLlmOutputSchema.safeParse(parsed);
      } catch (error) {
        return { success: false, error };
      }
    },
  },

  async runLive(
    _input: SessionRecapInput,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'session-recap', rung: 2 },
    );
  },
};
