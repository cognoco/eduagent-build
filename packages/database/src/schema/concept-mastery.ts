import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { person } from './identity';
import { learningSessions } from './sessions';
import { curriculumTopics, subjects } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

export const conceptMasteryStatusEnum = pgEnum('concept_mastery_status', [
  'solid',
  'partial',
  'missing',
  'misconception',
]);

export const concepts = pgTable(
  'concepts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    normalizedLabel: text('normalized_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('concepts_profile_topic_label_unique').on(
      table.profileId,
      table.topicId,
      table.normalizedLabel,
    ),
    index('concepts_profile_topic_idx').on(table.profileId, table.topicId),
    index('concepts_profile_id_idx').on(table.profileId),
  ],
);

export const conceptMastery = pgTable(
  'concept_mastery',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    status: conceptMasteryStatusEnum('status').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastEvaluatedAt: timestamp('last_evaluated_at', {
      withTimezone: true,
    }).notNull(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    sourceSessionId: uuid('source_session_id').references(
      () => learningSessions.id,
      { onDelete: 'set null' },
    ),
    learnerQuote: text('learner_quote'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('concept_mastery_concept_unique').on(table.conceptId),
    index('concept_mastery_profile_id_idx').on(table.profileId),
  ],
);
