// ---------------------------------------------------------------------------
// Session Service — barrel export
// Decomposed from the monolithic session.ts into 8 focused modules
// ---------------------------------------------------------------------------

// Cache
export {
  resetSessionStaticContextCache,
  getSessionStaticContext,
  getSessionStaticContextCacheKey,
  touchSessionStaticContextCacheEntry,
  clearSessionStaticContext,
  clearSessionStaticContextForProfile,
  getCachedHomeworkLibraryContext,
  getCachedBookLearningHistoryContext,
} from './session-cache';
export type {
  SessionStaticContextCacheEntry,
  SessionSupplementaryData,
} from './session-cache';

// Context builders
export {
  computeActiveSeconds,
  buildBookLearningHistoryContext,
  buildHomeworkLibraryContext,
  formatLearningRecency,
  perGapCap,
} from './session-context-builders';
export type { TimedEvent } from './session-context-builders';

// Events & mappers
export {
  mapSessionRow,
  mapSummaryRow,
  findSessionSummaryRow,
  insertSessionEvent,
  setSessionInputMode,
} from './session-events';
export type { RecordableSessionEventType } from './session-events';

// CRUD (start, get, close, transcript)
export {
  SubjectInactiveError,
  SessionExchangeLimitError,
  CurriculumSessionNotReadyError,
  MAX_EXCHANGES_PER_SESSION,
  startSession,
  startFirstCurriculumSession,
  getSession,
  clearContinuationDepth,
  closeSession,
  closeStaleSessions,
  getSessionCompletionContext,
  getSessionTranscript,
  recordSystemPrompt,
  recordSessionEvent,
  flagContent,
  claimSessionForFilingRetry,
  getResumeNudgeCandidate,
} from './session-crud';
export type { ResumeNudgeCandidate } from './session-crud';

// Exchange (message processing)
export {
  checkExchangeLimit,
  mergeMemoryContexts,
  prepareExchangeContext,
  persistExchangeResult,
  processMessage,
  streamMessage,
} from './session-exchange';
export type { ExchangeBehavioralMetrics } from './session-exchange';

// Summary
export {
  getSessionSummary,
  skipSummary,
  submitSummary,
} from './session-summary';

export { generateLearnerRecap } from '../session-recap';

// Homework
export {
  syncHomeworkState,
  getHomeworkTrackingMetadata,
} from './session-homework';

// Book sessions
export { getBookSessions, backfillSessionTopicId } from './session-book';
export type { BookSession } from './session-book';

// Depth evaluation
export { evaluateSessionDepth } from './session-depth';

// Topic sessions (Library v3)
export { getTopicSessions } from './session-topic';
export type { TopicSession } from './session-topic';

// Subject sessions (Past conversations)
export { getSubjectSessions } from './session-subject';
export type { SubjectSession } from '@eduagent/schemas';
