import {
  _clearProviders,
  _resetCircuits,
  routeAndCall,
  routeAndStream,
} from '../services/llm';
import {
  createLlmProviderFixture,
  llmEnvelopeReply,
  llmInvalidJson,
  llmPlainText,
  llmStructuredJson,
  registerLlmProviderFixture,
} from './llm-provider-fixtures';
import type { ModelConfig } from '../services/llm/types';

const TEST_CONFIG: ModelConfig = {
  provider: 'gemini',
  model: 'fixture-model',
  maxTokens: 256,
};

afterEach(() => {
  _clearProviders();
  _resetCircuits();
});

describe('LLM provider fixtures', () => {
  it('registers a structured JSON provider and records routeAndCall inputs', async () => {
    const fixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({ accepted: true }),
    });

    const result = await routeAndCall(
      [{ role: 'user', content: 'Evaluate this answer' }],
      1,
    );

    expect(JSON.parse(result.response)).toEqual({ accepted: true });
    expect(fixture.chatCalls).toHaveLength(1);
    expect(fixture.chatCalls[0]?.messages.at(-1)?.content).toBe(
      'Evaluate this answer',
    );
  });

  it('supports explicit plain text and invalid JSON responses', async () => {
    const fixture = createLlmProviderFixture({
      chatResponses: [llmPlainText('plain response'), llmInvalidJson()],
    });

    await expect(fixture.provider.chat([], TEST_CONFIG)).resolves.toEqual({
      content: 'plain response',
      stopReason: 'stop',
    });
    await expect(fixture.provider.chat([], TEST_CONFIG)).resolves.toEqual({
      content: '{"reply": "unfinished"',
      stopReason: 'stop',
    });
  });

  it('streams envelope-shaped responses in chunks', async () => {
    const envelope = llmEnvelopeReply('streamed answer');
    registerLlmProviderFixture({
      streamResponse: envelope,
      chunkSize: 5,
    });

    const result = await routeAndStream(
      [{ role: 'user', content: 'Stream' }],
      1,
    );
    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe(envelope);
    await expect(result.stopReasonPromise).resolves.toBe('stop');
  });

  it('can queue provider failures before a later success', async () => {
    const fixture = createLlmProviderFixture({
      chatErrors: [new Error('temporary provider failure')],
      chatResponse: llmPlainText('recovered'),
    });

    await expect(fixture.provider.chat([], TEST_CONFIG)).rejects.toThrow(
      'temporary provider failure',
    );
    await expect(fixture.provider.chat([], TEST_CONFIG)).resolves.toEqual({
      content: 'recovered',
      stopReason: 'stop',
    });
  });
});
