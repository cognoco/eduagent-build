import * as graderPrompt from '../../src/services/challenge-round/grader-prompt';
import type { MessagePart } from '../../src/services/llm/types';
import {
  challengeGraderFlow,
  type ChallengeGraderInput,
} from './challenge-grader';

describe('challengeGraderFlow prompt extraction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('joins text from multipart system and user messages', () => {
    const systemContent: MessagePart[] = [
      { type: 'text', text: 'System rubric' },
      { type: 'inline_data', mimeType: 'image/png', data: 'base64-image' },
      { type: 'text', text: 'Return JSON' },
    ];
    const userContent: MessagePart[] = [
      { type: 'text', text: 'Question context' },
      { type: 'text', text: 'Learner answer' },
    ];
    jest
      .spyOn(graderPrompt, 'buildChallengeRoundGraderPrompt')
      .mockReturnValue([
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ]);

    const input: ChallengeGraderInput = {
      scenarioId: 'multipart-content',
      description: 'Multipart prompt extraction regression',
      askedQuestion: 'Why?',
      learnerAnswer: 'Because.',
      expectedResult: 'solid',
      axisNote: 'Text parts must reach the eval harness.',
      ageBracket: 'adolescent',
      conversationLanguage: 'en',
    };

    const messages = challengeGraderFlow.buildPrompt(input);

    expect(messages.system).toBe('System rubric\nReturn JSON');
    expect(messages.user).toBe('Question context\nLearner answer');
    expect(messages.system).not.toHaveLength(0);
    expect(messages.user).not.toHaveLength(0);
  });
});
