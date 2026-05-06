/**
 * Session-depth evaluation gates the filing prompt for unscoped sessions.
 *
 * The "Add to library?" modal in the mobile session footer
 * (apps/mobile/src/components/session/SessionFooter.tsx) appears ONLY when:
 *   1. Session mode is 'freeform' or 'homework' (scoped sessions are
 *      implicitly filed by their topic linkage), AND
 *   2. This evaluator returns `meaningful: true` for the session transcript.
 *
 * Opt-in default ("No thanks" leaves the session unfiled) is intentional.
 *
 * If you change this evaluator's thresholds, also update the spec:
 * docs/specs/2026-05-06-learning-path-clarity-pass.md (Q4).
 */

import { z } from 'zod';
import {
  detectedTopicSchema,
  type AgeBracket,
  type DepthEvaluation,
  type SessionTranscript,
} from '@eduagent/schemas';
import { routeAndCall, extractFirstJsonObject, type ChatMessage } from '../llm';
import { escapeXml } from '../llm/sanitize';
import { createLogger } from '../logger';
import { captureException } from '../sentry';
import {
  AUTO_MEANINGFUL_EXCHANGE_THRESHOLD,
  GATE_TIMEOUT_MS,
  MIN_EXCHANGES_FOR_MEANINGFUL,
  MIN_LEARNER_WORDS,
  TOPIC_DETECTION_TIMEOUT_MS,
} from './session-depth.config';
import {
  DEPTH_EVALUATION_PROMPT,
  TOPIC_DETECTION_PROMPT,
} from './session-depth-prompts';

const logger = createLogger();

const llmDepthResponseSchema = z.object({
  meaningful: z.boolean(),
  reason: z.string(),
  topics: z.array(detectedTopicSchema),
});

function countLearnerWords(transcript: SessionTranscript): number {
  return transcript.exchanges.reduce((sum, exchange) => {
    if (exchange.role !== 'user') return sum;
    return sum + exchange.content.split(/\s+/).filter(Boolean).length;
  }, 0);
}

function formatTranscriptForPrompt(transcript: SessionTranscript): string {
  // [PROMPT-INJECT-8] Entity-encode each turn's content so a crafted
  // message cannot close the <transcript> tag or inject directives.
  const lines = transcript.exchanges
    .filter((exchange) => !exchange.isSystemPrompt)
    .map((exchange) =>
      exchange.role === 'user'
        ? `Learner: ${escapeXml(exchange.content)}`
        : `Tutor: ${escapeXml(exchange.content)}`
    )
    .join('\n');
  return `<transcript>\n${lines}\n</transcript>`;
}

function parseDepthResponse(
  raw: string
): Omit<DepthEvaluation, 'method'> | null {
  // [BUG-772] Use the shared brace-walker so prose preambles, fenced markdown
  // blocks, and trailing chatter all parse uniformly with every other LLM
  // call site (sweep). The bespoke 3-regex strip only handled fenced blocks
  // and silently failed on any preamble like "Here's the analysis: {...}".
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) {
    captureException(new Error('session-depth: no JSON object found'), {
      extra: {
        context: 'parseDepthResponse',
        rawLength: raw.length,
      },
    });
    return null;
  }
  try {
    const parsed = JSON.parse(jsonStr);
    const result = llmDepthResponseSchema.safeParse(parsed);
    if (!result.success) {
      captureException(new Error('session-depth: schema validation failed'), {
        extra: {
          context: 'parseDepthResponse',
          rawLength: raw.length,
          validationError: result.error.message,
        },
      });
      return null;
    }
    return result.data;
  } catch (err) {
    captureException(err, {
      extra: {
        context: 'parseDepthResponse',
        rawLength: raw.length,
      },
    });
    return null;
  }
}

function failOpen(
  exchangeCount: number,
  learnerWordCount: number
): DepthEvaluation {
  return {
    meaningful: true,
    reason: `Depth gate failed open (${exchangeCount} exchanges, ${learnerWordCount} learner words)`,
    method: 'fail_open',
    topics: [],
  };
}

async function callWithTimeout(
  messages: ChatMessage[],
  timeoutMs: number,
  ageBracket?: AgeBracket
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  const llmPromise = routeAndCall(messages, 1, { ageBracket }).then(
    (result) => result.response
  );
  return Promise.race([llmPromise, timeoutPromise]);
}

async function detectTopicsOnly(
  transcript: SessionTranscript,
  timeoutMs: number,
  ageBracket?: AgeBracket
): Promise<DepthEvaluation['topics']> {
  try {
    const raw = await callWithTimeout(
      [
        { role: 'system', content: TOPIC_DETECTION_PROMPT },
        { role: 'user', content: formatTranscriptForPrompt(transcript) },
      ],
      timeoutMs,
      ageBracket
    );
    return parseDepthResponse(raw)?.topics ?? [];
  } catch (error) {
    logger.warn('[session-depth] topic detection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    captureException(error, {
      extra: { context: 'detectTopicsOnly' },
    });
    return [];
  }
}

async function evaluateWithLlm(
  transcript: SessionTranscript,
  exchangeCount: number,
  learnerWordCount: number,
  timeoutMs: number,
  ageBracket?: AgeBracket
): Promise<DepthEvaluation> {
  try {
    const raw = await callWithTimeout(
      [
        { role: 'system', content: DEPTH_EVALUATION_PROMPT },
        { role: 'user', content: formatTranscriptForPrompt(transcript) },
      ],
      timeoutMs,
      ageBracket
    );
    const parsed = parseDepthResponse(raw);
    if (parsed) {
      return {
        ...parsed,
        method: 'llm_gate',
      };
    }
    logger.warn('[session-depth] unparseable depth response', {
      rawLength: raw.length,
    });
  } catch (error) {
    logger.warn('[session-depth] depth gate failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return failOpen(exchangeCount, learnerWordCount);
}

export async function evaluateSessionDepth(
  transcript: SessionTranscript,
  options?: {
    timeoutMs?: number;
    topicTimeoutMs?: number;
    ageBracket?: AgeBracket;
  }
): Promise<DepthEvaluation> {
  const exchangeCount = transcript.exchanges.filter(
    (exchange) => exchange.role === 'user'
  ).length;
  const learnerWordCount = countLearnerWords(transcript);

  if (exchangeCount < MIN_EXCHANGES_FOR_MEANINGFUL) {
    return {
      meaningful: false,
      reason:
        learnerWordCount < MIN_LEARNER_WORDS
          ? `Quick Q&A: ${exchangeCount} exchanges, ${learnerWordCount} learner words`
          : `Too short for meaningful depth: ${exchangeCount} exchanges`,
      method: 'heuristic_shallow',
      topics: [],
    };
  }

  if (exchangeCount >= AUTO_MEANINGFUL_EXCHANGE_THRESHOLD) {
    const topics = await detectTopicsOnly(
      transcript,
      options?.topicTimeoutMs ?? TOPIC_DETECTION_TIMEOUT_MS,
      options?.ageBracket
    );
    return {
      meaningful: true,
      reason: `Deep session: ${exchangeCount} exchanges with sustained follow-up`,
      method: 'heuristic_deep',
      topics,
    };
  }

  return evaluateWithLlm(
    transcript,
    exchangeCount,
    learnerWordCount,
    options?.timeoutMs ?? GATE_TIMEOUT_MS,
    options?.ageBracket
  );
}
