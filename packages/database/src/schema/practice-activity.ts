import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';
import { subjects } from './subjects';

export const practiceActivityTypeEnum = pgEnum('practice_activity_type', [
  'quiz',
  'review',
  'assessment',
  'dictation',
  'recitation',
  'fluency_drill',
]);

export const practiceActivityEvents = pgTable(
  'practice_activity_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    activityType: practiceActivityTypeEnum('activity_type').notNull(),
    activitySubtype: text('activity_subtype'),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    pointsEarned: integer('points_earned').notNull().default(0),
    score: integer('score'),
    total: integer('total'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('practice_activity_events_profile_dedupe_uq').on(
      table.profileId,
      table.dedupeKey,
    ),
    index('practice_activity_events_profile_completed_idx').on(
      table.profileId,
      table.completedAt,
    ),
    index('practice_activity_events_profile_type_completed_idx').on(
      table.profileId,
      table.activityType,
      table.completedAt,
    ),
    index('practice_activity_events_profile_subject_completed_idx').on(
      table.profileId,
      table.subjectId,
      table.completedAt,
    ),
  ],
);

export const celebrationEvents = pgTable(
  'celebration_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    celebratedAt: timestamp('celebrated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    celebrationType: text('celebration_type').notNull(),
    reason: text('reason').notNull(),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    dedupeKey: text('dedupe_key').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('celebration_events_profile_dedupe_uq').on(
      table.profileId,
      table.dedupeKey,
    ),
    index('celebration_events_profile_celebrated_idx').on(
      table.profileId,
      table.celebratedAt,
    ),
  ],
);

export type PracticeActivityEvent = typeof practiceActivityEvents.$inferSelect;
export type NewPracticeActivityEvent =
  typeof practiceActivityEvents.$inferInsert;
export type CelebrationEvent = typeof celebrationEvents.$inferSelect;
export type NewCelebrationEvent = typeof celebrationEvents.$inferInsert;
