/**
 * i18n Phase 1 — locale coverage tests for the router personalization preamble.
 *
 * These tests are the runtime equivalent of the per-flow Tier-1 prompt-assembly
 * fixtures called out in
 * docs/plans/2026-05-26-i18n-phase1-llm-language-threading.md (T14, T15).
 *
 * Why this lives next to router.test.ts and not under apps/api/eval-llm/:
 * the eval harness's `buildPrompt` returns the per-flow user/system pair
 * BEFORE `withSafetyPreamble` (which adds the personalization line) runs
 * inside `routeAndCall`. Asserting the preamble through the harness would
 * require modifying every flow file. Driving the preamble end-to-end through
 * `routeAndCall` with a spy provider is structurally identical and avoids
 * per-flow harness changes.
 *
 * Coverage rule (spec §"Behavioural regression test"):
 *   • One assertion per learner-facing flow tag at `nb` (Norwegian).
 *     Proves the directive reaches the assembled system prompt for every
 *     surface threaded by T5–T11.
 *   • One assertion per non-English locale (de, es, ja, pl, pt) for the
 *     canonical `session.recap` flow. Proves the `CONVERSATION_LANGUAGE_NAMES`
 *     lookup table renders the correct language name for each code.
 *
 * Together these cover the matrix without exploding into 10×17 snapshots.
 */

import {
  registerProvider,
  routeAndCall,
  _clearProviders,
  _resetCircuits,
} from './router';
import { createMockProvider } from './providers/mock';
import { makeChatStreamResult } from './types';
import type {
  ChatMessage,
  ChatResult,
  ChatStreamResult,
  LLMProvider,
  StopReason,
} from './types';

const okResult: ChatResult = { content: 'ok', stopReason: 'stop' };

// Mirror of LEARNER_FACING_FLOWS in router.ts. Kept in sync via the ratchet
// test (router.language-coverage.test.ts) which enforces threading at every
// call site that uses one of these tags; if a new tag is added there, the
// per-flow assertion below ensures it also produces the right directive.
const LEARNER_FACING_FLOW_TAGS = [
  'exchange.process',
  'exchange.stream',
  'dictation.review',
  'progress-summary-generation',
  'session-llm-summary',
  'session.recap',
  'session.highlights',
  'monthly.report',
  'book.generation',
  'book.suggestion',
  'curriculum.generate',
  'dictation.generate',
  'dictation.prepare-homework',
  'homework.summary',
  'quiz.generate',
  'assessment.evaluate',
  'recall.bridge',
  'post.session.suggestions',
  'summaries.generate',
] as const;

// (locale code, language name) pairs matching CONVERSATION_LANGUAGE_NAMES in router.ts:151.
const LOCALE_NAME_PAIRS = [
  ['nb', 'Norwegian'],
  ['de', 'German'],
  ['es', 'Spanish'],
  ['ja', 'Japanese'],
  ['pl', 'Polish'],
  ['pt', 'Portuguese'],
] as const;

function spyProviderCapturing(captured: ChatMessage[][]): LLMProvider {
  return {
    id: 'gemini',
    async chat(messages: ChatMessage[]) {
      captured.push(messages);
      return okResult;
    },
    chatStream(): ChatStreamResult {
      return makeChatStreamResult(
        (async function* () {
          yield 'ok';
        })(),
        Promise.resolve<StopReason>('stop'),
      );
    },
  };
}

describe('locale coverage — every learner-facing flow renders the conversationLanguage directive (i18n Phase 1 T14)', () => {
  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
  });

  afterAll(() => {
    _clearProviders();
    _resetCircuits();
    registerProvider(createMockProvider('gemini'));
  });

  it.each(LEARNER_FACING_FLOW_TAGS)(
    'flow %s + conversationLanguage=nb prepends the Norwegian directive',
    async (flow) => {
      const captured: ChatMessage[][] = [];
      registerProvider(spyProviderCapturing(captured));

      await routeAndCall([{ role: 'user', content: 'Hello' }], 1, {
        flow,
        conversationLanguage: 'nb',
      });

      expect(captured).toHaveLength(1);
      const system = captured[0]![0]!.content;
      expect(typeof system).toBe('string');
      expect(system).toContain(
        'Write only the learner-visible prose inside the JSON "reply" field in Norwegian unless the learner switches.',
      );
    },
  );
});

describe('locale coverage — every non-English locale renders its language name (i18n Phase 1 T15)', () => {
  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
  });

  afterAll(() => {
    _clearProviders();
    _resetCircuits();
    registerProvider(createMockProvider('gemini'));
  });

  it.each(LOCALE_NAME_PAIRS)(
    'session.recap + conversationLanguage=%s prepends the %s directive',
    async (code, languageName) => {
      const captured: ChatMessage[][] = [];
      registerProvider(spyProviderCapturing(captured));

      await routeAndCall([{ role: 'user', content: 'Hello' }], 1, {
        flow: 'session.recap',
        conversationLanguage: code,
      });

      const system = captured[0]![0]!.content as string;
      expect(system).toContain(
        `in ${languageName} unless the learner switches`,
      );
    },
  );
});
