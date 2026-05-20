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
 * Special tables (family_links): OR across both FK columns — see RLS_TABLE_META.
 */

export type RlsTableMeta = {
  /**
   * The column that the USING predicate is anchored to.
   * - 'profile_id'       for standard profile-scoped rows
   * - 'owner_profile_id' for owner-scoped tables (withdrawal_archive_preferences,
   *                      pending_notices, family_preferences)
   * - 'or-fk-cols'       used when metadata.policyType is 'or-both-fk-cols'
   *                      (family_links uses parent_profile_id OR child_profile_id)
   */
  predicateColumn: 'profile_id' | 'owner_profile_id' | 'or-fk-cols';
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
] as const;

/**
 * Tables whose RLS USING clause references `owner_profile_id`.
 */
export const OWNER_SCOPED_TABLES: readonly string[] = [
  'withdrawal_archive_preferences',
  'pending_notices',
] as const;

/**
 * family_links uses OR across parent_profile_id and child_profile_id —
 * listed separately so callers can handle its special predicate.
 */
export const OR_SCOPED_TABLES: readonly string[] = ['family_links'] as const;

/**
 * All tables that have an RLS policy as of migration 0085.
 * Note: family_preferences has a policy from migration 0066 and is included here.
 */
export const ALL_RLS_TABLES: readonly string[] = [
  ...PROFILE_SCOPED_TABLES,
  ...OWNER_SCOPED_TABLES,
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
  family_links: {
    predicateColumn: 'or-fk-cols',
    policyType: 'or-both-fk-cols',
  },
};
