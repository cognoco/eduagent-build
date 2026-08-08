// ---------------------------------------------------------------------------
// [WI-3140] Tripwire-to-memory firewall — exchange-layer signal.
//
// `ExchangeResult.safetyFlagged` / `ExchangeStreamResult.safetyFlagged` is the
// carrier that tells the session layer to stamp `learning_sessions
// .safety_flagged_at`, which in turn excludes the session from memory analysis
// and the embeddings index. Two detector families must both raise it:
//
//   1. the deterministic tripwire (text + image OCR, streaming + non-streaming)
//   2. the model-layer `signals.crisis_redirect` envelope signal
//
// These tests pin the signal at the exchange boundary. The DB write and the
// session-completed enforcement are pinned in
// `session-completed-safety-firewall.integration.test.ts`.
// ---------------------------------------------------------------------------

import { registerProvider, type LLMProvider } from './llm';
import { createMockProvider } from './llm/test-utils';
import { makeChatStreamResult, type ChatStreamResult } from './llm/types';
import { processExchange, streamExchange } from './exchanges';
import type { ExchangeContext } from './exchanges';
import { setOcrProvider, resetOcrProvider, type OcrProvider } from './ocr';

// This suite exercises crisis-redirect paths that dispatch through safeSend.
// Own only the external Inngest boundary so no network promise can survive
// Jest teardown; the production exchange and safeSend implementations stay real.
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
// gc1-allow: Own the external Inngest send boundary so network calls cannot outlive Jest teardown.
jest.mock('../inngest/client', () => {
  const actual = jest.requireActual(
    '../inngest/client',
  ) as typeof import('../inngest/client');
  return {
    ...actual,
    inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
  };
});

const currentYear = new Date().getFullYear();

/** Under-18 learner — routes off Gemini onto an approved provider (WI-1052). */
const baseContext: ExchangeContext = {
  sessionId: 'sess-safety-flag',
  profileId: 'prof-safety-flag',
  subjectName: 'Mathematics',
  topicTitle: 'Quadratic Equations',
  topicDescription: 'Solving quadratic equations using the quadratic formula',
  sessionType: 'learning',
  escalationRung: 1,
  exchangeHistory: [],
  birthYear: currentYear - 14,
};

/** Fails loudly if the deterministic floor ever hands the input to a model. */
const throwingProvider: LLMProvider = {
  id: 'cerebras',
  async chat() {
    throw new Error('LLM must not be called when the safety tripwire fires');
  },
  chatStream(): never {
    throw new Error('LLM must not be called when the safety tripwire fires');
  },
};

function envelopeProvider(signals: Record<string, unknown>): LLMProvider {
  const body = JSON.stringify({
    reply: 'That sounds really hard. Please talk to an adult you trust.',
    signals,
    confidence: 'high',
  });
  return {
    id: 'cerebras',
    async chat() {
      return { content: body, stopReason: 'stop' as const };
    },
    chatStream(): ChatStreamResult {
      return makeChatStreamResult(
        (async function* () {
          yield body;
        })(),
        Promise.resolve('stop' as const),
      );
    },
  };
}

beforeAll(() => {
  registerProvider(createMockProvider('gemini'));
  registerProvider(createMockProvider('cerebras'));
});

afterEach(() => {
  registerProvider(createMockProvider('gemini'));
  registerProvider(createMockProvider('cerebras'));
  resetOcrProvider();
  mockInngestSend.mockReset().mockResolvedValue(undefined);
});

describe('processExchange — safetyFlagged', () => {
  it('[BREAK] raises safetyFlagged on a deterministic tripwire hit', async () => {
    registerProvider(throwingProvider);

    const result = await processExchange(baseContext, 'my dad hits me');

    expect(result.provider).toBe('safety-tripwire');
    expect(result.safetyFlagged).toBe(true);
  });

  it('[BREAK] raises safetyFlagged when the image screen cannot clear the attachment', async () => {
    registerProvider(throwingProvider);
    const failingOcr: OcrProvider = {
      async extractText() {
        throw new Error('OCR unavailable');
      },
    };
    setOcrProvider(failingOcr);

    const result = await processExchange(baseContext, 'can you read this?', {
      base64: Buffer.from('image').toString('base64'),
      mimeType: 'image/jpeg',
    });

    expect(result.safetyFlagged).toBe(true);
  });

  it('[BREAK] raises safetyFlagged when the model envelope carries crisis_redirect', async () => {
    registerProvider(envelopeProvider({ crisis_redirect: true }));

    const result = await processExchange(baseContext, 'I feel awful today');

    expect(result.provider).not.toBe('safety-tripwire');
    expect(result.safetyFlagged).toBe(true);
  });

  it('leaves safetyFlagged false on an ordinary curriculum turn', async () => {
    registerProvider(envelopeProvider({ understanding_check: false }));

    const result = await processExchange(baseContext, 'Explain quadratics');

    expect(result.safetyFlagged).toBe(false);
  });
});

describe('streamExchange — safetyFlagged', () => {
  it('[BREAK] raises safetyFlagged on a deterministic tripwire hit', async () => {
    registerProvider(throwingProvider);

    const result = await streamExchange(baseContext, 'how do i kill myself');
    for await (const _chunk of result.stream) {
      // drain
    }

    expect(result.provider).toBe('safety-tripwire');
    expect(result.safetyFlagged).toBe(true);
  });

  it('[BREAK] raises safetyFlagged when the image screen cannot clear the attachment', async () => {
    registerProvider(throwingProvider);
    const failingOcr: OcrProvider = {
      async extractText() {
        throw new Error('OCR unavailable');
      },
    };
    setOcrProvider(failingOcr);

    const result = await streamExchange(baseContext, 'can you read this?', {
      base64: Buffer.from('image').toString('base64'),
      mimeType: 'image/jpeg',
    });
    for await (const _chunk of result.stream) {
      // drain
    }

    expect(result.safetyFlagged).toBe(true);
  });

  it('leaves safetyFlagged false on an ordinary curriculum turn', async () => {
    registerProvider(envelopeProvider({ understanding_check: false }));

    const result = await streamExchange(baseContext, 'Explain quadratics');
    for await (const _chunk of result.stream) {
      // drain
    }

    expect(result.safetyFlagged).toBe(false);
  });
});
