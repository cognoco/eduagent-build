import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { generateUUIDv7 } from '../utils/uuid';
import { person, supportership } from './identity';
import { curriculumTopics, subjects } from './subjects';

export const supporterFeedSurfaceState = pgTable(
  'supporter_feed_surface_state',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    viewerPersonId: uuid('viewer_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    scopeKind: text('scope_kind').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceKey: text('source_key').notNull(),
    supportershipId: uuid('supportership_id').references(
      () => supportership.id,
      { onDelete: 'cascade' },
    ),
    targetPersonId: uuid('target_person_id').references(() => person.id, {
      onDelete: 'cascade',
    }),
    surfaceCount: integer('surface_count').notNull().default(0),
    surfacedAt: timestamp('surfaced_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('supporter_feed_surface_state_source_unique').on(
      table.viewerPersonId,
      table.scopeKind,
      table.sourceKey,
    ),
    index('supporter_feed_surface_state_supportership_idx').on(
      table.supportershipId,
    ),
    index('supporter_feed_surface_state_target_person_idx').on(
      table.targetPersonId,
    ),
    check(
      'supporter_feed_surface_state_scope_kind_check',
      sql`${table.scopeKind} IN ('supporter-hub','person')`,
    ),
    check(
      'supporter_feed_surface_state_surface_count_check',
      sql`${table.surfaceCount} >= 0`,
    ),
  ],
);

export const supporterEncouragementChips = pgTable(
  'supporter_encouragement_chips',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    supportershipId: uuid('supportership_id')
      .notNull()
      .references(() => supportership.id, { onDelete: 'cascade' }),
    supporterPersonId: uuid('supporter_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    supporteePersonId: uuid('supportee_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    suggestedText: text('suggested_text').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    topicId: uuid('topic_id').references(() => curriculumTopics.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    index('supporter_encouragement_chips_supportee_created_idx').on(
      table.supporteePersonId,
      table.createdAt,
    ),
    index('supporter_encouragement_chips_supporter_supportee_created_idx').on(
      table.supporterPersonId,
      table.supporteePersonId,
      table.createdAt,
    ),
    index('supporter_encouragement_chips_supportership_idx').on(
      table.supportershipId,
    ),
    check(
      'supporter_encouragement_chips_source_check',
      sql`${table.source} IN ('kickstart','co_learning_payoff')`,
    ),
    check(
      'supporter_encouragement_chips_text_not_blank',
      sql`length(trim(${table.suggestedText})) > 0`,
    ),
  ],
);

export type SupporterFeedSurfaceState =
  typeof supporterFeedSurfaceState.$inferSelect;
export type NewSupporterFeedSurfaceState =
  typeof supporterFeedSurfaceState.$inferInsert;
export type SupporterEncouragementChip =
  typeof supporterEncouragementChips.$inferSelect;
export type NewSupporterEncouragementChip =
  typeof supporterEncouragementChips.$inferInsert;
