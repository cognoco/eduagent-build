// ---------------------------------------------------------------------------
// [WI-2432] AC-2 — generateRecallBridge threads ageBracket to the router's
// under-18 vendor-exclusion gate.
//
// Before this fix, generateRecallBridge never supplied ageBracket to
// routeAndCall, so the router's under-18 Gemini/Vertex exclusion
// (isUnder18AgeBracket, router.ts) could never fire for this flow on the
// legacy (routing V2 off) path — a registered Gemini provider would silently
// serve a minor. This suite uses the REAL router (registerProvider +
// setLlmRoutingV2Enabled(false), no ./llm mock — recall-bridge.test.ts mocks
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
import { generateRecallBridge } from './recall-bridge';

const PROFILE_ID = 'profile-001';
const SESSION_ID = 'session-001';

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

function makeDb(birthDate: string | undefined): Database {
  const topic = {
    id: 'topic-001',
    title: 'Quadratic Equations',
    description: 'Solving equations of the form ax^2 + bx + c = 0',
  };
  const limitMock = jest.fn().mockResolvedValue([topic]);
  const whereMock = jest.fn().mockReturnValue({ limit: limitMock });
  const innerJoin2Mock = jest.fn().mockReturnValue({ where: whereMock });
  const innerJoin1Mock = jest
    .fn()
    .mockReturnValue({ innerJoin: innerJoin2Mock });
  const fromMock = jest.fn().mockReturnValue({ innerJoin: innerJoin1Mock });

  return {
    query: {
      person: {
        findFirst: jest
          .fn()
          .mockResolvedValue(birthDate ? { birthDate } : undefined),
      },
    },
    select: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as Database;
}

function createScopedSessionRepo() {
  return {
    sessions: {
      findFirst: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        profileId: PROFILE_ID,
        subjectId: 'subject-001',
        topicId: 'topic-001',
        sessionType: 'homework',
        status: 'active',
      }),
    },
  };
}

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(() => createScopedSessionRepo()),
  };
});

describe('[WI-2432] generateRecallBridge never routes an under-18 subject to Gemini (legacy path)', () => {
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
          content: 'GEMINI SHOULD NEVER SERVE AN UNDER-18 SUBJECT',
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

  it.each([
    ['child', '2015-01-01'],
    ['adolescent', '2011-01-01'],
  ] as const)(
    'ageBracket=%s (birthDate %s) never invokes the Gemini provider; the approved provider serves it',
    async (_label, birthDate) => {
      const approvedProvider: LLMProvider = {
        id: 'cerebras',
        async chat(_messages: ChatMessage[], _config: ModelConfig) {
          return {
            content:
              'What are the key steps in the quadratic formula?\nWhy two solutions?',
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
      registerProvider(approvedProvider);

      const db = makeDb(birthDate);
      const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

      expect(geminiSpy).not.toHaveBeenCalled();
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions[0]).toContain('quadratic formula');
    },
  );

  it('an adult subject is unaffected (no regression) — Gemini remains eligible', async () => {
    const db = makeDb('1990-01-01');
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(result.questions.length).toBeGreaterThan(0);
  });

  it('forces a primary-provider failure past MAX_RETRIES, driving the call through getFallbackConfig — still never selects Gemini for an under-18 subject', async () => {
    const flakyCerebras = createTransientFailProvider(
      'cerebras',
      4, // 1 + MAX_RETRIES(3) — exhausts the primary's withRetry loop
      'What are the key steps in the quadratic formula?\nWhy two solutions?',
    );
    registerProvider(flakyCerebras);

    const db = makeDb('2015-01-01');
    const result = await generateRecallBridge(db, PROFILE_ID, SESSION_ID);

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions[0]).toContain('quadratic formula');
    // 4 failing primary attempts + 1 succeeding fallback attempt: proves
    // execution actually reached getFallbackConfig's isUnder18AgeBracket
    // gate (router.ts:1064), not just getModelConfig's (router.ts:908).
    expect(flakyCerebras.callCount).toBe(5);
  }, 15000);
});
