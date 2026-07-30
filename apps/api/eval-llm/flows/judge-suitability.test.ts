import * as suitabilityPrompt from '../../src/services/policy-engine/judge-suitability-prompt';
import type { MessagePart } from '../../src/services/llm/types';
import {
  judgeSuitabilityFlow,
  type JudgeSuitabilityEvalInput,
} from './judge-suitability';

describe('judgeSuitabilityFlow prompt extraction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('joins text from multipart system and user messages', () => {
    const systemContent: MessagePart[] = [
      { type: 'text', text: 'Safety rubric' },
      { type: 'inline_data', mimeType: 'image/png', data: 'base64-image' },
      { type: 'text', text: 'Judge independently' },
    ];
    const userContent: MessagePart[] = [
      { type: 'text', text: 'Learner context' },
      { type: 'text', text: 'Tutor reply' },
    ];
    jest
      .spyOn(suitabilityPrompt, 'buildSuitabilityJudgePrompt')
      .mockReturnValue([
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ]);

    const input: JudgeSuitabilityEvalInput = {
      scenarioId: 'multipart-content',
      description: 'Multipart prompt extraction regression',
      reply: 'A tutor reply.',
      precedingLearnerMessage: 'A learner message.',
      ageBracket: 'adolescent',
      conversationLanguage: 'en',
    };

    const messages = judgeSuitabilityFlow.buildPrompt(input);

    expect(messages.system).toBe('Safety rubric\nJudge independently');
    expect(messages.user).toBe('Learner context\nTutor reply');
    expect(messages.system).not.toHaveLength(0);
    expect(messages.user).not.toHaveLength(0);
  });
});
