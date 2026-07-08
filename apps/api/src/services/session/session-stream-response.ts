import {
  LlmStreamError,
  RateLimitedError,
  SafetyFilterError,
  streamDoneFrameSchema,
  streamErrorFrameSchema,
  streamFallbackFrameSchema,
  UpstreamLlmError,
  type QuotaModel,
  type SubscriptionTier,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import { CircuitOpenError } from '../llm';
import type { LLMTier } from '../subscription';
import { addBreadcrumb, captureException } from '../sentry';
import { createLogger } from '../logger';
import { refundQuotaOrEscalate } from '../billing';
import { markPersisted } from '../idempotency-marker';
import { processMessage, streamMessage } from './session-exchange';

const logger = createLogger();

export interface SseWriter {
  writeSSE(event: { data: string }): Promise<void>;
}

export type CreateSseResponse = (
  handler: (stream: SseWriter) => Promise<void>,
) => Response | Promise<Response>;

interface DoneFrameSource {
  exchangeCount: number;
  escalationRung: number;
  expectedResponseMinutes?: number;
  aiEventId?: string;
  notePrompt?: boolean;
  notePromptPostSession?: boolean;
  fluencyDrill?: unknown;
  languageLearning?: unknown;
  confidence?: 'low' | 'medium' | 'high';
  readyToFinish?: boolean;
  challengeRound?: unknown;
  challengeOffer?: { pitch: string };
  draftedNote?: unknown;
}

type SessionMessageInput = Parameters<typeof processMessage>[3];
type StreamMessageOptions = NonNullable<Parameters<typeof streamMessage>[4]>;

export interface StreamSessionResponseDependencies {
  streamMessage: typeof streamMessage;
  processMessage: typeof processMessage;
  refundQuotaOrEscalate: typeof refundQuotaOrEscalate;
  markPersisted: typeof markPersisted;
  sendEmptyReplyFallbackEvent: (event: {
    sessionId: string;
    profileId: string;
    exchangeCount: number;
    reason: string;
  }) => Promise<void>;
  logger: Pick<ReturnType<typeof createLogger>, 'error' | 'warn'>;
  captureException: typeof captureException;
  addBreadcrumb: typeof addBreadcrumb;
}

export interface StreamSessionResponseParams {
  db: Database;
  profileId: string;
  sessionId: string;
  input: SessionMessageInput;
  session: { exchangeCount: number };
  subscriptionId: string | undefined;
  quota: {
    source: 'monthly' | 'top_up' | undefined;
    quotaModel: QuotaModel | undefined;
    topUpCreditId: string | undefined;
  };
  idempotencyKv?: KVNamespace;
  streamOptions: StreamMessageOptions;
  createSseResponse: CreateSseResponse;
  deps?: StreamSessionResponseDependencies;
}

const defaultDeps: StreamSessionResponseDependencies = {
  streamMessage,
  processMessage,
  refundQuotaOrEscalate,
  markPersisted,
  sendEmptyReplyFallbackEvent: async () => undefined,
  logger,
  captureException,
  addBreadcrumb,
};

export function buildDoneFramePayload(source: DoneFrameSource) {
  return streamDoneFrameSchema.parse({
    type: 'done' as const,
    exchangeCount: source.exchangeCount,
    escalationRung: source.escalationRung,
    expectedResponseMinutes: source.expectedResponseMinutes ?? 0,
    aiEventId: source.aiEventId,
    notePrompt: source.notePrompt || undefined,
    notePromptPostSession: source.notePromptPostSession || undefined,
    fluencyDrill: source.fluencyDrill || undefined,
    languageLearning: source.languageLearning || undefined,
    confidence: source.confidence || undefined,
    readyToFinish: source.readyToFinish ?? undefined,
    challengeRound: source.challengeRound,
    challengeOffer: source.challengeOffer,
    draftedNote: source.draftedNote,
  });
}

function getErrorDebugFields(err: unknown): {
  error: string;
  errorName: string;
  cause?: string;
  causeName?: string;
  circuitKey?: string;
} {
  const cause = err instanceof Error ? err.cause : undefined;
  const circuitKey =
    err instanceof CircuitOpenError
      ? err.circuitKey
      : cause instanceof CircuitOpenError
        ? cause.circuitKey
        : undefined;
  return {
    error: err instanceof Error ? err.message : String(err),
    errorName: err instanceof Error ? err.name : typeof err,
    cause: cause instanceof Error ? cause.message : undefined,
    causeName: cause instanceof Error ? cause.name : undefined,
    circuitKey,
  };
}

function isSafetyFilterError(err: unknown): boolean {
  return (
    err instanceof SafetyFilterError ||
    (err instanceof LlmStreamError && err.cause instanceof SafetyFilterError)
  );
}

function isUpstreamLlmError(err: unknown): boolean {
  return (
    err instanceof UpstreamLlmError ||
    err instanceof CircuitOpenError ||
    (err instanceof LlmStreamError &&
      (err.cause instanceof UpstreamLlmError ||
        err.cause instanceof CircuitOpenError))
  );
}

function buildProcessOptions(
  options: StreamMessageOptions,
): Parameters<typeof processMessage>[4] {
  return {
    llmTier: options.llmTier as LLMTier,
    subscriptionTier: options.subscriptionTier as SubscriptionTier | undefined,
    quotaRemainingTurns: options.quotaRemainingTurns,
    quotaFractionRemaining: options.quotaFractionRemaining,
    voyageApiKey: options.voyageApiKey,
    clientId: options.clientId,
    memoryFactsReadEnabled: options.memoryFactsReadEnabled,
    memoryFactsRelevanceEnabled: options.memoryFactsRelevanceEnabled,
    challengeRoundRuntimeEnabled: options.challengeRoundRuntimeEnabled,
    reviewCallbackOpenerEnabled: options.reviewCallbackOpenerEnabled,
    judgeFrameworkEnabled: options.judgeFrameworkEnabled,
    judgeEnforcementEnabled: options.judgeEnforcementEnabled,
  };
}

async function refundQuota(
  params: StreamSessionResponseParams,
  route: string,
  deps: StreamSessionResponseDependencies,
): Promise<void> {
  await deps.refundQuotaOrEscalate(params.db, params.subscriptionId, {
    route,
    profileId: params.profileId,
    sessionId: params.sessionId,
    source: params.quota.source,
    quotaModel: params.quota.quotaModel,
    topUpCreditId: params.quota.topUpCreditId,
  });
}

export async function streamSessionResponse(
  params: StreamSessionResponseParams,
): Promise<Response> {
  const deps = params.deps ?? defaultDeps;

  try {
    const { stream, onComplete } = await deps.streamMessage(
      params.db,
      params.profileId,
      params.sessionId,
      params.input,
      params.streamOptions,
    );

    return await params.createSseResponse(async (sseStream) => {
      let chunkCount = 0;
      try {
        for await (const chunk of stream) {
          if (chunk.trim().length > 0) chunkCount++;
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: chunk }),
          });
        }
      } catch (streamErr) {
        const debugFields = getErrorDebugFields(streamErr);
        deps.logger.error('[sessions/stream] LLM stream failed', {
          surface: 'sessions.stream',
          phase: 'llm_stream_drain',
          sessionId: params.sessionId,
          profileId: params.profileId,
          chunkCount,
          ...debugFields,
        });
        deps.captureException(streamErr, {
          profileId: params.profileId,
          extra: {
            sessionId: params.sessionId,
            phase: 'llm_stream',
            chunkCount,
            circuitKey: debugFields.circuitKey,
            errorName: debugFields.errorName,
            causeName: debugFields.causeName,
          },
        });

        if (
          !(streamErr instanceof RateLimitedError) &&
          !isSafetyFilterError(streamErr)
        ) {
          deps.logger.warn(
            chunkCount === 0
              ? '[sessions/stream] Stream failed before visible text; trying non-streaming fallback'
              : '[sessions/stream] Stream failed after visible text; replacing partial reply with non-streaming fallback',
            {
              sessionId: params.sessionId,
              chunkCount,
              profileId: params.profileId,
              circuitKey: debugFields.circuitKey,
              error: debugFields.error,
              errorName: debugFields.errorName,
              causeName: debugFields.causeName,
            },
          );
          try {
            const fallback = await deps.processMessage(
              params.db,
              params.profileId,
              params.sessionId,
              params.input,
              buildProcessOptions(params.streamOptions),
            );
            await sseStream.writeSSE({
              data: JSON.stringify({
                type: chunkCount === 0 ? 'chunk' : 'replace',
                content: fallback.response,
              }),
            });
            await sseStream.writeSSE({
              data: JSON.stringify(buildDoneFramePayload(fallback)),
            });
            await deps.markPersisted({
              kv: params.idempotencyKv,
              profileId: params.profileId,
              flow: 'session',
              key: params.streamOptions.clientId,
            });
            return;
          } catch (fallbackErr) {
            const fallbackDebugFields = getErrorDebugFields(fallbackErr);
            deps.logger.error(
              '[sessions/stream] Non-streaming fallback failed',
              {
                surface: 'sessions.stream',
                phase: 'llm_stream_fallback',
                sessionId: params.sessionId,
                profileId: params.profileId,
                parentErrorName: debugFields.errorName,
                parentCircuitKey: debugFields.circuitKey,
                ...fallbackDebugFields,
              },
            );
            deps.captureException(fallbackErr, {
              profileId: params.profileId,
              extra: {
                sessionId: params.sessionId,
                phase: 'llm_stream_non_streaming_fallback',
                parentErrorName: debugFields.errorName,
                parentCircuitKey: debugFields.circuitKey,
                circuitKey: fallbackDebugFields.circuitKey,
                errorName: fallbackDebugFields.errorName,
                causeName: fallbackDebugFields.causeName,
              },
            });
          }
        }

        await refundQuota(params, 'sessions.stream.llm_error', deps);
        const errorCode =
          streamErr instanceof RateLimitedError
            ? 'quota_exhausted'
            : isSafetyFilterError(streamErr)
              ? 'safety_filter'
              : 'unknown_error';
        await sseStream.writeSSE({
          data: JSON.stringify(
            streamErrorFrameSchema.parse({
              type: 'error',
              code: errorCode,
              message:
                'Something went wrong while generating a reply. Please try again.',
            }),
          ),
        });
        return;
      }

      try {
        const result = await onComplete();

        if (chunkCount === 0) {
          const zeroTokenRecovered =
            result.fallback !== undefined ||
            (result.response?.trim().length ?? 0) > 0;
          const zeroTokenRecovery = result.fallback
            ? 'fallback_frame'
            : 'parsed_reply';

          deps.logger.warn('[sessions/stream] Zero-token stream completed', {
            surface: 'sessions.stream',
            sessionId: params.sessionId,
            profileId: params.profileId,
            tokensReceived: 0,
            recovered: zeroTokenRecovered,
            recovery: zeroTokenRecovery,
          });
          deps.addBreadcrumb(
            'Zero-token stream completed',
            'sessions.stream',
            'warning',
            {
              sessionId: params.sessionId,
              tokensReceived: 0,
              recovered: zeroTokenRecovered,
              recovery: zeroTokenRecovery,
            },
          );
          deps.captureException(new Error('Zero-token stream completed'), {
            profileId: params.profileId,
            extra: {
              sessionId: params.sessionId,
              tokensReceived: 0,
              recovered: zeroTokenRecovered,
              surface: 'sessions.stream',
              recovery: zeroTokenRecovery,
            },
          });
        }

        if (result.fallback) {
          const fallbackInfo = result.fallback;
          const frame = streamFallbackFrameSchema.parse({
            type: 'fallback',
            reason: fallbackInfo.reason,
            fallbackText: fallbackInfo.fallbackText,
          });
          await refundQuota(params, 'sessions.stream.fallback', deps);
          await sseStream.writeSSE({ data: JSON.stringify(frame) });
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'done',
              exchangeCount: params.session.exchangeCount,
              escalationRung: result.escalationRung,
              expectedResponseMinutes: 0,
            }),
          });
          await deps.sendEmptyReplyFallbackEvent({
            sessionId: params.sessionId,
            profileId: params.profileId,
            exchangeCount: params.session.exchangeCount,
            reason: fallbackInfo.reason,
          });
          return;
        }

        if (chunkCount === 0 && result.response?.trim()) {
          await sseStream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: result.response }),
          });
        }

        if (chunkCount > 0 && result.sourceReplacement?.trim()) {
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'replace',
              content: result.sourceReplacement,
            }),
          });
        }

        await sseStream.writeSSE({
          data: JSON.stringify(buildDoneFramePayload(result)),
        });
        await deps.markPersisted({
          kv: params.idempotencyKv,
          profileId: params.profileId,
          flow: 'session',
          key: params.streamOptions.clientId,
        });
      } catch (err) {
        const debugFields = getErrorDebugFields(err);
        deps.logger.error('[sessions/stream] Post-stream processing failed', {
          surface: 'sessions.stream',
          phase: 'on_complete',
          sessionId: params.sessionId,
          profileId: params.profileId,
          chunkCount,
          ...debugFields,
        });
        deps.captureException(err, {
          profileId: params.profileId,
          extra: {
            sessionId: params.sessionId,
            phase: 'on_complete',
            chunkCount,
            circuitKey: debugFields.circuitKey,
            errorName: debugFields.errorName,
            causeName: debugFields.causeName,
          },
        });
        await refundQuota(params, 'sessions.stream.onComplete', deps);
        await sseStream.writeSSE({
          data: JSON.stringify(
            streamErrorFrameSchema.parse({
              type: 'error',
              message: 'Failed to save session progress. Please try again.',
            }),
          ),
        });
      }
    });
  } catch (err) {
    const debugFields = getErrorDebugFields(err);
    deps.logger.error('[sessions/stream] Pre-stream setup failed', {
      surface: 'sessions.stream',
      phase: 'pre_stream_setup',
      sessionId: params.sessionId,
      profileId: params.profileId,
      ...debugFields,
    });

    if (
      !(err instanceof RateLimitedError) &&
      !isSafetyFilterError(err) &&
      !isUpstreamLlmError(err)
    ) {
      deps.logger.warn(
        '[sessions/stream] Pre-stream setup failed; trying non-streaming fallback',
        {
          sessionId: params.sessionId,
          profileId: params.profileId,
          circuitKey: debugFields.circuitKey,
          error: debugFields.error,
          errorName: debugFields.errorName,
          causeName: debugFields.causeName,
        },
      );
      try {
        const fallback = await deps.processMessage(
          params.db,
          params.profileId,
          params.sessionId,
          params.input,
          buildProcessOptions(params.streamOptions),
        );
        return await params.createSseResponse(async (sseStream) => {
          await sseStream.writeSSE({
            data: JSON.stringify({
              type: 'chunk',
              content: fallback.response,
            }),
          });
          await sseStream.writeSSE({
            data: JSON.stringify(buildDoneFramePayload(fallback)),
          });
          await deps.markPersisted({
            kv: params.idempotencyKv,
            profileId: params.profileId,
            flow: 'session',
            key: params.streamOptions.clientId,
          });
        });
      } catch (fallbackErr) {
        const fallbackDebugFields = getErrorDebugFields(fallbackErr);
        deps.logger.error(
          '[sessions/stream] Pre-stream non-streaming fallback failed',
          {
            surface: 'sessions.stream',
            phase: 'pre_stream_fallback',
            sessionId: params.sessionId,
            profileId: params.profileId,
            parentErrorName: debugFields.errorName,
            parentCircuitKey: debugFields.circuitKey,
            ...fallbackDebugFields,
          },
        );
        deps.captureException(fallbackErr, {
          profileId: params.profileId,
          extra: {
            sessionId: params.sessionId,
            phase: 'llm_pre_stream_non_streaming_fallback',
            parentErrorName: debugFields.errorName,
            parentCircuitKey: debugFields.circuitKey,
            circuitKey: fallbackDebugFields.circuitKey,
            errorName: fallbackDebugFields.errorName,
            causeName: fallbackDebugFields.causeName,
          },
        });
      }
    }

    await refundQuota(params, 'sessions.stream', deps);
    throw err;
  }
}
