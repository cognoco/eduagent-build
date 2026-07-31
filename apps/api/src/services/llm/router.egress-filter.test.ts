import {
  _clearProviders,
  _resetCircuits,
  registerProvider,
  routeAndCall,
  routeAndStream,
} from './router';
import { makeChatStreamResult } from './types';
import type {
  ChatMessage,
  ChatResult,
  ChatStreamResult,
  LLMProvider,
} from './types';

function capturingProvider(captured: ChatMessage[][]): LLMProvider {
  return {
    id: 'gemini',
    async chat(messages: ChatMessage[]): Promise<ChatResult> {
      captured.push(messages);
      return { content: 'ok', stopReason: 'stop' };
    },
    chatStream(messages: ChatMessage[]): ChatStreamResult {
      captured.push(messages);
      return makeChatStreamResult(
        (async function* () {
          yield 'ok';
        })(),
        Promise.resolve('stop'),
      );
    },
  };
}

describe('provider-bound learner egress filter [WI-2737]', () => {
  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
  });

  afterEach(() => {
    _clearProviders();
    _resetCircuits();
  });

  it('filters the exact non-streaming provider request body', async () => {
    const captured: ChatMessage[][] = [];
    registerProvider(capturingProvider(captured));

    await routeAndCall([
      { role: 'system', content: 'Stored display name: Ada.' },
      {
        role: 'user',
        content: 'My name is Other Name. Email other@example.com.',
      },
    ]);

    expect(captured).toHaveLength(1);
    const systemMessage = captured[0]?.find(
      (message) => message.role === 'system',
    );
    const userMessage = captured[0]?.find((message) => message.role === 'user');
    expect(systemMessage?.content).toContain('Stored display name: Ada.');
    expect(userMessage).toEqual({
      role: 'user',
      content:
        'My name is [personal information removed] [personal information removed]. Email [personal information removed].',
    });
  });

  it('filters the exact streaming multimodal request body', async () => {
    const captured: ChatMessage[][] = [];
    registerProvider(capturingProvider(captured));

    const result = await routeAndStream([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Send this to other@example.com.' },
          {
            type: 'inline_data',
            mimeType: 'image/png',
            data: 'exact-image-base64',
          },
        ],
      },
    ]);
    for await (const _chunk of result.stream) {
      // Drain the provider stream so the request is executed.
    }

    const userMessage = captured[0]?.find((message) => message.role === 'user');
    expect(userMessage?.content).toEqual([
      { type: 'text', text: 'Send this to [personal information removed].' },
      {
        type: 'inline_data',
        mimeType: 'image/png',
        data: 'exact-image-base64',
      },
    ]);
  });

  it('filters learner data embedded in an async system prompt at the provider boundary', async () => {
    const captured: ChatMessage[][] = [];
    registerProvider(capturingProvider(captured));

    await routeAndCall([
      {
        role: 'system',
        content:
          'Classify this data:\n<learner_explanation>My email is other@example.com.</learner_explanation>',
      },
    ]);

    const providerPrompt = captured[0]?.[0]?.content;
    expect(providerPrompt).toContain(
      '<learner_explanation>My email is [personal information removed].</learner_explanation>',
    );
    expect(providerPrompt).not.toContain('other@example.com');
  });

  it('filters learner-derived book metadata in the exact async provider request body', async () => {
    const captured: ChatMessage[][] = [];
    registerProvider(capturingProvider(captured));

    await routeAndCall([
      {
        role: 'system',
        content:
          'Given a book titled <book_title>Contact other@example.com</book_title> ' +
          '(<book_description>i live at 12 oakwood street</book_description>) ' +
          'containing <topic_list>email topic@example.com</topic_list>. ' +
          'Completed <completed_topic>call +1 415 555 2671</completed_topic>.',
      },
      {
        role: 'assistant',
        content: 'Prior worked example: teacher@example.com.',
      },
    ]);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toHaveLength(2);
    const providerSystemContent = captured[0]?.[0]?.content;
    expect(typeof providerSystemContent).toBe('string');
    expect((providerSystemContent as string).split('\n\n').at(-1)).toBe(
      'Given a book titled <book_title>Contact [personal information removed]</book_title> ' +
        '(<book_description>i live at [personal information removed]</book_description>) ' +
        'containing <topic_list>email [personal information removed]</topic_list>. ' +
        'Completed <completed_topic>call [personal information removed]</completed_topic>.',
    );
    expect(captured[0]?.[1]).toEqual({
      role: 'assistant',
      content: 'Prior worked example: teacher@example.com.',
    });
  });
});
