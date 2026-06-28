import {
  buildRecallGradeMessages,
  recallGradeJsonSchema,
} from '../../src/services/retention-data';
import { getTextContent } from '../../src/services/llm/types';
import type { EvalProfile } from '../fixtures/profiles';
import { callLlm } from '../runner/llm-bootstrap';
import type { FlowDefinition, PromptMessages } from '../runner/types';

interface RecallGraderInput {
  topicTitle: string;
  topicDescription: string;
  answer: string;
}

// expectedResponseSchema is the SAME schema processRecallTest enforces
// (imported from services/retention-data.ts — no drift mirror). A live grader
// response that drifts from this shape OR is internally inconsistent
// (verdict/quality mismatch) falls back to fallback_heuristic in production, so
// the eval guards the exact contract. (Flow 2 / RR-9 / T4.)
export const recallGraderFlow: FlowDefinition<RecallGraderInput> = {
  id: 'recall-grader',
  name: 'Recall Grader',
  sourceFile:
    'apps/api/src/services/retention-data.ts:buildRecallGradeMessages',
  expectedResponseSchema: recallGradeJsonSchema,

  buildPromptInput(profile: EvalProfile): RecallGraderInput {
    const topic = profile.libraryTopics[0] ?? 'Current topic';
    // A partial recall answer: some relevant knowledge, incomplete — exercises
    // the verdict classification without trivially scoring 5 or 0.
    const answer =
      profile.struggles[0]?.topic ??
      'I remember the main idea is about cause and effect, but I can not explain the steps that connect them.';
    return {
      topicTitle: topic,
      topicDescription: `Core ideas and worked examples from ${topic}.`,
      answer,
    };
  },

  buildPrompt(input: RecallGraderInput): PromptMessages {
    const messages = buildRecallGradeMessages(
      input.answer,
      input.topicTitle,
      input.topicDescription,
    );

    return {
      system: messages[0] ? getTextContent(messages[0].content) : '',
      user: messages[1] ? getTextContent(messages[1].content) : '',
      notes: [
        'Grader must return ONLY the JSON object {quality, verdict, rationale, misconception}.',
        'quality 0-5 SM-2 scale; verdict in solid|partial|missing|misconception.',
        'A non-conforming response falls back to fallback_heuristic (no SM-2 advance).',
      ],
    };
  },

  async runLive(
    _input: RecallGraderInput,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'recall-grader', rung: 1 },
    );
  },
};
