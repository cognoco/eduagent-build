/**
 * exchange-types.ts
 *
 * Canonical home for ExchangeContext and its local type dependencies.
 * Extracted from exchanges.ts to break the type cycle:
 *   exchanges.ts ⇄ exchange-prompts.ts  (cycle #7)
 *   exchanges.ts ⇄ language-prompts.ts  (cycle #8, via exchange-prompts)
 *
 * exchanges.ts re-exports everything from here for backward compatibility.
 * Importers that only need the types should import from this module directly.
 */

import type {
  AppShell,
  HomeworkMode,
  InputMode,
  SessionType,
  ConversationLanguage,
  VerificationType,
  ExtractedInterviewSignals,
  ChallengeRoundSessionState,
  RecitationSetupTransition,
} from '@eduagent/schemas';
import type {
  EscalationRung,
  LlmProviderPolicy,
  PreferredLlmProvider,
} from './llm';
import type { LLMTier } from './subscription';
import type { LanguageSessionState } from './language-session-engine';

// ---------------------------------------------------------------------------
// Source evidence types
// ---------------------------------------------------------------------------

export type ExchangeSourceReliability =
  | 'trusted_app_content'
  | 'learner_provided'
  | 'conversation_only'
  | 'memory_only'
  | 'model_general_knowledge'
  | 'reasoning';

export type ExchangeSourceEvidenceKind =
  | 'current_topic'
  | 'interleaved_topics'
  | 'app_help_map'
  | 'homework_problem'
  | 'recitation_text'
  | 'deterministic_reasoning'
  | 'learner_message'
  | 'learner_intent'
  | 'conversation_history'
  | 'prior_learning'
  | 'mentor_memory'
  | 'accommodation'
  | 'general_knowledge';

export const GENERAL_KNOWLEDGE_SOURCE_ID = 'general_knowledge';
export const GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR = 0.88;

export interface ExchangeSourceEvidence {
  /** Stable ID the model must use in private_sources.relied_on. */
  id: string;
  kind: ExchangeSourceEvidenceKind;
  reliability: ExchangeSourceReliability;
  label: string;
  excerpt?: string;
  /** True when this evidence may support factual teaching/app claims. */
  reliableForFacts: boolean;
}

// ---------------------------------------------------------------------------
// Review callback (RR-1 + RR-13 minimal thread)
// ---------------------------------------------------------------------------

/**
 * The learner's last outcome on a topic, derived authoritatively from the SM-2
 * retention card (NOT from the raw last message — see CH-1 in
 * docs/specs/2026-06-27-rr1-rr13-warm-review-callback.md). Drives the warm,
 * honest branching of the review-callback opener.
 */
export type ReviewOutcome =
  | 'cracked' // last review succeeded — "has it stuck?"
  | 'wobbled' // last review missed / decayed — pick up where it got shaky
  | 'first_time' // no prior review history on this card
  | 'long_gap' // >30 days since last review — gentle re-entry, no outcome claim
  | 'unknown'; // safe neutral default

/** Minimal cross-session memory thread feeding the warm review opener. */
export interface ReviewCallback {
  topicTitle: string;
  outcome: ReviewOutcome;
  daysSinceLastReview: number | null;
  /**
   * Last learner message on this topic. Populated ONLY when outcome==='cracked';
   * used as PRIVATE grounding for the model, NEVER quoted verbatim (CH-1).
   */
  lastLearnerMessage: string | null;
}

// ---------------------------------------------------------------------------
// ExchangeContext
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
    orphan_reason?: string;
  }>;
  birthYear: number;
  /**
   * [WI-367] Exact birth-date parts, when known. Additive-only — existing
   * tone/theming callers (e.g. the Challenge Round grader) keep reading
   * birthYear alone via year-only computeAgeBracket(); safety-adjacent
   * callers (the suitability-judge dispatch) use these with
   * computeAgeBracketFromDate().
   */
  birthMonth?: number;
  birthDay?: number;
  priorLearningContext?: string;
  /** Cross-subject learning highlights — recent topics from other subjects (Story 16.0) */
  crossSubjectContext?: string;
  learningHistoryContext?: string;
  /** Compact handoff from a previous completed session when learner taps Continue */
  resumeContext?: string;
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
    /** Server-resolved owner of this topic; never supplied by the model. */
    subjectId?: string;
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
  /** Server-selected language activity state for four-strands sessions. */
  languageSessionState?: LanguageSessionState;
  /** EVALUATE difficulty rung 1-4 (FR128-133) */
  evaluateDifficultyRung?: 1 | 2 | 3 | 4;
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
  /** Optional provider preference for experiment-style routing; router still falls back safely. */
  preferredLlmProvider?: PreferredLlmProvider;
  /** Provider boundary for commercial plan rules, e.g. Family standard stays Gemini-only. */
  llmProviderPolicy?: LlmProviderPolicy;
  /** Human-readable routing reason stored in session metadata for observability. */
  llmRoutingReason?: string;
  /** Optional routing-only rung. Leaves escalationRung available for pedagogy/analytics. */
  llmRoutingRung?: EscalationRung;
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
  /**
   * Consecutive correct answers at the current escalation rung, capped at 5.
   * Drives the ADAPTIVE ESCALATION prompt section (B.3). Computed server-side
   * in session-exchange.ts from session_events. Undefined means no streak data.
   */
  correctStreak?: number;
  /** Default-closed gate for ordinary per-turn answer evaluation. */
  answerEvaluationEnabled?: boolean;
  /** Client-side effective mode — drives mode-specific prompt sections (e.g. recitation) */
  effectiveMode?: string;
  /** Server-owned recitation setup transition for this exchange. */
  recitationSetup?: RecitationSetupTransition;
  /**
   * [WI-2220] Active app nav shell, threaded from the client per exchange
   * (mirrors effectiveMode above). Selects which app-help destination map
   * buildAppHelpPromptBlock answers app-navigation questions from. Absent or
   * anything other than 'v2' resolves to the 'v0' map — see app-help-map.ts.
   */
  shell?: AppShell;
  /** Gap labels carried from a borderline assessment into a focused refresh session. */
  gapAreas?: string[];
  /** Continuation opener phase for same-topic resume sessions. */
  continuationOpenerPhase?: 'probe' | 'score';
  /** Continuation depth chosen after the opener score. */
  continuationDepth?: 'low' | 'mid' | 'high';
  /**
   * Learner's display name — used to personalise the mentor's voice.
   * WI-580 (F-076): only populated for adult owner profiles
   * (resolvePromptLearnerName); a minor's real name must never be sent to a
   * third-party LLM provider.
   */
  learnerName?: string;
  /** Interview-derived hints captured during fast-path onboarding. */
  onboardingSignals?: ExtractedInterviewSignals;
  /** True when this profile has not previously completed an exchange on this topic. */
  isFirstEncounter?: boolean;
  /** True on the first session this profile has ever started for this subject. */
  isFirstSessionOfSubject?: boolean;
  /** Topic-probe signals extracted from the prior learner turn, when available. */
  extractedSignalsToReflect?: {
    goals?: string;
    currentKnowledge?: string;
    interests?: string[];
  } | null;
  /** Private source pack for the LLM. Built server-side per exchange. */
  sourceEvidence?: ExchangeSourceEvidence[];
  /** True when evaluateChallengeReadiness allows offering a Challenge Round on this turn. */
  challengeEligible?: boolean;
  /** Current Challenge Round state machine snapshot from session metadata. */
  challengeRound?: ChallengeRoundSessionState;
  /** Server-generated id to use when evaluating the current learner answer. */
  currentUserMessageEventId?: string;
  /** Runtime gate for evidence-bound homework mentor-notice detection. */
  mentorNoticeEnabled?: boolean;
  /** Active bounded mentor-notice re-check offered in this session. */
  mentorNoticeRecheck?: {
    id: string;
    concept: string;
    correctionHint: string | null;
    exchangeNumber: number;
  };
  /**
   * Runtime kill switch for Challenge Round prompt injection and offer
   * consumption. Sourced from the typed `CHALLENGE_ROUND_RUNTIME_ENABLED`
   * env flag at the route boundary. When `false` or undefined, the prompt
   * builder MUST NOT inject any of the three CR prompt blocks (offered,
   * active, drafting) and downstream consumers MUST ignore LLM offer
   * signals. Lets Phase 1+ ship dark and flip in Doppler after Phase 5
   * read-side hardening lands. See docs/plans/2026-05-18-challenge-round-targets.md.
   */
  challengeRuntimeEnabled?: boolean;
  /**
   * When true, a separate grader call on the judge owns the
   * `challenge_round_evaluation` signal — so the tutor system prompt must NOT
   * ask for it (converse-only). Threaded from `CHALLENGE_ROUND_GRADER_ENABLED`.
   */
  graderEnabled?: boolean;
  /**
   * Warm review-callback opener material (RR-1 + RR-13). Populated only when
   * `REVIEW_CALLBACK_OPENER_ENABLED` is on AND this is a review-mode first turn.
   * When present, the REVIEW prompt block emits the outcome-branched warm opener
   * instead of the legacy "this is a review check" transition line.
   */
  reviewCallback?: ReviewCallback;
}
