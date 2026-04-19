import { z } from 'zod';
import {
  detectedTopicSchema,
  type DepthEvaluation,
  type SessionTranscript,
} from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from '../llm';
import { createLogger } from '../logger';
import {
  AUTO_MEANINGFUL_EXCHANGE_THRESHOLD,
  GATE_TIMEOUT_MS,
  MIN_EXCHANGES_FOR_MEANINGFUL,
  MIN_LEARNER_WORDS,
  TOPIC_DETECTION_TIMEOUT_MS,
} from './session-depth.config';

const logger = createLogger();

const DEPTH_EVALUATION_PROMPT = `Given this tutor session transcript, decide whether it was a meaningful learning exchange.

Meaningful means all of these are true:
1. The learner engaged beyond a quick factual lookup.
2. The tutor explained, taught, or guided rather than just answered.
3. The learner responded to that teaching through follow-ups, reflection, or application.

Quick one-off Q&A sessions are not meaningful.

Return ONLY JSON:
{
  "meaningful": boolean,
  "reason": string,
  "topics": [
    {
      "summary": "3-5 word topic label",
      "depth": "substantial" | "partial" | "introduced"
    }
  ]
}`;

const TOPIC_DETECTION_PROMPT = `Given this tutor session transcript, identify the topics discussed.

Return ONLY JSON:
{
  "meaningful": true,
  "reason": "Session showed educational depth",
  "topics": [
    {
      "summary": "3-5 word topic label",
      "depth": "substantial" | "partial" | "introduced"
    }
  ]
}`;

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
  return transcript.exchanges
    .filter((exchange) => !exchange.isSystemPrompt)
    .map((exchange) =>
      exchange.role === 'user'
        ? `Learner: ${exchange.content}`
        : `Tutor: ${exchange.content}`
    )
    .join('\n');
}

function parseDepthResponse(
  raw: string
): Omit<DepthEvaluation, 'method'> | null {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    const result = llmDepthResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
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
  timeoutMs: number
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  const llmPromise = routeAndCall(messages, 1).then(
    (result) => result.response
  );
  return Promise.race([llmPromise, timeoutPromise]);
}

async function detectTopicsOnly(
  transcript: SessionTranscript,
  timeoutMs: number
): Promise<DepthEvaluation['topics']> {
  try {
    const raw = await callWithTimeout(
      [
        { role: 'system', content: TOPIC_DETECTION_PROMPT },
        { role: 'user', content: formatTranscriptForPrompt(transcript) },
      ],
      timeoutMs
    );
    return parseDepthResponse(raw)?.topics ?? [];
  } catch (error) {
    logger.warn('[session-depth] topic detection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function evaluateWithLlm(
  transcript: SessionTranscript,
  exchangeCount: number,
  learnerWordCount: number,
  timeoutMs: number
): Promise<DepthEvaluation> {
  try {
    const raw = await callWithTimeout(
      [
        { role: 'system', content: DEPTH_EVALUATION_PROMPT },
        { role: 'user', content: formatTranscriptForPrompt(transcript) },
      ],
      timeoutMs
    );
    const parsed = parseDepthResponse(raw);
    if (parsed) {
      return {
        ...parsed,
        method: 'llm_gate',
      };
    }
    logger.warn('[session-depth] unparseable depth response', {
      raw: raw.slice(0, 200),
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
  options?: { timeoutMs?: number; topicTimeoutMs?: number }
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
      options?.topicTimeoutMs ?? TOPIC_DETECTION_TIMEOUT_MS
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
    options?.timeoutMs ?? GATE_TIMEOUT_MS
  );
}
