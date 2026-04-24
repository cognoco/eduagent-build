import {
  routeAndCall,
  routeAndStream,
  parseEnvelope,
  extractFirstJsonObject,
  KNOWN_MARKER_KEYS,
  teeEnvelopeStream,
} from './llm';
import type {
  ChatMessage,
  EscalationRung,
  MessagePart,
  RouteResult,
  StreamResult,
} from './llm';
import { createLogger } from './logger';
import {
  type LearningMode,
  type HomeworkMode,
  type InputMode,
  type SessionType,
  type ConversationLanguage,
  type VerificationType,
  type ExchangeFallback,
  type ExchangeFallbackReason,
  type LlmResponseEnvelope,
} from '@eduagent/schemas';
import type { LLMTier } from './subscription';
import {
  buildSystemPrompt as _buildSystemPrompt,
  resolveAgeBracket,
} from './exchange-prompts';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Multimodal image support — IMG-VISION
// ---------------------------------------------------------------------------

export interface ImageData {
  base64: string;
  mimeType: string;
}

export function buildUserContent(
  userMessage: string,
  imageData?: ImageData
): string | MessagePart[] {
  if (!imageData) return userMessage;
  return [
    {
      type: 'inline_data' as const,
      mimeType: imageData.mimeType,
      data: imageData.base64,
    },
    { type: 'text' as const, text: userMessage },
  ];
}

// ---------------------------------------------------------------------------
// Core Exchange Processing Pipeline — Story 2.1
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

/** Everything needed to process a learner message */
export interface ExchangeContext {
  sessionId: string;
  profileId: string;
  subjectName: string;
  topicTitle?: string;
  topicDescription?: string;
  sessionType: SessionType;
  escalationRung: EscalationRung;
  exchangeHistory: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  birthYear?: number | null;
  priorLearningContext?: string;
  /** Cross-subject learning highlights — recent topics from other subjects (Story 16.0) */
  crossSubjectContext?: string;
  learningHistoryContext?: string;
  embeddingMemoryContext?: string;
  /** Accommodation mode preamble — injected before learner memory (FR254) */
  accommodationContext?: string;
  learnerMemoryContext?: string;
  workedExampleLevel?: 'full' | 'fading' | 'problem_first';
  /** Teaching method preference for adaptive teaching (FR58) */
  teachingPreference?: string;
  /** Multiple topics for interleaved retrieval sessions (FR92) */
  interleavedTopics?: Array<{
    topicId: string;
    title: string;
    description?: string;
  }>;
  /** Verification type: standard (default), evaluate (Devil's Advocate), teach_back (Feynman) */
  verificationType?: VerificationType;
  /** Preferred analogy domain for explanations (FR134-137) */
  analogyDomain?: string;
  /** Pedagogy mode for the subject */
  pedagogyMode?: 'socratic' | 'four_strands';
  /** Learner's native language for direct grammar explanation */
  nativeLanguage?: string;
  /** Target language code for language-learning sessions */
  languageCode?: string;
  /** Known vocabulary to bias comprehensible input */
  knownVocabulary?: string[];
  /** EVALUATE difficulty rung 1-4 (FR128-133) */
  evaluateDifficultyRung?: 1 | 2 | 3 | 4;
  /** Learning mode: 'serious' (default) or 'casual' — affects tutoring tone */
  learningMode?: LearningMode;
  /** SM-2 retention status for the current topic */
  retentionStatus?: {
    status: 'new' | 'strong' | 'fading' | 'weak' | 'forgotten';
    easeFactor?: number;
    daysSinceLastReview?: number;
  };
  /** FR228: Homework mode — "Help me solve it" or "Check my answer" */
  homeworkMode?: HomeworkMode;
  /** Subscription-derived LLM tier — controls model routing (flash/standard/premium) */
  llmTier?: LLMTier;
  // BKT-C.1 — profile-level personalization surfaced to the router. Separate
  // from the per-subject `nativeLanguage` (used for L1-aware grammar in
  // language-learning flows). `conversationLanguage` applies universally; in
  // a maths session only this matters. `pronouns` is learner-owned free text
  // (max 32 chars, validated at Zod boundary). Never surfaced to other
  // learners — the router includes it only in the active learner's preamble.
  conversationLanguage?: ConversationLanguage;
  pronouns?: string | null;
  /** Original free-text input the learner typed when starting this session (CFLF) */
  rawInput?: string | null;
  /** Input mode for this session — controls voice-optimized brevity in the system prompt */
  inputMode?: InputMode;
  /** Number of completed exchanges in this session — 0 means the LLM's first turn */
  exchangeCount?: number;
  /** Client-side effective mode — drives mode-specific prompt sections (e.g. recitation) */
  effectiveMode?: string;
  /** Learner's display name — used to personalise the mentor's voice */
  learnerName?: string;
}

/** Result of processing a single exchange */
export interface ExchangeResult {
  response: string;
  newEscalationRung: EscalationRung;
  isUnderstandingCheck: boolean;
  expectedResponseMinutes: number;
  /** Whether the LLM flagged this topic for deepening (rung 5 exit) */
  needsDeepening: boolean;
  /** Whether the LLM signalled partial progress (Gap 3) */
  partialProgress: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  /** Structured assessment from EVALUATE or TEACH_BACK LLM output */
  structuredAssessment?: Record<string, unknown>;
  /** Whether the LLM offered a note prompt to the learner */
  notePrompt?: boolean;
  /** Whether the note prompt is a post-session prompt */
  notePromptPostSession?: boolean;
  /** Fluency drill annotation (language sessions only) */
  fluencyDrill?: FluencyDrillAnnotation;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
}

/** Streaming variant result */
export interface ExchangeStreamResult {
  /** Client-facing stream: yields only envelope `reply` content, ready for SSE. */
  stream: AsyncIterable<string>;
  /**
   * Full raw envelope JSON accumulated from the provider stream, resolved
   * after the caller drains `stream`. Used by `onComplete` helpers to
   * parseEnvelope for signals + ui_hints.
   */
  rawResponsePromise: Promise<string>;
  newEscalationRung: EscalationRung;
  provider: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Understanding check markers
// ---------------------------------------------------------------------------

/** Patterns the LLM uses to signal an understanding check.
 * The authoritative signal is now the envelope's `needs_deepening` field;
 * these heuristic phrases are a fallback for pre-envelope responses only.
 * Do NOT add free-text markers like [UNDERSTANDING_CHECK] here — they can
 * false-positive when a learner literally types the bracket string. */
const UNDERSTANDING_CHECK_PATTERNS = [
  'does that make sense',
  'can you explain that back',
  'what do you think',
  'how would you',
  'try to describe',
  'in your own words',
];

export function estimateExpectedResponseMinutes(
  response: string,
  context: Pick<ExchangeContext, 'sessionType'>
): number {
  const trimmed = response.trim();
  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const questionCount = (trimmed.match(/\?/g) ?? []).length;

  if (
    context.sessionType === 'homework' &&
    /(show|solve|work through|try this|similar example|step)/i.test(trimmed)
  ) {
    return 6;
  }

  if (
    questionCount > 0 &&
    wordCount <= 30 &&
    /(what|why|how|which|can you|try|does that)/i.test(lower)
  ) {
    return 2;
  }

  if (
    /(take your time|work it out|pause here|on paper|try solving|come back when)/i.test(
      lower
    )
  ) {
    return 8;
  }

  if (wordCount >= 140) {
    return 10;
  }

  if (wordCount >= 90) {
    return 8;
  }

  if (wordCount >= 45) {
    return 5;
  }

  return 3;
}

// ---------------------------------------------------------------------------
// Re-export prompt builders for backward compatibility
// (eval harness and other callers import buildSystemPrompt from this module)
// ---------------------------------------------------------------------------

export { buildSystemPrompt } from './exchange-prompts';

// ---------------------------------------------------------------------------
// Exchange processing
// ---------------------------------------------------------------------------

/**
 * Processes a single learner exchange through the LLM.
 *
 * - Builds the system prompt from context
 * - Constructs the messages array (system + history + new user message)
 * - Routes to the appropriate model via routeAndCall
 * - Detects understanding check markers in the response
 */
export async function processExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeResult> {
  const systemPrompt = _buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(userMessage, imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const result: RouteResult = await routeAndCall(
    messages,
    context.escalationRung,
    {
      llmTier: context.llmTier,
      ageBracket,
      // BKT-C.1 — forward profile-level personalization to the router so the
      // safety preamble carries it on every provider uniformly.
      conversationLanguage: context.conversationLanguage,
      pronouns: context.pronouns,
    }
  );

  const parsed = parseExchangeEnvelope(result.response, {
    sessionId: context.sessionId,
    profileId: context.profileId,
    flow: 'processExchange',
  });

  return {
    response: parsed.cleanResponse,
    newEscalationRung: context.escalationRung,
    isUnderstandingCheck: parsed.understandingCheck,
    expectedResponseMinutes: estimateExpectedResponseMinutes(
      parsed.cleanResponse,
      context
    ),
    needsDeepening: parsed.needsDeepening,
    partialProgress: parsed.partialProgress,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    notePrompt: parsed.notePrompt || undefined,
    notePromptPostSession: parsed.notePromptPostSession || undefined,
    fluencyDrill: parsed.fluencyDrill ?? undefined,
    confidence: parsed.confidence,
  };
}

/**
 * Streaming variant — returns an async iterable of response chunks.
 *
 * Same prompt assembly as processExchange, but uses routeAndStream.
 */
export async function streamExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeStreamResult> {
  const systemPrompt = _buildSystemPrompt(context);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context.exchangeHistory.map((e) => ({
      role: e.role,
      content: e.content,
    })),
    {
      role: 'user' as const,
      content: buildUserContent(userMessage, imageData),
    },
  ];

  const ageBracket = resolveAgeBracket(context.birthYear);
  const result: StreamResult = await routeAndStream(
    messages,
    context.escalationRung,
    {
      llmTier: context.llmTier,
      ageBracket,
      conversationLanguage: context.conversationLanguage,
      pronouns: context.pronouns,
    }
  );

  const { cleanReplyStream, rawResponsePromise } = teeEnvelopeStream(
    result.stream
  );

  return {
    stream: cleanReplyStream,
    rawResponsePromise,
    newEscalationRung: context.escalationRung,
    provider: result.provider,
    model: result.model,
  };
}

/** Fluency drill annotation extracted from the envelope's ui_hints.fluency_drill */
export interface FluencyDrillAnnotation {
  active: boolean;
  durationSeconds?: number;
  score?: { correct: number; total: number };
}

export interface ParsedExchangeEnvelope {
  cleanResponse: string;
  understandingCheck: boolean;
  partialProgress: boolean;
  needsDeepening: boolean;
  notePrompt: boolean;
  notePromptPostSession: boolean;
  fluencyDrill: FluencyDrillAnnotation | null;
  /** F6: LLM self-reported confidence level. Absent means treat as 'medium'. */
  confidence?: 'low' | 'medium' | 'high';
  /**
   * Interview-specific: LLM signalled readiness to close the interview.
   * False for non-interview flows and for every fallback-shaped parse result.
   * Surfaced here so callers that already hold a `ClassifiedExchangeOutcome`
   * don't have to re-parse the envelope a second time.
   */
  readyToFinish: boolean;
}

// ExchangeFallback + ExchangeFallbackReason are imported from
// @eduagent/schemas so the wire contract for the SSE `fallback` frame is
// shared with the mobile client. Do not redefine them here.
export type { ExchangeFallback, ExchangeFallbackReason };

export interface ClassifiedExchangeOutcome {
  parsed: ParsedExchangeEnvelope;
  fallback?: ExchangeFallback;
}

// Markers that have a live UI consumer in mobile. A "handled marker" is NOT
// an orphan_marker fallback — parseExchangeEnvelope already extracts it into
// parsed.notePrompt / parsed.fluencyDrill, the route forwards these on the
// `done` frame, and mobile dispatches the corresponding widget. Audit
// (2026-04-24): use-session-streaming.ts reads notePrompt + fluencyDrill +
// notePromptPostSession via the done frame; no consumer for escalationHold
// today, so it remains an orphan_marker (loud so missing wiring surfaces).
//
// Update this set when a new marker handler is wired. Adding a key here
// without wiring the handler will silently suppress the orphan_marker
// fallback — guard with an integration test that exercises the dispatch.
const HANDLED_MARKER_KEYS: ReadonlySet<string> = new Set([
  'notePrompt',
  'fluencyDrill',
]);

const DEFAULT_FALLBACK_TEXT = "I didn't have a reply — tap to try again.";

// Shared bounds for fluency-drill duration, used by both the full-envelope
// and bare-marker code paths so the clamp definition can't drift.
function clampDrillDuration(seconds: number): number {
  return Math.min(90, Math.max(15, seconds));
}

/**
 * Parse the full envelope from a (non-streaming or accumulated-stream) LLM
 * response and normalise signals + ui_hints into the flat structure exchange
 * callers consume today. On envelope parse failure, the raw text is surfaced
 * as the reply and all signals default to false — no silent "everything is
 * fine" recovery, because we also warn via the logger so the migration can
 * be monitored.
 */
export function parseExchangeEnvelope(
  response: string,
  context?: { sessionId?: string; profileId?: string; flow?: string }
): ParsedExchangeEnvelope {
  const parsed = parseEnvelope(response);
  if (!parsed.ok) {
    logger.warn('exchange.envelope_parse_failed', {
      flow: context?.flow,
      session_id: context?.sessionId,
      profile_id: context?.profileId,
      reason: parsed.reason,
    });
    return {
      cleanResponse: response.trim(),
      understandingCheck: detectUnderstandingCheckFromProse(response),
      partialProgress: false,
      needsDeepening: false,
      notePrompt: false,
      notePromptPostSession: false,
      fluencyDrill: null,
      readyToFinish: false,
    };
  }

  return envelopeToParsedExchange(parsed.envelope);
}

// Map an already-parsed (Zod-validated) envelope into the flat exchange shape.
// Split out so callers that already hold a `LlmResponseEnvelope` (e.g.
// classifyExchangeOutcome) don't re-run `parseEnvelope` on the raw response.
function envelopeToParsedExchange(
  envelope: LlmResponseEnvelope
): ParsedExchangeEnvelope {
  const signals = envelope.signals ?? {};
  const uiHints = envelope.ui_hints ?? {};
  const cleanReply = envelope.reply.trim();

  const notePrompt = uiHints.note_prompt;
  const drill = uiHints.fluency_drill;
  const fluencyDrill: FluencyDrillAnnotation | null = drill
    ? {
        active: Boolean(drill.active),
        durationSeconds:
          typeof drill.duration_s === 'number'
            ? clampDrillDuration(drill.duration_s)
            : undefined,
        score:
          drill.score &&
          typeof drill.score.correct === 'number' &&
          typeof drill.score.total === 'number'
            ? { correct: drill.score.correct, total: drill.score.total }
            : undefined,
      }
    : null;

  return {
    cleanResponse: cleanReply,
    understandingCheck:
      signals.understanding_check === true ||
      // Legacy prose heuristic — kept as an observational fallback when the
      // model doesn't emit the signal explicitly. Cheap to compute, no
      // control-flow impact beyond the telemetry flag.
      detectUnderstandingCheckFromProse(cleanReply),
    partialProgress: signals.partial_progress === true,
    needsDeepening: signals.needs_deepening === true,
    notePrompt: notePrompt?.show === true,
    notePromptPostSession: notePrompt?.post_session === true,
    fluencyDrill,
    confidence: envelope.confidence,
    readyToFinish: signals.ready_to_finish === true,
  };
}

// Reads the raw `reply` string out of the first JSON object without going
// through Zod, so we can distinguish "schema violation due to empty reply"
// (→ empty_reply) from "schema violation due to missing reply field"
// (→ marker or malformed). Returns undefined when no `reply` key is
// present or the JSON can't be extracted.
function extractReplyCandidate(response: string): string | undefined {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return undefined;
  try {
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { reply?: unknown }).reply === 'string'
    ) {
      return (parsed as { reply: string }).reply;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

// Pulls handled-marker values out of a bare-marker payload (no `reply`).
// Only reads HANDLED_MARKER_KEYS so an unexpected key never sneaks through.
function parseHandledMarker(response: string): ParsedExchangeEnvelope {
  const base: ParsedExchangeEnvelope = {
    cleanResponse: '',
    understandingCheck: false,
    partialProgress: false,
    needsDeepening: false,
    notePrompt: false,
    notePromptPostSession: false,
    fluencyDrill: null,
    confidence: undefined,
    readyToFinish: false,
  };
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return base;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return base;
  }
  const obj = parsed as Record<string, unknown>;

  if (obj['notePrompt'] === true) {
    base.notePrompt = true;
  }

  const drill = obj['fluencyDrill'];
  if (drill && typeof drill === 'object' && !Array.isArray(drill)) {
    const drillObj = drill as Record<string, unknown>;
    base.fluencyDrill = {
      active: drillObj['active'] === true,
      durationSeconds:
        typeof drillObj['duration_s'] === 'number'
          ? clampDrillDuration(drillObj['duration_s'] as number)
          : undefined,
      score:
        drillObj['score'] &&
        typeof drillObj['score'] === 'object' &&
        typeof (drillObj['score'] as { correct?: unknown }).correct ===
          'number' &&
        typeof (drillObj['score'] as { total?: unknown }).total === 'number'
          ? {
              correct: (drillObj['score'] as { correct: number }).correct,
              total: (drillObj['score'] as { total: number }).total,
            }
          : undefined,
    };
  }

  return base;
}

// Returns the first matching known-marker key, or null if not marker-shaped.
// Shares KNOWN_MARKER_KEYS with isRecognizedMarker so the two views of
// "what counts as a marker" never drift.
function extractKnownMarkerKey(response: string): string | null {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if ('reply' in obj) return null; // a full envelope, not a marker
  for (const key of Object.keys(obj)) {
    if (KNOWN_MARKER_KEYS.has(key)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// classifyExchangeOutcome — wraps parseExchangeEnvelope and classifies the
// outcome into a fallback bucket per spec §4.1a. Used by streamMessage and
// streamInterviewExchange onComplete to decide whether to persist the
// ai_response row, refund quota, and emit a dedicated SSE `fallback` event
// in the route layer.
//
// The three reason buckets are distinct on purpose (spec §7): they let
// triage separate "LLM format drift" (malformed_envelope) from
// "widget-trigger without handler" (orphan_marker) from "LLM refused to
// answer" (empty_reply) without parsing Inngest event names.
//
// Handled markers (notePrompt, fluencyDrill) do NOT trigger a fallback —
// they route through the normal envelope-parse pipeline so the mobile
// dispatch path still runs. Guarded by the regression test
// "NO fallback for known dispatched markers" in exchanges.test.ts.
// ---------------------------------------------------------------------------
export function classifyExchangeOutcome(
  rawResponse: string,
  context?: { sessionId?: string; profileId?: string; flow?: string }
): ClassifiedExchangeOutcome {
  const envelopeResult = parseEnvelope(rawResponse);

  // Normal envelope path — parsed cleanly; classify empty reply here.
  // Pass the already-validated envelope to envelopeToParsedExchange so we
  // don't redo the Zod validation a second time.
  if (envelopeResult.ok) {
    const parsed = envelopeToParsedExchange(envelopeResult.envelope);
    if (parsed.cleanResponse.trim() === '') {
      return {
        parsed,
        fallback: {
          reason: 'empty_reply',
          fallbackText: DEFAULT_FALLBACK_TEXT,
        },
      };
    }
    return { parsed };
  }

  // Envelope parse failed. Two sub-cases need separate treatment before
  // declaring the response malformed:
  //   1. Payload has a reply field but it's empty/whitespace → empty_reply
  //      (schema violation: reply: z.string().min(1)). Semantically the LLM
  //      refused to answer, not a format drift.
  //   2. Marker-shaped payloads with no `reply` field → HANDLED markers
  //      pass through, unhandled markers become orphan_marker.
  // Anything else is genuine garbage (malformed_envelope).
  const replyCandidate = extractReplyCandidate(rawResponse);
  if (replyCandidate !== undefined && replyCandidate.trim().length === 0) {
    const emptyReplyParsed: ParsedExchangeEnvelope = {
      cleanResponse: '',
      understandingCheck: false,
      partialProgress: false,
      needsDeepening: false,
      notePrompt: false,
      notePromptPostSession: false,
      fluencyDrill: null,
      confidence: undefined,
      readyToFinish: false,
    };
    return {
      parsed: emptyReplyParsed,
      fallback: {
        reason: 'empty_reply',
        fallbackText: DEFAULT_FALLBACK_TEXT,
      },
    };
  }

  const markerKey = extractKnownMarkerKey(rawResponse);

  if (markerKey !== null && HANDLED_MARKER_KEYS.has(markerKey)) {
    // Marker has a downstream handler. Do NOT fallback — surface the
    // marker's value into the `parsed` shape directly so the route
    // forwards it on the `done` frame. parseExchangeEnvelope only reads
    // full envelopes; bare markers need targeted extraction here.
    return { parsed: parseHandledMarker(rawResponse) };
  }

  const emptyParsed: ParsedExchangeEnvelope = {
    cleanResponse: '',
    understandingCheck: false,
    partialProgress: false,
    needsDeepening: false,
    notePrompt: false,
    notePromptPostSession: false,
    fluencyDrill: null,
    confidence: undefined,
    readyToFinish: false,
  };

  if (markerKey === null) {
    return {
      parsed: emptyParsed,
      fallback: {
        reason: 'malformed_envelope',
        fallbackText: DEFAULT_FALLBACK_TEXT,
      },
    };
  }

  // Marker-shaped but no live handler — orphan. Surfaces missing wiring
  // loudly so a new marker key without a UI consumer can't ship silently.
  return {
    parsed: emptyParsed,
    fallback: {
      reason: 'orphan_marker',
      fallbackText: DEFAULT_FALLBACK_TEXT,
    },
  };
}

/** Observational prose heuristic — never drives control flow on its own. */
function detectUnderstandingCheckFromProse(response: string): boolean {
  const lower = response.toLowerCase();
  return UNDERSTANDING_CHECK_PATTERNS.some((pattern) =>
    lower.includes(pattern.toLowerCase())
  );
}
