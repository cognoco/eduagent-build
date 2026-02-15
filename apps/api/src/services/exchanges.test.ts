import {
  registerProvider,
  createMockProvider,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
} from './llm';
import {
  buildSystemPrompt,
  processExchange,
  streamExchange,
} from './exchanges';
import type { ExchangeContext } from './exchanges';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  registerProvider(createMockProvider('gemini'));
});

/** Base context reused across tests */
const baseContext: ExchangeContext = {
  sessionId: 'sess-1',
  profileId: 'prof-1',
  subjectName: 'Mathematics',
  topicTitle: 'Quadratic Equations',
  topicDescription: 'Solving quadratic equations using the quadratic formula',
  sessionType: 'learning',
  escalationRung: 1,
  exchangeHistory: [],
  personaType: 'TEEN',
};

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('includes the subject name', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Mathematics');
  });

  it('includes the topic title and description', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Quadratic Equations');
    expect(prompt).toContain('quadratic formula');
  });

  it('includes persona voice for TEEN', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Casual and encouraging');
  });

  it('includes persona voice for LEARNER', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      personaType: 'LEARNER',
    });
    expect(prompt).toContain('Professional and focused');
  });

  it('includes persona voice for PARENT', () => {
    const prompt = buildSystemPrompt({ ...baseContext, personaType: 'PARENT' });
    expect(prompt).toContain('Supportive and patient');
  });

  it('includes learning session guidance', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('LEARNING');
  });

  it('includes homework session guidance with Socratic-only rule', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      sessionType: 'homework',
    });
    expect(prompt).toContain('HOMEWORK');
    expect(prompt).toContain('NEVER provide direct answers');
  });

  it('includes escalation guidance for the current rung', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Rung 1');
    expect(prompt).toContain('Socratic');
  });

  it('includes cognitive load guidance', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('1-2 new concepts');
  });

  it('includes "Not Yet" framing guidance', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain('Not yet');
    expect(prompt).toContain('NEVER use words like "wrong"');
  });

  it('includes prior learning context when provided', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      priorLearningContext: 'Learner completed: Variables, Loops',
    });
    expect(prompt).toContain('Learner completed: Variables, Loops');
  });

  it('omits prior learning context when not provided', () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).not.toContain('Prior Learning Context');
  });

  it('includes worked example guidance for "full" level', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      workedExampleLevel: 'full',
    });
    expect(prompt).toContain('FULL');
    expect(prompt).toContain('complete worked examples');
  });

  it('includes worked example guidance for "fading" level', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      workedExampleLevel: 'fading',
    });
    expect(prompt).toContain('FADING');
  });

  it('includes worked example guidance for "problem_first" level', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      workedExampleLevel: 'problem_first',
    });
    expect(prompt).toContain('PROBLEM FIRST');
  });

  it('works without optional fields', () => {
    const minimalContext: ExchangeContext = {
      sessionId: 'sess-1',
      profileId: 'prof-1',
      subjectName: 'Science',
      sessionType: 'learning',
      escalationRung: 1,
      exchangeHistory: [],
      personaType: 'LEARNER',
    };

    const prompt = buildSystemPrompt(minimalContext);
    expect(prompt).toContain('Science');
    expect(prompt).toContain('EduAgent');
  });
});

// ---------------------------------------------------------------------------
// processExchange
// ---------------------------------------------------------------------------

describe('processExchange', () => {
  it('returns a response from the LLM', async () => {
    const result = await processExchange(
      baseContext,
      'What is a quadratic equation?'
    );

    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe('string');
    expect(result.response.length).toBeGreaterThan(0);
  });

  it('returns provider and model info', async () => {
    const result = await processExchange(baseContext, 'Tell me more');

    expect(result.provider).toBeDefined();
    expect(result.model).toBeDefined();
  });

  it('returns latency in milliseconds', async () => {
    const result = await processExchange(baseContext, 'Hello');

    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves the escalation rung from context', async () => {
    const context: ExchangeContext = { ...baseContext, escalationRung: 3 };
    const result = await processExchange(context, 'Help me');

    expect(result.newEscalationRung).toBe(3);
  });

  it('passes exchange history to the LLM', async () => {
    const context: ExchangeContext = {
      ...baseContext,
      exchangeHistory: [
        { role: 'assistant', content: 'Let us explore quadratics.' },
        { role: 'user', content: 'OK, I am ready.' },
      ],
    };

    const result = await processExchange(context, 'What is the formula?');

    // The mock provider echoes part of the last user message
    expect(result.response).toContain('What is the formula');
  });

  it('detects understanding check in response', async () => {
    // Register a provider that includes an understanding check phrase
    const checkProvider: LLMProvider = {
      id: 'gemini',
      async chat(
        _messages: ChatMessage[],
        _config: ModelConfig
      ): Promise<string> {
        return 'Great work! Does that make sense so far?';
      },
      async *chatStream(): AsyncIterable<string> {
        yield 'Does that make sense?';
      },
    };
    registerProvider(checkProvider);

    const result = await processExchange(baseContext, 'I think I understand');
    expect(result.isUnderstandingCheck).toBe(true);

    // Restore generic mock
    registerProvider(createMockProvider('gemini'));
  });

  it('sets isUnderstandingCheck to false when no check marker', async () => {
    const result = await processExchange(baseContext, 'Hello');
    expect(result.isUnderstandingCheck).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// streamExchange
// ---------------------------------------------------------------------------

describe('streamExchange', () => {
  it('returns an async iterable stream', async () => {
    const result = await streamExchange(baseContext, 'Explain quadratics');

    expect(result.stream).toBeDefined();
    expect(result.provider).toBeDefined();
    expect(result.model).toBeDefined();
  });

  it('stream yields string chunks', async () => {
    const result = await streamExchange(baseContext, 'Hello');
    const chunks: string[] = [];

    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(typeof chunks[0]).toBe('string');
  });

  it('preserves escalation rung', async () => {
    const context: ExchangeContext = { ...baseContext, escalationRung: 4 };
    const result = await streamExchange(context, 'Help');

    expect(result.newEscalationRung).toBe(4);
  });
});
