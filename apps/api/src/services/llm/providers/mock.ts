import {
  makeChatStreamResult,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type LLMProvider,
  type ModelConfig,
} from '../types';
import type { StopReason } from '../stop-reason';

// ---------------------------------------------------------------------------
// Mock provider for testing — returns canned responses
// ---------------------------------------------------------------------------

// The mock emits envelope-shaped JSON so the exchange and interview flows
// (which now parse the envelope) see a realistic payload. Router-level tests
// still assert on the reply substring, which appears inside the envelope.
function envelopeFrom(reply: string): string {
  return JSON.stringify({ reply, signals: {} });
}

function lastMessageText(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return 'empty';
  if (typeof last.content === 'string') return last.content.slice(0, 50);
  const text = last.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
  return text.slice(0, 50) || 'empty';
}

// ---------------------------------------------------------------------------
// Recall-grader stand-in
//
// The recall-quality grader (services/retention-data.ts → evaluateRecallQuality)
// is a TRUE external-boundary LLM call routed through routeAndCall. Its system
// prompt (RECALL_QUALITY_PROMPT) asks for a strict JSON grade matching
// recallGradeJsonSchema. A generic mock reply (the envelope below) is NOT a
// valid grade, so without this branch every grader call would parse as
// "unavailable" → honest 502. Here the mock detects the grader prompt and
// returns a deterministic, schema-valid grade so the REAL parse → SM-2 →
// persistence path runs end-to-end in tests.
//
// Detection is by a distinctive substring of RECALL_QUALITY_PROMPT rather than
// equality, because routeAndCall prepends a safety preamble to the system
// message before it reaches the provider.
const RECALL_GRADER_SIGNAL = 'Rate quality on the SM-2 scale';

/**
 * Test affordance: a learner answer containing this sentinel forces the mock
 * grader to emit a NON-grade reply (the generic envelope, which fails
 * recallGradeJsonSchema). This exercises the honest grader-unavailable
 * contract (evaluateRecallQuality → { graded: false } → retryable 502) without
 * registering a separate broken provider.
 */
export const RECALL_GRADER_FORCE_UNPARSEABLE = '__force_unparseable_grade__';

function systemMessageText(messages: ChatMessage[]): string {
  const first = messages[0];
  if (!first || first.role !== 'system') return '';
  return typeof first.content === 'string' ? first.content : '';
}

function extractLearnerInput(messages: ChatMessage[]): string {
  const user = [...messages].reverse().find((m) => m.role === 'user');
  const content = user && typeof user.content === 'string' ? user.content : '';
  const match = content.match(/<learner_input>([\s\S]*)<\/learner_input>/);
  return match?.[1] ?? content;
}

/**
 * Returns a schema-valid recallGradeJsonSchema JSON string when `messages` is a
 * recall-grader call, or `null` otherwise (so every non-grader prompt keeps the
 * unchanged envelope behavior other suites depend on). The grade is keyed off
 * the answer's substance so a single mock can drive BOTH the SM-2 pass
 * (quality >= 3) and fail (quality < 3) branches the retention suites assert.
 */
function maybeRecallGradeJson(messages: ChatMessage[]): string | null {
  if (!systemMessageText(messages).includes(RECALL_GRADER_SIGNAL)) {
    return null;
  }
  const answer = extractLearnerInput(messages);
  if (answer.includes(RECALL_GRADER_FORCE_UNPARSEABLE)) {
    // Fall through to the generic envelope → unparseable as a grade.
    return null;
  }
  const substantive = answer.trim().length >= 40;
  const grade = substantive
    ? {
        quality: 4,
        verdict: 'solid',
        rationale: 'Mock grade: substantive recall.',
        misconception: null,
        // [WI-2114] Mock the answer-specific feedback block so paths that
        // surface it (feedback_only rendering) are exercised end-to-end.
        feedback: {
          strengths: 'Mock feedback: you covered the core idea.',
          gaps: 'Mock feedback: a supporting detail is missing.',
          nextStep: 'Mock feedback: name that detail and try again.',
        },
      }
    : {
        quality: 2,
        verdict: 'partial',
        rationale: 'Mock grade: incomplete recall.',
        misconception: null,
        feedback: {
          strengths: 'Mock feedback: you recalled part of it.',
          gaps: 'Mock feedback: key points are still missing.',
          nextStep: 'Mock feedback: review the main idea and retry.',
        },
      };
  return JSON.stringify(grade);
}

export interface MockProviderOptions {
  /** Override the stop reason returned by chat/chatStream. Defaults to 'stop'. */
  stopReason?: StopReason;
}

export function createMockProvider(
  id: string,
  opts: MockProviderOptions = {},
): LLMProvider {
  const stopReason: StopReason = opts.stopReason ?? 'stop';

  return {
    id,

    async chat(
      messages: ChatMessage[],
      _config: ModelConfig,
    ): Promise<ChatResult> {
      // Recall-grader calls get a schema-valid grade; every other prompt keeps
      // the unchanged envelope reply (scoped so other suites are unaffected).
      const recallGrade = maybeRecallGradeJson(messages);
      if (recallGrade !== null) {
        return { content: recallGrade, stopReason };
      }
      const reply = `Mock response to: ${lastMessageText(messages)}`;
      return { content: envelopeFrom(reply), stopReason };
    },

    chatStream(
      messages: ChatMessage[],
      _config: ModelConfig,
    ): ChatStreamResult {
      const envelope = envelopeFrom(
        `Mock streamed response to: ${lastMessageText(messages)}`,
      );
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        try {
          // Chunk size chosen to exercise multi-chunk reply extraction across
          // the key/value/escape boundaries in streamEnvelopeReply.
          for (let i = 0; i < envelope.length; i += 12) {
            yield envelope.slice(i, i + 12);
          }
        } finally {
          resolveStop(stopReason);
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}

/** Convenience singleton for common 'mock' id. */
export const mockProvider: LLMProvider = createMockProvider('mock');
