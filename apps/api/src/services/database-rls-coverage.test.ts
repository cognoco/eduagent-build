/**
 * Unit: database-rls-coverage
 *
 * Verifies that the RLS policy manifest (PROFILE_SCOPED_TABLES and
 * OWNER_SCOPED_TABLES) is complete and consistent. This test runs without a
 * database connection and guards against omission errors in the manifest
 * itself (e.g., a new table added to the schema file but not enrolled in the
 * coverage list).
 *
 * Policy predicate correctness (does the USING clause actually reference
 * profile_id?) is validated in database-rls-coverage.integration.test.ts
 * against a live Postgres instance.
 */

import {
  PROFILE_SCOPED_TABLES,
  OWNER_SCOPED_TABLES,
  OR_SCOPED_TABLES,
  ALL_RLS_TABLES,
  EXPLICITLY_EXCLUDED_TABLES,
  RLS_TABLE_META,
} from './database-rls-coverage';

describe('database-rls-coverage manifest', () => {
  it('ALL_RLS_TABLES is the union of profile-scoped, owner-scoped, and or-scoped', () => {
    const union = new Set([
      ...PROFILE_SCOPED_TABLES,
      ...OWNER_SCOPED_TABLES,
      ...OR_SCOPED_TABLES,
    ]);
    expect(ALL_RLS_TABLES).toEqual(expect.arrayContaining(Array.from(union)));
    expect(ALL_RLS_TABLES).toHaveLength(union.size);
  });

  it('PROFILE_SCOPED_TABLES and OWNER_SCOPED_TABLES are disjoint', () => {
    const profileSet = new Set(PROFILE_SCOPED_TABLES);
    const overlap = OWNER_SCOPED_TABLES.filter((t) => profileSet.has(t));
    expect(overlap).toHaveLength(0);
  });

  it('every ALL_RLS_TABLES entry has metadata in RLS_TABLE_META', () => {
    for (const table of ALL_RLS_TABLES) {
      expect(RLS_TABLE_META[table]).toBeDefined();
    }
  });

  it('metadata predicateColumn matches declared scoping', () => {
    for (const table of PROFILE_SCOPED_TABLES) {
      const meta = RLS_TABLE_META[table];
      expect(meta).toBeDefined();
      expect(meta!.predicateColumn).toBe('profile_id');
    }

    for (const table of OWNER_SCOPED_TABLES) {
      const meta = RLS_TABLE_META[table];
      expect(meta).toBeDefined();
      expect(meta!.predicateColumn).toBe('owner_profile_id');
    }
  });

  it('family_links metadata declares both columns in its predicate', () => {
    const meta = RLS_TABLE_META['family_links'];
    expect(meta).toBeDefined();
    // family_links uses an OR policy: parent_profile_id OR child_profile_id
    expect(meta!.policyType).toBe('or-both-fk-cols');
  });
});

/**
 * Omission guard (S3-M2 closeout)
 *
 * Every profile-scoped table known to exist in the schema must appear in either
 * ALL_RLS_TABLES (has a policy) or EXPLICITLY_EXCLUDED_TABLES (RLS enabled but
 * policy not yet added, with a documented tracking item).
 *
 * Update KNOWN_PROFILE_TABLES when adding new profile-scoped tables.
 * Verified against schema by Worker B 2026-05-21.
 */

// The full set of tables that carry personal profile data (profile_id or
// owner_profile_id foreign key to profiles). This list is the source of truth
// for the omission guard — any new table with a profileId/ownerProfileId FK
// must be added here AND to either ALL_RLS_TABLES or EXPLICITLY_EXCLUDED_TABLES.
const KNOWN_PROFILE_TABLES: readonly string[] = [
  // Profile-scoped (profile_id FK)
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
  'notification_preferences',
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
  'profile_quota_usage',
  'practice_activity_events',
  'celebration_events',
  'onboarding_drafts',
  // Profile-linked buyer attribution, but policy remains account/subscription-scoped.
  'top_up_credits',
  'challenge_round_cooldowns',
  'usage_events',
  // Added migration 0112 (WI-676/WI-687): mentor_activity_ledger profile-scoped.
  'mentor_activity_ledger',
  // Owner-scoped (owner_profile_id FK)
  'withdrawal_archive_preferences',
  'pending_notices',
  'family_preferences',
  // OR-scoped (parent_profile_id OR child_profile_id)
  'family_links',
] as const;

describe('database-rls-coverage omission guard (S3-M2)', () => {
  it('every known profile-scoped table appears in ALL_RLS_TABLES or EXPLICITLY_EXCLUDED_TABLES', () => {
    const covered = new Set([...ALL_RLS_TABLES, ...EXPLICITLY_EXCLUDED_TABLES]);
    const missing = KNOWN_PROFILE_TABLES.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('EXPLICITLY_EXCLUDED_TABLES entries are not in ALL_RLS_TABLES', () => {
    const allRlsSet = new Set(ALL_RLS_TABLES);
    const overlap = EXPLICITLY_EXCLUDED_TABLES.filter((t) => allRlsSet.has(t));
    expect(overlap).toHaveLength(0);
  });
});
