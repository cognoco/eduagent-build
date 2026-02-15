import { registerProvider, createMockProvider } from './llm';
import { processInterviewExchange } from './interview';
import type { InterviewContext } from './interview';

// Register mock as 'gemini' so the router resolves correctly
beforeAll(() => {
  registerProvider(createMockProvider('gemini'));
});

describe('processInterviewExchange', () => {
  const baseContext: InterviewContext = {
    subjectName: 'TypeScript',
    exchangeHistory: [],
  };

  it('returns a response from the LLM', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('marks exchange as incomplete when marker is absent', async () => {
    const result = await processInterviewExchange(baseContext, 'Hello');

    expect(result.isComplete).toBe(false);
  });

  it('passes exchange history to the LLM', async () => {
    const context: InterviewContext = {
      subjectName: 'Python',
      exchangeHistory: [
        { role: 'assistant', content: 'What brings you to Python?' },
        { role: 'user', content: 'I want to learn data science.' },
      ],
    };

    const result = await processInterviewExchange(
      context,
      'I have some experience with JavaScript.'
    );

    // The mock provider echoes part of the last user message
    expect(result.response).toContain('I have some experience');
  });
});
