// ---------------------------------------------------------------------------
// Canonical Memory Projection — single source of truth for one profile's memory
// ---------------------------------------------------------------------------
// Both the learner self-view (GET /learner-profile) and the parent child-view
// (GET /dashboard/children/:profileId/memory) read through this projection.
// Adding a new field here flows to both views, and the drift-guard test in
// projection.test.ts enforces that every field is wired into both adapters
// (or explicitly listed in PROJECTION_OPT_OUT with a reason).
// ---------------------------------------------------------------------------

import { createScopedRepository, type Database } from '@eduagent/database';
import type {
  InterestEntry,
  LearningStyle,
  StrengthEntry,
  StruggleEntry,
} from '@eduagent/schemas';
import { interestsArraySchema } from '@eduagent/schemas';
import type { CuratedMemoryView } from '../curated-memory';
import { buildCuratedMemoryView } from '../curated-memory';
import {
  getLearningProfile,
  getOrCreateLearningProfile,
} from '../learner-profile';
import {
  hasMemoryFactsBackfillMarker,
  readMemorySnapshotFromFacts,
} from './memory-facts';

// ---------------------------------------------------------------------------
// MemoryProjection — canonical in-memory shape for one profile's memory state
// ---------------------------------------------------------------------------

/**
 * Canonical projection of one profile's memory state.
 *
 * The memory arrays (interests/strengths/struggles/communicationNotes) may
 * come from the JSONB columns on `learning_profiles` or from the normalised
 * `memory_facts` table, depending on the `MEMORY_FACTS_READ_ENABLED` flag.
 * All other fields are always sourced from the `learning_profiles` row.
 *
 * Rules for adding fields:
 * 1. Add the field here with its correct TypeScript type.
 * 2. Wire it into toLearnerSelfView() AND toCuratedView() below, OR add it
 *    to PROJECTION_OPT_OUT with a one-line reason.
 * 3. The drift-guard test in projection.test.ts will fail CI if you skip
 *    either step.
 */
export type MemoryProjection = {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;
  profileId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;

  // ── Memory facts (flag-aware; may come from JSONB or memory_facts) ────────
  interests: InterestEntry[];
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  communicationNotes: string[];

  // ── Memory metadata (always from JSONB) ───────────────────────────────────
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
  memoryFactsBackfilledAt: Date | null | undefined;

  // ── Learning style (always from JSONB) ────────────────────────────────────
  learningStyle: LearningStyle;

  // ── Memory settings ───────────────────────────────────────────────────────
  memoryEnabled: boolean;
  memoryCollectionEnabled: boolean;
  memoryInjectionEnabled: boolean;
  memoryConsentStatus: string;
  accommodationMode: string;
  consentPromptDismissedAt: Date | null | undefined;

  // ── Misc ──────────────────────────────────────────────────────────────────
  effectivenessSessionCount: number;
  recentlyResolvedTopics: string[];
};

// ---------------------------------------------------------------------------
// Fields intentionally opt-out of one or both view adapters
// ---------------------------------------------------------------------------

/**
 * Fields present in MemoryProjection that are deliberately absent from one or
 * both view adapters. Each entry must carry a one-line reason. The drift-guard
 * test compares Object.keys(projection) against this set ∪ fields wired into
 * both adapters.
 *
 * Current entries:
 *   memoryFactsBackfilledAt — internal read-path marker; not user-visible in
 *     either view. The curated view has no use for it; the learner view passes
 *     it through via toLearnerSelfView (it is part of the raw profile shape
 *     returned by that route) so it IS wired into the self-view adapter below.
 *
 *   suppressedInferences — only in learner self-view (the raw profile); the
 *     curated view deliberately omits suppressed items per [F-PV-09].
 *
 *   interestTimestamps — only in learner self-view; the curated view does not
 *     expose timestamps to parents.
 *
 *   consentPromptDismissedAt — only in learner self-view; parents see the
 *     effective consent outcome (injectionEnabled) not the UI-level dismiss
 *     timestamp.
 *
 *   effectivenessSessionCount — only in learner self-view; internal counter
 *     not surfaced in the parent curated view.
 *
 *   recentlyResolvedTopics — only in learner self-view; session-recency data
 *     not surfaced in the parent curated view.
 *
 *   version — only in learner self-view; internal row version not surfaced
 *     in the parent curated view.
 *
 *   id — only in learner self-view (raw profile UUID); the curated view is
 *     keyed by profileId from the route, not the internal row id.
 */
export const PROJECTION_OPT_OUT = new Set<keyof MemoryProjection>([
  'memoryFactsBackfilledAt', // internal marker; see note above
  'suppressedInferences', // learner self-view only; omitted from curated view
  'interestTimestamps', // learner self-view only; parents don't see timestamps
  'consentPromptDismissedAt', // learner self-view only; UI-level dismiss ts
  'effectivenessSessionCount', // learner self-view only; internal counter
  'recentlyResolvedTopics', // learner self-view only; session-recency data
  'version', // learner self-view only; internal row version
  'id', // learner self-view only; internal row UUID
]);

// ---------------------------------------------------------------------------
// Hydration helpers
// ---------------------------------------------------------------------------

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asStrengthArray(value: unknown): StrengthEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is StrengthEntry =>
      Boolean(item) && typeof item === 'object' && 'subject' in item,
  );
}

function asStruggleArray(value: unknown): StruggleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is StruggleEntry =>
      Boolean(item) && typeof item === 'object' && 'topic' in item,
  );
}

function asInterestTimestamps(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core: build a MemoryProjection from a raw DB row + optional facts snapshot
// ---------------------------------------------------------------------------

function buildProjectionFromRow(
  row: {
    id: string;
    profileId: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    interests: unknown;
    strengths: unknown;
    struggles: unknown;
    communicationNotes: unknown;
    suppressedInferences: unknown;
    interestTimestamps: unknown;
    memoryFactsBackfilledAt: Date | null | undefined;
    learningStyle: unknown;
    memoryEnabled: boolean;
    memoryCollectionEnabled: boolean;
    memoryInjectionEnabled: boolean;
    memoryConsentStatus: string;
    accommodationMode: string;
    consentPromptDismissedAt: Date | null | undefined;
    effectivenessSessionCount: number;
    recentlyResolvedTopics: unknown;
  },
  overrides?: {
    interests?: InterestEntry[];
    strengths?: StrengthEntry[];
    struggles?: StruggleEntry[];
    communicationNotes?: string[];
  },
): MemoryProjection {
  const interestsParsed = interestsArraySchema.safeParse(row.interests);

  return {
    id: row.id,
    profileId: row.profileId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,

    interests:
      overrides?.interests ??
      (interestsParsed.success ? interestsParsed.data : []),
    strengths: overrides?.strengths ?? asStrengthArray(row.strengths),
    struggles: overrides?.struggles ?? asStruggleArray(row.struggles),
    communicationNotes:
      overrides?.communicationNotes ?? asStringArray(row.communicationNotes),

    suppressedInferences: asStringArray(row.suppressedInferences),
    interestTimestamps: asInterestTimestamps(row.interestTimestamps),
    memoryFactsBackfilledAt: row.memoryFactsBackfilledAt,

    learningStyle: (row.learningStyle as LearningStyle) ?? null,

    memoryEnabled: row.memoryEnabled,
    memoryCollectionEnabled: row.memoryCollectionEnabled,
    memoryInjectionEnabled: row.memoryInjectionEnabled,
    memoryConsentStatus: row.memoryConsentStatus,
    accommodationMode: row.accommodationMode,
    consentPromptDismissedAt: row.consentPromptDismissedAt,

    effectivenessSessionCount: row.effectivenessSessionCount,
    recentlyResolvedTopics: asStringArray(row.recentlyResolvedTopics),
  };
}

// ---------------------------------------------------------------------------
// getMemoryProjection — reads from DB, optionally merging facts
// ---------------------------------------------------------------------------

/**
 * Fetch the canonical MemoryProjection for a profile.
 *
 * Returns null if the profile does not exist (callers decide how to handle
 * missing profiles — the dashboard route returns an empty default view;
 * the learner route ensures creation first via getOrCreateLearningProfile).
 *
 * The memory arrays are sourced from memory_facts when
 * `options.memoryFactsReadEnabled` is true AND the profile has the backfill
 * marker set; otherwise they come from the JSONB columns.
 */
export async function getMemoryProjection(
  db: Database,
  profileId: string,
  options?: { memoryFactsReadEnabled?: boolean },
): Promise<MemoryProjection | null> {
  const row = await getLearningProfile(db, profileId);
  if (!row) return null;
  return buildProjectionForRow(db, profileId, row, options);
}

/**
 * Same as getMemoryProjection but creates the learning profile if missing.
 * Use this on the learner self-view route where the profile must exist.
 */
export async function getOrCreateMemoryProjection(
  db: Database,
  profileId: string,
  options?: { memoryFactsReadEnabled?: boolean },
): Promise<MemoryProjection> {
  const row = await getOrCreateLearningProfile(db, profileId);
  return buildProjectionForRow(db, profileId, row, options);
}

async function buildProjectionForRow(
  db: Database,
  profileId: string,
  row: Parameters<typeof buildProjectionFromRow>[0],
  options?: { memoryFactsReadEnabled?: boolean },
): Promise<MemoryProjection> {
  const useFacts =
    options?.memoryFactsReadEnabled && hasMemoryFactsBackfillMarker(row);

  if (!useFacts) {
    return buildProjectionFromRow(row);
  }

  const snapshot = await readMemorySnapshotFromFacts(
    createScopedRepository(db, profileId),
    row,
    { respectInjectionToggle: false },
  );

  return buildProjectionFromRow(row, {
    interests: snapshot.interests,
    strengths: snapshot.strengths,
    struggles: snapshot.struggles,
    communicationNotes: snapshot.communicationNotes,
  });
}

// ---------------------------------------------------------------------------
// View adapters
// ---------------------------------------------------------------------------

/**
 * Derive the learner self-view from the projection.
 *
 * The returned object satisfies `learnerProfileResponseSchema` — it is the
 * shape returned by GET /learner-profile. Date fields are left as Date objects
 * because the schema's `_lpDateField` union handles both string and Date.
 *
 * Fields wired: ALL fields in MemoryProjection (the self-view is the full
 * raw profile shape, so it carries every field the projection holds).
 */
export function toLearnerSelfView(projection: MemoryProjection): {
  id: string;
  profileId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  interests: InterestEntry[];
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  communicationNotes: string[];
  suppressedInferences: string[];
  interestTimestamps: Record<string, string>;
  learningStyle: LearningStyle;
  memoryEnabled: boolean;
  memoryCollectionEnabled: boolean;
  memoryInjectionEnabled: boolean;
  memoryConsentStatus: string;
  accommodationMode: string;
  consentPromptDismissedAt: Date | null | undefined;
  effectivenessSessionCount: number;
  recentlyResolvedTopics: string[];
  memoryFactsBackfilledAt: Date | null | undefined;
} {
  return {
    id: projection.id,
    profileId: projection.profileId,
    version: projection.version,
    createdAt: projection.createdAt,
    updatedAt: projection.updatedAt,

    interests: projection.interests,
    strengths: projection.strengths,
    struggles: projection.struggles,
    communicationNotes: projection.communicationNotes,
    suppressedInferences: projection.suppressedInferences,
    interestTimestamps: projection.interestTimestamps,
    memoryFactsBackfilledAt: projection.memoryFactsBackfilledAt,

    learningStyle: projection.learningStyle,

    memoryEnabled: projection.memoryEnabled,
    memoryCollectionEnabled: projection.memoryCollectionEnabled,
    memoryInjectionEnabled: projection.memoryInjectionEnabled,
    memoryConsentStatus: projection.memoryConsentStatus,
    accommodationMode: projection.accommodationMode,
    consentPromptDismissedAt: projection.consentPromptDismissedAt,

    effectivenessSessionCount: projection.effectivenessSessionCount,
    recentlyResolvedTopics: projection.recentlyResolvedTopics,
  };
}

/**
 * Derive the curated parent-facing view from the projection.
 *
 * The returned object satisfies `CuratedMemoryView` — it is the shape
 * returned by GET /dashboard/children/:profileId/memory.
 *
 * Fields wired: interests, strengths, struggles, communicationNotes,
 * learningStyle (content); memoryEnabled, memoryCollectionEnabled,
 * memoryInjectionEnabled, memoryConsentStatus, accommodationMode (settings).
 *
 * Fields NOT wired (in PROJECTION_OPT_OUT): id, profileId, version,
 * createdAt, updatedAt, suppressedInferences, interestTimestamps,
 * memoryFactsBackfilledAt, consentPromptDismissedAt,
 * effectivenessSessionCount, recentlyResolvedTopics.
 */
export function toCuratedView(projection: MemoryProjection): CuratedMemoryView {
  return buildCuratedMemoryView({
    interests: projection.interests,
    strengths: projection.strengths,
    struggles: projection.struggles,
    communicationNotes: projection.communicationNotes,
    learningStyle: projection.learningStyle as Record<string, unknown> | null,
    memoryEnabled: projection.memoryEnabled,
    memoryCollectionEnabled: projection.memoryCollectionEnabled,
    memoryInjectionEnabled: projection.memoryInjectionEnabled,
    memoryConsentStatus: projection.memoryConsentStatus,
    accommodationMode: projection.accommodationMode,
  });
}
