# GDPR export ↔ profile-scoped schema reconciliation

**Date:** 2026-07-31  
**Scope:** Direct profile-like ownership columns detected by
`getProfileScopedTables()` in `packages/database/src/profile-scoped-tables.ts`.

This is the human-readable two-way reconciliation for WI-2738. The executable
counterpart is `apps/api/src/services/data-export-inventory.ts`; its guard test
fails when the schema gains or loses a profile-scoped table without a matching
inventory decision, or when an included row names a payload field that does not
exist.

## Included in the export

| Physical table | Export field | Reason |
|---|---|---|
| `assessments` | `assessments` | Learner assessment record |
| `concept_mastery` | `conceptMastery` | Concept status and retained learner quote |
| `concepts` | `concepts` | Labels that make mastery rows intelligible |
| `learning_modes` | `learningModes` | Learner presentation preference |
| `learning_profiles` | `learningProfiles` | Mentor-memory and learning-profile data |
| `learning_sessions` | `learningSessions` | Canonical learning-session record |
| `mentor_activity_ledger` | `mentorActivityLedger` | Profile-scoped mentor activity history |
| `mentor_notices` | `mentorNotices` | Concept notice and correction history |
| `needs_deepening_topics` | `needsDeepeningTopics` | Learner remediation status |
| `notification_preferences` | `notificationPreferences` | Notification settings |
| `parking_lot_items` | `parkingLotItems` | Learner-authored saved questions |
| `retention_cards` | `retentionCards` | Spaced-repetition state |
| `session_embeddings` | `sessionEmbeddings` | Semantic-memory content and vector |
| `session_events` | `sessionEvents` | Learner and mentor exchange history |
| `session_summaries` | `sessionSummaries` | Learner and mentor summary content |
| `streaks` | `streaks` | Activity-streak record |
| `subjects` | `subjects` | Learner subject record |
| `teaching_preferences` | `teachingPreferences` | Teaching-method preference |
| `top_up_credits` | `topUpCredits` | Profile-attributed billing credit |
| `topic_notes` | `topicNotes` | Learner-authored and mentor-derived notes |
| `xp_ledger` | `xpLedger` | Canonical XP history |

Curricula and curriculum topics are also included in the payload through their
subject ownership chain; they do not appear in the direct-column list above.
Identity, consent, family, subscription, and quota-pool sections are assembled
by the identity-v2 export layer.

## Explicit exclusions

| Physical table | Exclusion rationale |
|---|---|
| `activation_events` | Internal activation telemetry; no learner-authored content |
| `bookmarks` | Pointer to content already represented by exported source records |
| `celebration_events` | Presentation event derived from progress and XP |
| `challenge_round_cooldowns` | Short-lived scheduling control |
| `child_cap_notifications` | Delivery record derived from quota/profile facts |
| `coaching_card_cache` | Ephemeral cache of derived coaching output |
| `curriculum_adaptations` | Change instruction; resulting curriculum is exported |
| `dictation_results` | Derived practice result represented by source learning records |
| `evidence_links` | Internal provenance pointers between represented records |
| `family_preferences` | Account-interface preference handled by identity/account disclosure |
| `feedback_retry_queue` | Transient delivery machinery |
| `memory_dedup_decisions` | Internal deduplication metadata |
| `memory_facts` | Disclosed through the learning-profile privacy surface rather than duplicated raw |
| `milestones` | Achievement derived from progress and XP |
| `monthly_reports` | Presentation derived from exported source records |
| `notification_log` | Operational delivery log |
| `nudges` | Scheduling record derived from progress and preferences |
| `onboarding_drafts` | Transient incomplete onboarding state |
| `pending_notices` | Transient delivery queue |
| `practice_activity_events` | Practice telemetry derived into canonical progress records |
| `profile_quota_usage` | Billing counter handled by account billing disclosure |
| `progress_snapshots` | Point-in-time derivative of canonical progress records |
| `progress_summaries` | Summary presentation derived from source records |
| `quiz_mastery_items` | Quiz derivative represented by assessment/mastery evidence |
| `quiz_missed_items` | Retry derivative represented by assessment/session evidence |
| `quiz_rounds` | Practice grouping represented by session/assessment records |
| `retrieval_events` | Internal retrieval telemetry |
| `speaking_practice_attempts` | Derived pronunciation score represented in learning progress |
| `support_messages` | Disclosed through the separate support-request process |
| `usage_events` | Metering event handled by account billing disclosure |
| `vocabulary` | Language-practice derivative represented by curriculum/session records |
| `vocabulary_retention_cards` | Derived vocabulary review schedule |
| `weekly_reports` | Presentation derived from exported source records |
| `withdrawal_archive_preferences` | Account-interface preference handled by identity/account disclosure |

## Field-complete synthetic verification

`apps/api/src/services/export.test.ts` seeds complete synthetic rows for
`concepts`, `concept_mastery`, `topic_notes`, and `mentor_notices` and compares
each returned object with the full serialized source row. No production or
staging personal data is used.
