/**
 * database-rls-coverage.ts
 *
 * Canonical manifest of tables that carry Row Level Security policies
 * (shipping in migration 0085 / BUG-216). Used by:
 *   - database-rls-coverage.test.ts           (unit: manifest completeness)
 *   - database-rls-coverage.integration.test.ts (integration: pg_policies check)
 *
 * Profile-scoped tables: the RLS USING predicate references `profile_id`.
 * Owner-scoped tables:   the RLS USING predicate references `owner_profile_id`.
 * Person-model tables:   explicit manifest entries only. Do not blanket-scan
 *                         `person_id`; not every person FK is an RLS boundary.
 * Special tables (family_links): OR across both FK columns — see RLS_TABLE_META.
 *
 * Tables with RLS ENABLED but no USING policy yet (cannot appear in
 * ALL_RLS_TABLES — the integration test would fail). See EXPLICITLY_EXCLUDED_TABLES
 * below; each entry needs a follow-up migration to add its `*_profile_isolation`
 * policy before it can graduate into ALL_RLS_TABLES.
 */

export type RlsTableMeta = {
  /**
   * The column that the USING predicate is anchored to.
   * - 'profile_id'       for standard profile-scoped rows
   * - 'owner_profile_id' for owner-scoped tables (withdrawal_archive_preferences,
   *                      pending_notices, family_preferences)
   * - 'charge_person_id' for charge-scoped CUT-A tables (consent_request — the
   *                      isolation anchor is the charge person; person.id =
   *                      profiles.id, so the app.current_profile_id GUC carries
   *                      over unchanged). MMT-ADR-0020 / §1.2a.
   * - 'or-fk-cols'       used when metadata.policyType is 'or-both-fk-cols'
   *                      (family_links uses parent_profile_id OR child_profile_id)
   */
  predicateColumn:
    | 'profile_id'
    | 'owner_profile_id'
    | 'charge_person_id'
    | 'or-fk-cols';
  /**
   * 'standard'        — single-column USING predicate
   * 'or-both-fk-cols' — OR across two FK columns (family_links)
   */
  policyType: 'standard' | 'or-both-fk-cols';
};

/**
 * Tables whose RLS USING clause references `profile_id`.
 */
export const PROFILE_SCOPED_TABLES: readonly string[] = [
  'assessments',
  'retention_cards',
  'needs_deepening_topics',
  'teaching_preferences',
  'consent_states',
  'subjects',
  'curriculum_adaptations',
  'learning_sessions',
  'session_events',
  'session_summaries',
  'parking_lot_items',
  'streaks',
  'xp_ledger',
  'notification_log',
  'learning_modes',
  'coaching_card_cache',
  'vocabulary',
  'vocabulary_retention_cards',
  'session_embeddings',
  'dictation_results',
  'learning_profiles',
  'progress_snapshots',
  'milestones',
  'monthly_reports',
  'topic_notes',
  'memory_facts',
  'memory_dedup_decisions',
  'nudges',
  'quiz_rounds',
  'quiz_missed_items',
  'quiz_mastery_items',
  'bookmarks',
  'progress_summaries',
  'support_messages',
  'weekly_reports',
  // Added migration 0101 (tier server rework): per-profile quota rows.
  'profile_quota_usage',
  // Added migration 0072 (practice_activity_events, celebration_events): policies
  // existed since 0072 but were omitted from the manifest (S3-C2 fix).
  'practice_activity_events',
  'celebration_events',
  // Added migration 0112 (WI-676): RLS + profile_isolation policy for
  // mentor_activity_ledger. TS-side registration: WI-687.
  'mentor_activity_ledger',
  // Added migration 0110: feedback_retry_queue profile_isolation policy.
  // Exposed by WI-688 schema scanner (was absent from hand-maintained list).
  'feedback_retry_queue',
  // Added migration 0124 (review-continuity Flow 2 — recall log): RLS +
  // retrieval_events_profile_isolation policy anchored on profile_id. The
  // Drizzle schema omits .enableRLS() by repo convention (RLS DDL lives in the
  // migration SQL); the WI-688 schema scanner still derives it from profile_id.
  'retrieval_events',
  // Added migration 0125 (WI-1104): concepts_profile_isolation and
  // concept_mastery_profile_isolation policies. RLS was already ENABLED in
  // migrations 0107/0113; this migration adds the USING + WITH CHECK predicates
  // that were deferred pending CONCEPT_CAPTURE_ENABLED flip.
  'concepts',
  'concept_mastery',
] as const;

/**
 * Tables whose RLS USING clause references `owner_profile_id`.
 */
export const OWNER_SCOPED_TABLES: readonly string[] = [
  'withdrawal_archive_preferences',
  'pending_notices',
  // Added S3-C1 (manifest drift): policy created in migration 0066 but
  // omitted from this manifest. See drizzle/0066_enable_rls_pending_tables.sql.
  'family_preferences',
  // Added migration 0103: child_cap_notifications owner_profile_isolation policy.
  // Exposed by WI-688 schema scanner (was absent from hand-maintained list).
  'child_cap_notifications',
] as const;

/**
 * Tables whose RLS USING clause references `charge_person_id` (CUT-A —
 * MMT-ADR-0020 / §1.2a). The charge person is the isolation anchor; because
 * person.id = profiles.id by the deterministic reseed, the
 * app.current_profile_id GUC value carries over unchanged. consent_request's
 * `consent_request_charge_isolation` policy mirrors `consent_states_profile_isolation`.
 *
 * This explicit list is the post-cutover boundary for person-model RLS coverage:
 * a table joins this manifest only when its policy predicate is known.
 */
export const CHARGE_SCOPED_TABLES: readonly string[] = [
  'consent_request',
] as const;

/**
 * family_links uses OR across parent_profile_id and child_profile_id —
 * listed separately so callers can handle its special predicate.
 */
export const OR_SCOPED_TABLES: readonly string[] = ['family_links'] as const;

/**
 * Tables with RLS ENABLED but intentionally excluded from ALL_RLS_TABLES because
 * they do not yet have a USING policy. Adding them to ALL_RLS_TABLES would cause
 * the integration test to fail. Each entry must document the open tracking item.
 */
export const EXPLICITLY_EXCLUDED_TABLES: readonly string[] = [
  // RLS enabled in migration 0027 (notification_preferences, onboarding_drafts,
  // top_up_credits) / 0060 (usage_events) / 0080 (challenge_round_cooldowns).
  // No USING policy yet — every entry below needs a dedicated migration to
  // add `*_profile_isolation` (or equivalent) before it can move to ALL_RLS_TABLES.
  'notification_preferences',
  'onboarding_drafts',
  // Account/subscription-scoped. Migration 0101 adds nullable profile_id as
  // buyer attribution for per-profile top-ups, but Family/Pro shared-pool
  // top-ups intentionally remain subscription-wide.
  'top_up_credits',
  'usage_events',
  'challenge_round_cooldowns',
] as const;

/**
 * All tables that have an RLS policy as of migration 0085 (inclusive).
 * Covers policies from migrations 0027, 0029, 0058, 0066, 0071, 0072, 0085.
 * Note: family_preferences policy was created in 0066 (S3-C1 manifest drift).
 */
export const ALL_RLS_TABLES: readonly string[] = [
  ...PROFILE_SCOPED_TABLES,
  ...OWNER_SCOPED_TABLES,
  ...CHARGE_SCOPED_TABLES,
  ...OR_SCOPED_TABLES,
] as const;

/**
 * Per-table metadata for predicate-column assertions in tests.
 */
export const RLS_TABLE_META: Record<string, RlsTableMeta> = {
  ...Object.fromEntries(
    PROFILE_SCOPED_TABLES.map((t) => [
      t,
      {
        predicateColumn: 'profile_id' as const,
        policyType: 'standard' as const,
      },
    ]),
  ),
  ...Object.fromEntries(
    OWNER_SCOPED_TABLES.map((t) => [
      t,
      {
        predicateColumn: 'owner_profile_id' as const,
        policyType: 'standard' as const,
      },
    ]),
  ),
  ...Object.fromEntries(
    CHARGE_SCOPED_TABLES.map((t) => [
      t,
      {
        predicateColumn: 'charge_person_id' as const,
        policyType: 'standard' as const,
      },
    ]),
  ),
  family_links: {
    predicateColumn: 'or-fk-cols',
    policyType: 'or-both-fk-cols',
  },
};
