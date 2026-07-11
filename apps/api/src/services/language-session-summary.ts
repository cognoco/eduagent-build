// ---------------------------------------------------------------------------
// [WI-1553] Language session-end learning summary — pure derivation from
// session_events. No LLM calls: every field is computed from the
// `languageLearning` telemetry already stamped onto `ai_response` events by
// the streaming path (see streamLanguageLearningActivitySchema), plus the
// carry-through values the caller supplies (vocabulary classification,
// fluency-drill totals, the cross-session next-practice pointer). See
// docs/plans/2026-07-11-wi1553-session-end-summary.md for the design.
// ---------------------------------------------------------------------------

import {
  streamLanguageLearningActivitySchema,
  type LanguageSessionSummaryData,
  type LanguageSessionSummaryWord,
  type LanguageStrandName,
} from '@eduagent/schemas';
import { evaluatePendingGradedInputAnswer } from './language-session-engine';

const GRAMMAR_PATTERNS_MAX = 5;

export interface LanguageSummaryEvent {
  eventType: string;
  content: string;
  metadata: unknown;
}

function parseLanguageLearning(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const parsed = streamLanguageLearningActivitySchema.safeParse(
    (metadata as { languageLearning?: unknown }).languageLearning,
  );
  return parsed.success ? parsed.data : undefined;
}

function deriveGrammarPatterns(events: LanguageSummaryEvent[]): string[] {
  const seen = new Set<string>();
  const patterns: string[] = [];
  for (const event of events) {
    if (event.eventType !== 'ai_response') continue;
    const activity = parseLanguageLearning(event.metadata);
    for (const pattern of activity?.targetGrammar ?? []) {
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      patterns.push(pattern);
      if (patterns.length >= GRAMMAR_PATTERNS_MAX) return patterns;
    }
  }
  return patterns;
}

// Pairs each graded-input question with the learner's reply. Tracks a
// "pending" state across the loop — mirroring the lastAiAt pattern in
// computeSessionMedianResponseSeconds (session-completed.ts) — rather than
// requiring the user_message to sit at i+1, so a system_prompt/quick_action/
// flag/escalation event landing between the question and the reply (routine
// in a real transcript) doesn't silently drop the turn. A later ai_response
// (of any kind) clears the pending question — the tutor moved the
// conversation on before it was answered, so pairing it with a much-later
// reply would be a stale, misleading match.
function deriveComprehension(
  events: LanguageSummaryEvent[],
): { correct: number; total: number } | null {
  let correct = 0;
  let total = 0;
  let pendingGradedInputEvents: LanguageSummaryEvent[] | null = null;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event) continue;
    if (event.eventType === 'ai_response') {
      const activity = parseLanguageLearning(event.metadata);
      pendingGradedInputEvents = activity?.gradedInput
        ? events.slice(0, i + 1)
        : null;
      continue;
    }
    if (event.eventType === 'user_message' && pendingGradedInputEvents) {
      const evaluation = evaluatePendingGradedInputAnswer({
        events: pendingGradedInputEvents,
        learnerMessage: event.content,
      });
      if (evaluation) {
        total += 1;
        if (evaluation.verdict === 'understood') correct += 1;
      }
      pendingGradedInputEvents = null; // consumed — don't double-count
    }
  }
  return total > 0 ? { correct, total } : null;
}

// Same pending-state approach as deriveComprehension: a voice-modality
// ai_response counts as an attempt on the next user_message regardless of
// intervening non-turn events, and a later ai_response clears the pending
// flag so a single voice prompt is never double-counted across two replies.
function deriveSpeakingAttempts(events: LanguageSummaryEvent[]): number {
  let attempts = 0;
  let pendingVoiceTurn = false;

  for (const event of events) {
    if (event.eventType === 'ai_response') {
      const activity = parseLanguageLearning(event.metadata);
      pendingVoiceTurn = activity?.modality === 'voice';
      continue;
    }
    if (event.eventType === 'user_message' && pendingVoiceTurn) {
      attempts += 1;
      pendingVoiceTurn = false;
    }
  }
  return attempts;
}

// Most recent meaning-output communicative goal in the session — a concrete
// scenario ("order food at a café") reads far better than the subject/language
// name, which is the only other candidate fallback. Walks backwards so the
// last-presented task wins.
function deriveMeaningOutputScenario(
  events: LanguageSummaryEvent[],
): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.eventType !== 'ai_response') continue;
    const activity = parseLanguageLearning(event.metadata);
    if (activity?.meaningOutput?.communicativeGoal) {
      return activity.meaningOutput.communicativeGoal;
    }
  }
  return null;
}

export function computeLanguageSessionSummary(input: {
  events: LanguageSummaryEvent[];
  topicTitle: string | null;
  newWords: LanguageSessionSummaryWord[];
  strengthenedWords: LanguageSessionSummaryWord[];
  fluencyDrillTotals: { correct: number; total: number } | null;
  nextRecommendationStrand: LanguageStrandName | null;
}): LanguageSessionSummaryData {
  return {
    practicedScenario:
      deriveMeaningOutputScenario(input.events) ?? input.topicTitle,
    newWords: input.newWords,
    strengthenedWords: input.strengthenedWords,
    grammarPatterns: deriveGrammarPatterns(input.events),
    comprehension: deriveComprehension(input.events),
    speakingAttempts: deriveSpeakingAttempts(input.events),
    fluency: input.fluencyDrillTotals,
    nextRecommendationStrand: input.nextRecommendationStrand,
  };
}
