// ---------------------------------------------------------------------------
// [WI-2432] AC-2 — generateLearnerRecap threads ageBracket to the router's
// under-18 vendor-exclusion gate.
//
// Before this fix, input.birthYear was in scope (used only for the prose
// voice tier via getAgeVoiceTierLabel) but never converted to an ageBracket,
// so the router's under-18 Gemini/Vertex exclusion (isUnder18AgeBracket,
// router.ts) could never fire for this flow on the legacy (routing V2 off)
// path. This suite uses the REAL router (registerProvider +
// setLlmRoutingV2Enabled(false), no ./llm mock — session-recap.test.ts mocks
// routeAndCall directly, which cannot exercise the router's actual gate) so
// the assertion is genuinely end-to-end: the Gemini provider must never be
// invoked for an under-18 subject.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  registerProvider,
  setLlmRoutingV2Enabled,
  _clearProviders,
  type LLMProvider,
  type ChatMessage,
  type ModelConfig,
  type StopReason,
} from './llm';
import { makeChatStreamResult } from './llm/types';
import { generateLearnerRecap } from './session-recap';

/**
 * [WI-2432] Mock provider whose chat() fails `failCount` times then succeeds
 * — same pattern as router.test.ts's local `createTransientFailProvider`
 * (not exported from providers/mock, so re-declared per file). Used to force
 * the primary provider past MAX_RETRIES(3) (4 attempts) so routeAndCall
 * actually reaches getFallbackConfig (router.ts:1064), not just
 * getModelConfig (router.ts:908) — the two sites have independent
 * isUnder18AgeBracket gates, so a test that only exercises the primary path
 * would not prove ageBracket also reaches the fallback call.
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

// Mirrors session-recap.test.ts's createMathTranscriptDb() — 6 turns so
// exchangeCount=3 and transcriptTurns=6 >= 4 (the function's minimum).
function createMathTranscriptDb(): Database {
  const limit = jest.fn().mockResolvedValue([]);
  const chainStub: Record<string, unknown> = { limit };
  const selfReturn = () => chainStub;
  chainStub['from'] = selfReturn;
  chainStub['innerJoin'] = selfReturn;
  chainStub['where'] = selfReturn;
  const select = jest.fn().mockReturnValue(chainStub);

  return {
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventType: 'user_message',
            content: 'What is algebra and how do variables work?',
          },
          {
            eventType: 'ai_response',
            content:
              'Algebra uses variables like x to represent unknown numbers in equations.',
          },
          {
            eventType: 'user_message',
            content: 'Can you show me how to solve for x in a simple equation?',
          },
          {
            eventType: 'ai_response',
            content:
              'Sure: if x plus five equals ten, then x equals five. Subtract five from both sides.',
          },
          {
            eventType: 'user_message',
            content:
              'I understand now. The variables make equations easier to solve.',
          },
          {
            eventType: 'ai_response',
            content:
              'Exactly. You connected variables to equation solving — that is the core of algebra.',
          },
        ]),
      },
    },
    select,
  } as unknown as Database;
}

// On-topic recap so the lexical-overlap guard (a SEPARATE, pre-existing
// safety net — see session-recap.test.ts) does not swallow the response into
// its deterministic fallback and mask which provider actually served it.
function algebraRecapJson() {
  return JSON.stringify({
    closingLine:
      'You practiced solving equations by substituting variables and balancing both sides.',
    takeaways: [
      'You connected variables to solving equations by subtracting from both sides.',
      'You asked how algebra uses unknowns to represent numbers in equations.',
    ],
    nextTopicReason: null,
  });
}

describe('[WI-2432] generateLearnerRecap never routes an under-18 subject to Gemini (legacy path)', () => {
  let geminiSpy: jest.Mock;

  beforeEach(() => {
    _clearProviders();
    setLlmRoutingV2Enabled(false);
    geminiSpy = jest.fn();
    const geminiProvider: LLMProvider = {
      id: 'gemini',
      async chat(...args: Parameters<LLMProvider['chat']>) {
        geminiSpy(...args);
        return {
          content: algebraRecapJson(),
          stopReason: 'stop' as StopReason,
        };
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

  it.each([2015, 2011] as const)(
    'never invokes Gemini for a subject born in %i (child/adolescent)',
    async (birthYear) => {
      registerProvider({
        id: 'cerebras',
        async chat(_messages: ChatMessage[], _config: ModelConfig) {
          return {
            content: algebraRecapJson(),
            stopReason: 'stop' as StopReason,
          };
        },
        chatStream() {
          const s = (async function* () {
            yield 'unused';
          })();
          return makeChatStreamResult(s, Promise.resolve<StopReason>('stop'));
        },
      });

      const db = createMathTranscriptDb();
      const result = await generateLearnerRecap(db, {
        sessionId: 'session-age-bracket-test',
        profileId: 'profile-1',
        topicId: null,
        subjectId: 'subject-1',
        exchangeCount: 3,
        birthYear,
      });

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.closingLine).toContain('equations');
    },
  );

  it('an unambiguously adult subject is unaffected (no regression) — Gemini remains eligible', async () => {
    const db = createMathTranscriptDb();
    const result = await generateLearnerRecap(db, {
      sessionId: 'session-age-bracket-adult-test',
      profileId: 'profile-1',
      topicId: null,
      subjectId: 'subject-1',
      exchangeCount: 3,
      birthYear: 1990,
    });

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
  });

  it('forces a primary-provider failure past MAX_RETRIES, driving the call through getFallbackConfig — still never selects Gemini for an under-18 subject', async () => {
    const flakyCerebras = createTransientFailProvider(
      'cerebras',
      4, // 1 + MAX_RETRIES(3) — exhausts the primary's withRetry loop
      algebraRecapJson(),
    );
    registerProvider(flakyCerebras);

    const db = createMathTranscriptDb();
    const result = await generateLearnerRecap(db, {
      sessionId: 'session-age-bracket-fallback-test',
      profileId: 'profile-1',
      topicId: null,
      subjectId: 'subject-1',
      exchangeCount: 3,
      birthYear: 2015,
    });

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.closingLine).toContain('equations');
    // 4 failing primary attempts + 1 succeeding fallback attempt: proves
    // execution actually reached getFallbackConfig's isUnder18AgeBracket
    // gate (router.ts:1064), not just getModelConfig's (router.ts:908).
    expect(flakyCerebras.callCount).toBe(5);
  }, 15000);
});
