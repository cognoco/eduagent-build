export type DataExportInventoryEntry =
  | { disposition: 'included'; exportField: string; reason: string }
  | { disposition: 'excluded'; reason: string };

const included = (
  exportField: string,
  reason: string,
): DataExportInventoryEntry => ({
  disposition: 'included',
  exportField,
  reason,
});

const excluded = (reason: string): DataExportInventoryEntry => ({
  disposition: 'excluded',
  reason,
});

/**
 * Dated reconciliation: 2026-07-31.
 *
 * This is deliberately keyed by physical table name. The omission guard
 * compares it with the schema-derived profile-scoped table scanner, so a new
 * table cannot silently escape the Article 15/20 export review.
 */
export const PROFILE_SCOPED_EXPORT_INVENTORY: Record<
  string,
  DataExportInventoryEntry
> = {
  activation_events: excluded(
    'Internal activation telemetry; contains no learner-authored content and is retained as an operational audit record.',
  ),
  assessments: included('assessments', 'Learner assessment record.'),
  bookmarks: excluded(
    'Derived pointer to content already returned through session and note records; no independent content payload.',
  ),
  celebration_events: excluded(
    'Derived presentation event computed from exported progress and XP records.',
  ),
  challenge_round_cooldowns: excluded(
    'Short-lived scheduling control derived from challenge activity; no independent learner content.',
  ),
  child_cap_notifications: excluded(
    'Delivery record for a guardian notification; underlying quota and profile facts are separately disclosed.',
  ),
  coaching_card_cache: excluded(
    'Ephemeral cache of derived coaching output; canonical learning records are exported.',
  ),
  concept_mastery: included(
    'conceptMastery',
    'Concept status and verbatim learner quote are personal learning data.',
  ),
  concepts: included(
    'concepts',
    'Concept labels provide the meaning of concept-mastery rows.',
  ),
  curriculum_adaptations: excluded(
    'Derived curriculum-change instruction; the resulting curriculum and topics are exported.',
  ),
  dictation_results: excluded(
    'Derived practice result; source learning-session events and progress records are exported.',
  ),
  evidence_links: excluded(
    'Internal provenance pointers between records already represented in the export.',
  ),
  family_preferences: excluded(
    'Owner-interface preference, disclosed through the identity/account export rather than the learning-data payload.',
  ),
  feedback_retry_queue: excluded(
    'Transient delivery queue; canonical feedback/source records, not retry machinery, are the disclosure record.',
  ),
  learning_modes: included('learningModes', 'Learner presentation preference.'),
  learning_profiles: included(
    'learningProfiles',
    'Mentor-memory and learning-profile data.',
  ),
  learning_sessions: included(
    'learningSessions',
    'Canonical learning-session record.',
  ),
  memory_dedup_decisions: excluded(
    'Internal deduplication decision metadata; canonical mentor-memory facts are handled separately.',
  ),
  memory_facts: excluded(
    'Mentor-memory facts are disclosed through the learning-profile privacy surface; raw dedup storage is not duplicated.',
  ),
  mentor_activity_ledger: included(
    'mentorActivityLedger',
    'Profile-scoped mentor activity history.',
  ),
  mentor_notices: included(
    'mentorNotices',
    'Learner-specific concept notice and correction history.',
  ),
  milestones: excluded(
    'Derived achievement computed from exported progress and XP records.',
  ),
  monthly_reports: excluded(
    'Derived report presentation; source sessions, summaries, assessments, and progress rows are exported.',
  ),
  needs_deepening_topics: included(
    'needsDeepeningTopics',
    'Learner remediation status.',
  ),
  notification_log: excluded(
    'Operational delivery log; notification preferences are exported and message transport metadata is not portable content.',
  ),
  notification_preferences: included(
    'notificationPreferences',
    'Learner notification settings.',
  ),
  nudges: excluded(
    'Derived notification scheduling record; source progress and notification preferences are exported.',
  ),
  onboarding_drafts: excluded(
    'Transient incomplete onboarding state; completed profile and subject records are disclosed.',
  ),
  parking_lot_items: included(
    'parkingLotItems',
    'Learner-authored questions retained for later study.',
  ),
  pending_notices: excluded(
    'Transient delivery queue for notices represented by canonical notice or progress records.',
  ),
  practice_activity_events: excluded(
    'Derived practice telemetry; canonical session, assessment, mastery, and XP records are exported.',
  ),
  profile_quota_usage: excluded(
    'Derived billing counter disclosed through the account billing description, not the learning-data payload.',
  ),
  progress_snapshots: excluded(
    'Point-in-time derivative of exported progress, assessment, mastery, and activity records.',
  ),
  progress_summaries: excluded(
    'Derived summary presentation computed from exported source records.',
  ),
  quiz_mastery_items: excluded(
    'Derived quiz result represented by canonical assessment/mastery and session evidence.',
  ),
  quiz_missed_items: excluded(
    'Derived retry queue from quiz answers; canonical assessment and session evidence are exported.',
  ),
  quiz_rounds: excluded(
    'Derived practice grouping; underlying session and assessment records are exported.',
  ),
  retention_cards: included(
    'retentionCards',
    'Learner spaced-repetition state.',
  ),
  retrieval_events: excluded(
    'Internal retrieval telemetry; canonical source content and resulting session records are exported.',
  ),
  session_embeddings: included(
    'sessionEmbeddings',
    'Stored semantic-memory content and vector.',
  ),
  session_events: included(
    'sessionEvents',
    'Canonical learner and mentor exchange history.',
  ),
  session_summaries: included(
    'sessionSummaries',
    'Learner and mentor session-summary content.',
  ),
  speaking_practice_attempts: excluded(
    'Derived pronunciation score; source session evidence and progress records are exported.',
  ),
  streaks: included('streaks', 'Learner activity-streak record.'),
  subjects: included('subjects', 'Learner subject record.'),
  support_messages: excluded(
    'Support-case communications follow the support disclosure process and are not duplicated in the learning-data payload.',
  ),
  teaching_preferences: included(
    'teachingPreferences',
    'Learner teaching-method preference.',
  ),
  top_up_credits: included(
    'topUpCredits',
    'Profile-attributed billing credit disclosed by the identity-v2 export.',
  ),
  topic_notes: included(
    'topicNotes',
    'Learner-authored and mentor-derived topic note content.',
  ),
  usage_events: excluded(
    'Billing/metering event disclosed through account billing records and excluded from the learning-data payload.',
  ),
  vocabulary: excluded(
    'Language-practice derivative; source curriculum and learning-session records are exported.',
  ),
  vocabulary_retention_cards: excluded(
    'Derived spaced-repetition schedule for vocabulary represented in exported learning records.',
  ),
  weekly_reports: excluded(
    'Derived report presentation; source sessions, summaries, assessments, and progress rows are exported.',
  ),
  withdrawal_archive_preferences: excluded(
    'Owner-interface preference disclosed through the identity/account export rather than the learning-data payload.',
  ),
  xp_ledger: included('xpLedger', 'Canonical learner XP history.'),
};
