# Plan: WI-1097 — Tighten 19 GDPR export-table schemas

## Goal
Replace 19 bare `dataExportRowSchema` aliases in `packages/schemas/src/account.ts`
with proper `z.object({...})` schemas matching their Drizzle table columns.

## Files Touched
- `packages/schemas/src/account.ts` — replace 19 aliases with `z.object` schemas
- `packages/schemas/src/account.test.ts` — add parse assertions for tightened schemas; update stale assertions

## Table → Source File → Field Map

| Schema export | Drizzle table | Source file |
|---|---|---|
| dataExportSubjectRowSchema | subjects | packages/database/src/schema/subjects.ts |
| dataExportCurriculumRowSchema | curricula | packages/database/src/schema/subjects.ts |
| dataExportCurriculumTopicRowSchema | curriculum_topics | packages/database/src/schema/subjects.ts |
| dataExportLearningSessionRowSchema | learning_sessions | packages/database/src/schema/sessions.ts |
| dataExportSessionEventRowSchema | session_events | packages/database/src/schema/sessions.ts |
| dataExportSessionSummaryRowSchema | session_summaries | packages/database/src/schema/sessions.ts |
| dataExportRetentionCardRowSchema | retention_cards | packages/database/src/schema/assessments.ts |
| dataExportXpLedgerRowSchema | xp_ledger | packages/database/src/schema/progress.ts |
| dataExportStreakRowSchema | streaks | packages/database/src/schema/progress.ts |
| dataExportNotificationPreferenceRowSchema | notification_preferences | packages/database/src/schema/progress.ts |
| dataExportLearningModeRowSchema | learning_modes | packages/database/src/schema/progress.ts |
| dataExportTeachingPreferenceRowSchema | teaching_preferences | packages/database/src/schema/assessments.ts |
| dataExportParkingLotItemRowSchema | parking_lot_items | packages/database/src/schema/sessions.ts |
| dataExportSessionEmbeddingRowSchema | session_embeddings | packages/database/src/schema/embeddings.ts |
| dataExportQuotaPoolRowSchema | quota_pools | packages/database/src/schema/billing.ts |
| dataExportTopUpCreditRowSchema | top_up_credits | packages/database/src/schema/billing.ts |
| dataExportNeedsDeepeningTopicRowSchema | needs_deepening_topics | packages/database/src/schema/assessments.ts |
| dataExportFamilyLinkRowSchema | family_links | packages/database/src/schema/profiles.ts |
| dataExportMentorActivityLedgerRowSchema | mentor_activity_ledger | packages/database/src/schema/activity-ledger.ts |

## Field details per table (drizzle column → zod type)

### subjects
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- name: text notNull → z.string()
- rawInput: text nullable → z.string().nullable()
- status: enum(active, paused, archived) notNull → z.enum([...])
- pedagogyMode: enum(socratic, four_strands) notNull → z.enum([...])
- languageCode: text nullable → z.string().nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField
- urgencyBoostUntil: timestamp nullable → isoDateField.nullable()
- urgencyBoostReason: text nullable → z.string().nullable()
- bookSuggestionsLastGenerationAttemptedAt: timestamp nullable → isoDateField.nullable()

### curricula
- id: uuid PK → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- version: integer notNull → z.number().int()
- generatedAt: timestamp notNull → isoDateField
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### curriculum_topics
- id: uuid PK → z.string().uuid()
- curriculumId: uuid notNull → z.string().uuid()
- title: text notNull → z.string()
- description: text notNull → z.string()
- sortOrder: integer notNull → z.number().int()
- relevance: enum(core, recommended, contemporary, emerging) notNull → z.enum([...])
- source: enum(generated, user, parent_bridge) notNull → z.enum([...])
- estimatedMinutes: integer notNull → z.number().int()
- bookId: uuid notNull → z.string().uuid()
- chapter: text nullable → z.string().nullable()
- skipped: boolean notNull → z.boolean()
- cefrLevel: text nullable → z.string().nullable()
- cefrSublevel: text nullable → z.string().nullable()
- targetWordCount: integer nullable → z.number().int().nullable()
- targetChunkCount: integer nullable → z.number().int().nullable()
- sourceChildProfileId: uuid nullable → z.string().uuid().nullable()
- filedFrom: enum(pre_generated, session_filing, freeform_filing) notNull → z.enum([...])
- sessionId: uuid nullable → z.string().uuid().nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### learning_sessions
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- topicId: uuid nullable → z.string().uuid().nullable()
- sessionType: enum(learning, homework, interleaved) notNull → z.enum([...])
- verificationType: text nullable → z.string().nullable()
- inputMode: text notNull → z.string()
- status: enum(active, paused, completed, auto_closed) notNull → z.enum([...])
- escalationRung: integer notNull → z.number().int()
- exchangeCount: integer notNull → z.number().int()
- startedAt: timestamp notNull → isoDateField
- lastActivityAt: timestamp notNull → isoDateField
- endedAt: timestamp nullable → isoDateField.nullable()
- durationSeconds: integer nullable → z.number().int().nullable()
- wallClockSeconds: integer nullable → z.number().int().nullable()
- metadata: jsonb nullable → z.record(z.string(), z.unknown()).nullable()
- rawInput: text nullable → z.string().nullable()
- filedAt: timestamp nullable → isoDateField.nullable()
- filingStatus: enum(filing_pending, filing_failed, filing_recovered, filing_kept_out) nullable → z.enum([...]).nullable()
- filingRetryCount: integer notNull → z.number().int()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### session_events
- id: uuid PK → z.string().uuid()
- sessionId: uuid notNull → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- topicId: uuid nullable → z.string().uuid().nullable()
- eventType: enum([18 values]) notNull → z.enum([...])
- content: text notNull → z.string()
- metadata: jsonb nullable → z.record(z.string(), z.unknown()).nullable()
- structuredAssessment: jsonb nullable → z.unknown().nullable()
- drillCorrect: integer nullable → z.number().int().nullable()
- drillTotal: integer nullable → z.number().int().nullable()
- clientId: text nullable → z.string().nullable()
- orphanReason: text nullable → z.string().nullable()
- createdAt: timestamp notNull → isoDateField

### session_summaries
- id: uuid PK → z.string().uuid()
- sessionId: uuid notNull → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- topicId: uuid nullable → z.string().uuid().nullable()
- content: text nullable → z.string().nullable()
- aiFeedback: text nullable → z.string().nullable()
- highlight: text nullable → z.string().nullable()
- narrative: text nullable → z.string().nullable()
- conversationPrompt: text nullable → z.string().nullable()
- engagementSignal: text nullable → z.string().nullable()
- closingLine: text nullable → z.string().nullable()
- learnerRecap: text nullable → z.string().nullable()
- nextTopicId: uuid nullable → z.string().uuid().nullable()
- nextTopicReason: text nullable → z.string().nullable()
- status: enum(pending, submitted, accepted, skipped, auto_closed) notNull → z.enum([...])
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField
- llmSummary: jsonb nullable → z.unknown().nullable() (complex LlmSummary type, use z.unknown())
- summaryGeneratedAt: timestamp nullable → isoDateField.nullable()
- purgedAt: timestamp nullable → isoDateField.nullable()

### retention_cards
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- topicId: uuid notNull → z.string().uuid()
- easeFactor: numeric(4,2) notNull → z.number() (numericAsNumber returns JS number)
- intervalDays: integer notNull → z.number().int()
- repetitions: integer notNull → z.number().int()
- lastReviewedAt: timestamp nullable → isoDateField.nullable()
- nextReviewAt: timestamp nullable → isoDateField.nullable()
- masteredAt: timestamp nullable → isoDateField.nullable()
- failureCount: integer notNull → z.number().int()
- consecutiveSuccesses: integer notNull → z.number().int()
- xpStatus: enum(pending, verified, decayed) notNull → z.enum([...])
- evaluateDifficultyRung: integer nullable → z.number().int().nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### xp_ledger
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- topicId: uuid notNull → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- amount: integer notNull → z.number().int()
- status: enum(pending, verified, decayed) notNull → z.enum([...])
- earnedAt: timestamp notNull → isoDateField
- verifiedAt: timestamp nullable → isoDateField.nullable()
- createdAt: timestamp notNull → isoDateField
- reflectionMultiplierApplied: boolean notNull → z.boolean()
- reflectionAppliedBySessionId: uuid nullable → z.string().uuid().nullable()

### streaks
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- currentStreak: integer notNull → z.number().int()
- longestStreak: integer notNull → z.number().int()
- lastActivityDate: TEXT nullable → z.string().nullable() (stored as 'YYYY-MM-DD' text, NOT timestamp)
- gracePeriodStartDate: TEXT nullable → z.string().nullable() (same)
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### notification_preferences
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- reviewReminders: boolean notNull → z.boolean()
- dailyReminders: boolean notNull → z.boolean()
- weeklyProgressPush: boolean notNull → z.boolean()
- weeklyProgressEmail: boolean notNull → z.boolean()
- monthlyProgressEmail: boolean notNull → z.boolean()
- pushEnabled: boolean notNull → z.boolean()
- maxDailyPush: integer notNull → z.number().int()
- expoPushToken: text nullable → z.string().nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### learning_modes
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- medianResponseSeconds: integer nullable → z.number().int().nullable()
- celebrationLevel: enum(all, big_only, off) notNull → z.enum([...])
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### teaching_preferences
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- method: enum(visual_diagrams, step_by_step, real_world_examples, practice_problems) notNull → z.enum([...])
- analogyDomain: enum(cooking, sports, building, music, nature, gaming) nullable → z.enum([...]).nullable()
- nativeLanguage: text nullable → z.string().nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### parking_lot_items
- id: uuid PK → z.string().uuid()
- sessionId: uuid notNull → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- topicId: uuid nullable → z.string().uuid().nullable()
- question: text notNull → z.string()
- explored: boolean notNull → z.boolean()
- createdAt: timestamp notNull → isoDateField

### session_embeddings
- id: uuid PK → z.string().uuid()
- sessionId: uuid notNull → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- topicId: uuid nullable → z.string().uuid().nullable()
- embedding: vector notNull → z.array(z.number()) (pgvector float array)
- content: text notNull → z.string()
- createdAt: timestamp notNull → isoDateField

### quota_pools
- id: uuid PK → z.string().uuid()
- subscriptionId: uuid notNull → z.string().uuid()
- monthlyLimit: integer notNull → z.number().int()
- usedThisMonth: integer notNull → z.number().int()
- dailyLimit: integer nullable → z.number().int().nullable()
- usedToday: integer notNull → z.number().int()
- cycleResetAt: timestamp notNull → isoDateField
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### top_up_credits
- id: uuid PK → z.string().uuid()
- subscriptionId: uuid notNull → z.string().uuid()
- profileId: uuid nullable → z.string().uuid().nullable()
- amount: integer notNull → z.number().int()
- remaining: integer notNull → z.number().int()
- purchasedAt: timestamp notNull → isoDateField
- expiresAt: timestamp notNull → isoDateField
- revenuecatTransactionId: text nullable → z.string().nullable()
- createdAt: timestamp notNull → isoDateField

### needs_deepening_topics
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- subjectId: uuid notNull → z.string().uuid()
- topicId: uuid notNull → z.string().uuid()
- status: enum(active, pending_review, resolved) notNull → z.enum([...])
- consecutiveSuccessCount: integer notNull → z.number().int()
- source: text notNull → z.string()
- concept: text nullable → z.string().nullable()
- misconception: text nullable → z.string().nullable()
- correction: text nullable → z.string().nullable()
- pendingExpiresAt: timestamp nullable → isoDateField.nullable()
- createdAt: timestamp notNull → isoDateField
- updatedAt: timestamp notNull → isoDateField

### family_links
- id: uuid PK → z.string().uuid()
- parentProfileId: uuid notNull → z.string().uuid()
- childProfileId: uuid notNull → z.string().uuid()
- createdAt: timestamp notNull → isoDateField

### mentor_activity_ledger
- id: uuid PK → z.string().uuid()
- profileId: uuid notNull → z.string().uuid()
- actorJob: text notNull → z.string()
- kind: text notNull → z.string()
- templateKey: text notNull → z.string()
- params: jsonb notNull default {} → z.record(z.string(), z.unknown())
- visibility: enum(self, supporter, both) notNull → z.enum([...])
- createdAt: timestamp notNull → isoDateField
- surfacedAt: timestamp nullable → isoDateField.nullable()

## Notes on None-Left-as-Alias
All 19 tables can be fully typed. No tables are left as aliases.
(sessionEmbeddings embedding column is typed as z.array(z.number()) per pgvector convention.)

## Test Strategy
TDD: extend account.test.ts with parse assertions BEFORE implementing.
- For each schema: valid minimal row parses; wrong-typed field is rejected.
- Representative coverage: subjects, learningSessions, retentionCards, familyLinks,
  mentorActivityLedger (5 schemas → 10 assertions).
- Update stale BUG-206 "deferred aliases" test: remove `dataExportSubjectRowSchema === dataExportRowSchema` assertion; add assertions that all 19 are now distinct.
- Update test at line 161-194 that uses bare `subjects`/`quotaPools` rows with wrong shape.
