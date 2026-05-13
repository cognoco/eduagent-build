import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { generateUUIDv7 } from '../utils/uuid';
import { profiles } from './profiles';
import { curriculumBooks, subjects } from './subjects';

export const progressSnapshots = pgTable(
  'progress_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    metrics: jsonb('metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('progress_snapshots_profile_date_uq').on(
      table.profileId,
      table.snapshotDate,
    ),
    index('progress_snapshots_profile_date_idx').on(
      table.profileId,
      table.snapshotDate,
    ),
  ],
);

export const progressSummaries = pgTable(
  'progress_summaries',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    basedOnLastSessionAt: timestamp('based_on_last_session_at', {
      withTimezone: true,
    }),
    // Informational only; scoped queries and activity-state logic use profileId.
    latestSessionId: uuid('latest_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('progress_summaries_profile_uq').on(table.profileId)],
);

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    milestoneType: text('milestone_type').notNull(),
    threshold: integer('threshold').notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'cascade',
    }),
    bookId: uuid('book_id').references(() => curriculumBooks.id, {
      onDelete: 'cascade',
    }),
    metadata: jsonb('metadata'),
    celebratedAt: timestamp('celebrated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('milestones_scope_uq').on(
      table.profileId,
      table.milestoneType,
      table.threshold,
      sql`coalesce(${table.subjectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${table.bookId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index('milestones_profile_created_idx').on(
      table.profileId,
      table.createdAt,
    ),
  ],
);

// [BUG-524] Weekly reports — mirrors monthlyReports, keyed by report_week
// (Monday start date) instead of report_month.
export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reportWeek: date('report_week').notNull(),
    reportData: jsonb('report_data').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('weekly_reports_parent_child_week_uq').on(
      table.profileId,
      table.childProfileId,
      table.reportWeek,
    ),
    index('weekly_reports_child_week_idx').on(
      table.childProfileId,
      table.reportWeek,
    ),
  ],
);

export const monthlyReports = pgTable(
  'monthly_reports',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reportMonth: date('report_month').notNull(),
    reportData: jsonb('report_data').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('monthly_reports_parent_child_month_uq').on(
      table.profileId,
      table.childProfileId,
      table.reportMonth,
    ),
    index('monthly_reports_child_month_idx').on(
      table.childProfileId,
      table.reportMonth,
    ),
  ],
);
