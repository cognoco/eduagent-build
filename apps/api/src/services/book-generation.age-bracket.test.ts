// ---------------------------------------------------------------------------
// [WI-2432] AC-2 — book-generation.ts (detectSubjectType, generateBookTopics)
// threads ageBracket to the router's under-18 vendor-exclusion gate.
//
// Before this fix, callBookGenerationJson never supplied ageBracket to
// routeAndCall — it only omitted providerPolicy: 'gemini_only' for a
// non-adult learnerAge, which stops the caller from actively REQUESTING
// Gemini but does not stop the router's own DEFAULT branch from picking
// Gemini for a registered provider on the legacy (routing V2 off) path
// (isUnder18AgeBracket gates on ageBracket, which was never supplied). This
// suite uses the REAL router (registerProvider + setLlmRoutingV2Enabled(false),
// no ./llm mock — book-generation.test.ts mocks routeAndCall directly, which
// cannot exercise the router's actual gate) so the assertion is genuinely
// end-to-end: the Gemini provider must never be invoked for an under-18
// learner.
// ---------------------------------------------------------------------------

import {
  registerProvider,
  setLlmRoutingV2Enabled,
  _clearProviders,
  _resetCircuits,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type StopReason,
} from './llm';
import { makeChatStreamResult } from './llm/types';
import { detectSubjectType, generateBookTopics } from './book-generation';

/**
 * [WI-2432] Mock provider whose chat() fails `failCount` times then succeeds
 * — same pattern as router.test.ts's local `createTransientFailProvider`
 * (not exported from providers/mock, so re-declared per file). Used to force
 * the primary provider past MAX_RETRIES(3) (4 attempts) so routeAndCall
 * actually reaches getFallbackConfig (router.ts:1064), not just
 * getModelConfig (router.ts:908) — the two sites have independent
 * isUnder18AgeBracket gates (WI-1986 fixed the fallback one after it shipped
 * ungated), so a test that only exercises the primary path would not prove
 * ageBracket also reaches the fallback call.
 */
function createTransientFailProvider(
  id: string,
  failCount: number,
  successContent: string,
): LLMProvider & { callCount: number } {
  let calls = 0;
  return {
    id,
    async chat(): Promise<{ content: string; stopReason: StopReason }> {
      calls++;
      if (calls <= failCount) {
        throw new Error(`[WI-2432 test] simulated transient failure #${calls}`);
      }
      return { content: successContent, stopReason: 'stop' };
    },
    get callCount() {
      return calls;
    },
    chatStream() {
      const s = (async function* () {
        yield 'unused';
      })();
      return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
    },
  };
}

function bookJson() {
  // bookGenerationResultSchema requires >=5 books for a 'broad' result.
  return JSON.stringify({
    type: 'broad',
    books: [
      {
        title: 'Ancient Egypt',
        description: 'Pyramids',
        emoji: '🏛️',
        sortOrder: 1,
      },
      {
        title: 'Ancient Greece',
        description: 'Democracy',
        emoji: '⚔️',
        sortOrder: 2,
      },
      {
        title: 'Ancient Rome',
        description: 'Empires',
        emoji: '🏺',
        sortOrder: 3,
      },
      {
        title: 'Medieval Worlds',
        description: 'Kingdoms',
        emoji: '🏰',
        sortOrder: 4,
      },
      {
        title: 'Modern Revolutions',
        description: 'Industry',
        emoji: '⚙️',
        sortOrder: 5,
      },
    ],
  });
}

function bookTopicsJson() {
  // bookTopicGenerationResultSchema requires >=5 topics across >=2 chapters.
  return JSON.stringify({
    topics: [
      {
        title: 'Timeline',
        description: 'How it began',
        chapter: 'The Story',
        sortOrder: 1,
        estimatedMinutes: 30,
      },
      {
        title: 'Old Kingdom',
        description: 'Age of pyramids',
        chapter: 'The Story',
        sortOrder: 2,
        estimatedMinutes: 30,
      },
      {
        title: 'Pyramids',
        description: 'How were they built',
        chapter: 'Monuments',
        sortOrder: 3,
        estimatedMinutes: 25,
      },
      {
        title: 'Daily Life',
        description: 'Ordinary people',
        chapter: 'Society',
        sortOrder: 4,
        estimatedMinutes: 25,
      },
      {
        title: 'Legacy',
        description: 'Why it still matters',
        chapter: 'Society',
        sortOrder: 5,
        estimatedMinutes: 20,
      },
    ],
    connections: [],
  });
}

describe('[WI-2432] book-generation never routes an under-18 learner to Gemini (legacy path)', () => {
  let geminiSpy: jest.Mock;

  beforeEach(() => {
    _clearProviders();
    _resetCircuits();
    setLlmRoutingV2Enabled(false);
    geminiSpy = jest.fn();
    const geminiProvider: LLMProvider = {
      id: 'gemini',
      async chat(...args: Parameters<LLMProvider['chat']>) {
        geminiSpy(...args);
        // Valid content so the one legitimate (adult) case below still
        // resolves successfully — the property under test is "was Gemini
        // invoked at all", not "does Gemini fail when reached".
        return { content: bookJson(), stopReason: 'stop' as StopReason };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    };
    registerProvider(geminiProvider);
  });

  afterEach(() => {
    _clearProviders();
    setLlmRoutingV2Enabled(false);
  });

  it.each([11, 15, 17])(
    'detectSubjectType never invokes Gemini for learnerAge=%i',
    async (learnerAge) => {
      registerProvider({
        id: 'cerebras',
        async chat(_messages: ChatMessage[], _config: ModelConfig) {
          return { content: bookJson(), stopReason: 'stop' as StopReason };
        },
        chatStream() {
          const s = (async function* () {
            yield 'unused';
          })();
          return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
        },
      });

      const result = await detectSubjectType('History', learnerAge);

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result.type).toBe('broad');
    },
  );

  it('generateBookTopics never invokes Gemini for a 12-year-old learner', async () => {
    registerProvider({
      id: 'cerebras',
      async chat(_messages: ChatMessage[], _config: ModelConfig) {
        return { content: bookTopicsJson(), stopReason: 'stop' as StopReason };
      },
      chatStream() {
        const s = (async function* () {
          yield 'unused';
        })();
        return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
      },
    });

    const result = await generateBookTopics(
      'Ancient Egypt',
      'Pyramids and pharaohs',
      12,
    );

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(result.topics.length).toBeGreaterThan(0);
  });

  it('an unambiguously adult learner is unaffected (no regression) — Gemini remains eligible', async () => {
    const result = await detectSubjectType('History', 25);

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('broad');
  });

  // [WI-2432] Pin the age-18 boundary as INTENDED behavior, not an untested
  // gap: ageBracketFromLearnerAge (book-generation.ts) bands a computed
  // learnerAge of exactly 18 as 'adult', matching computeAgeBracketFromDate's
  // year-only fallback (packages/schemas/src/age.ts — the same banding
  // assessments.ts/session-recap.ts use for a year-only birthYear). This is
  // deliberately looser than the separate isUnambiguouslyAdultAge (`> 18`)
  // used only for the gemini_only-pinning decision above; see the docstring
  // on ageBracketFromLearnerAge for why the two thresholds diverge on
  // purpose.
  it("a learner with computed learnerAge=18 is treated as adult (matches computeAgeBracketFromDate's year-only banding) — Gemini remains eligible", async () => {
    const result = await detectSubjectType('History', 18);

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('broad');
  });

  it('forces a primary-provider failure past MAX_RETRIES, driving the call through getFallbackConfig — still never selects Gemini for an under-18 learner', async () => {
    const flakyCerebras = createTransientFailProvider(
      'cerebras',
      4, // 1 + MAX_RETRIES(3) — exhausts the primary's withRetry loop
      bookJson(),
    );
    registerProvider(flakyCerebras);

    const result = await detectSubjectType('History', 12);

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(result.type).toBe('broad');
    // 4 failing primary attempts + 1 succeeding fallback attempt: proves
    // execution actually reached getFallbackConfig's isUnder18AgeBracket
    // gate (router.ts:1064), not just getModelConfig's (router.ts:908).
    expect(flakyCerebras.callCount).toBe(5);
  }, 15000);
});
