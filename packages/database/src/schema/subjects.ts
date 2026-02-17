import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles.js';
import { generateUUIDv7 } from '../utils/uuid.js';

export const subjectStatusEnum = pgEnum('subject_status', [
  'active',
  'paused',
  'archived',
]);

export const topicRelevanceEnum = pgEnum('topic_relevance', [
  'core',
  'recommended',
  'contemporary',
  'emerging',
]);

export const subjects = pgTable('subjects', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: subjectStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const curricula = pgTable('curricula', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  generatedAt: timestamp('generated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const curriculumTopics = pgTable('curriculum_topics', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  curriculumId: uuid('curriculum_id')
    .notNull()
    .references(() => curricula.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull(),
  relevance: topicRelevanceEnum('relevance').notNull().default('core'),
  estimatedMinutes: integer('estimated_minutes').notNull(),
  skipped: boolean('skipped').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const curriculumAdaptations = pgTable('curriculum_adaptations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => generateUUIDv7()),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  skipReason: text('skip_reason'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
