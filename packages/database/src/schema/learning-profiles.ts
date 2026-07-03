import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  integer,
  timestamp,
  text,
  index,
} from 'drizzle-orm/pg-core';
import { person } from './identity';
import { celebrationLevelEnum } from './progress';
import { generateUUIDv7 } from '../utils/uuid';

export const learningProfiles = pgTable(
  'learning_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' })
      .unique(),
    learningStyle: jsonb('learning_style'),
    interests: jsonb('interests').notNull().default([]),
    strengths: jsonb('strengths').notNull().default([]),
    struggles: jsonb('struggles').notNull().default([]),
    communicationNotes: jsonb('communication_notes').notNull().default([]),
    suppressedInferences: jsonb('suppressed_inferences').notNull().default([]),
    interestTimestamps: jsonb('interest_timestamps').notNull().default({}),
    effectivenessSessionCount: integer('effectiveness_session_count')
      .notNull()
      .default(0),
    memoryEnabled: boolean('memory_enabled').notNull().default(true),
    memoryConsentStatus: text('memory_consent_status', {
      enum: ['pending', 'granted', 'declined'],
    })
      .notNull()
      .default('pending'),
    consentPromptDismissedAt: timestamp('consent_prompt_dismissed_at', {
      withTimezone: true,
    }),
    memoryCollectionEnabled: boolean('memory_collection_enabled')
      .notNull()
      .default(false),
    memoryInjectionEnabled: boolean('memory_injection_enabled')
      .notNull()
      .default(true),
    accommodationMode: text('accommodation_mode', {
      enum: ['none', 'short-burst', 'audio-first', 'predictable'],
    })
      .notNull()
      .default('none'),
    celebrationLevel: celebrationLevelEnum('celebration_level')
      .notNull()
      .default('big_only'),
    recentlyResolvedTopics: jsonb('recently_resolved_topics')
      .notNull()
      .default([]),
    // [BUG-365] Two distinct markers — never collapse into a single column.
    //   memoryFactsBackfilledAt → set ONLY by the one-time backfill cron
    //     (apps/api/src/inngest/functions/memory-facts-backfill.ts).
    //   memoryFactsAnalysedAt   → set ONLY by the runtime applyAnalysis path
    //     (apps/api/src/services/memory/memory-facts.ts).
    // The "do we have facts populated?" semantic is "either is non-null"
    // (see hasMemoryFactsMarker in memory-facts.ts).
    memoryFactsBackfilledAt: timestamp('memory_facts_backfilled_at', {
      withTimezone: true,
    }),
    memoryFactsAnalysedAt: timestamp('memory_facts_analysed_at', {
      withTimezone: true,
    }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('learning_profiles_profile_id_idx').on(table.profileId)],
);
