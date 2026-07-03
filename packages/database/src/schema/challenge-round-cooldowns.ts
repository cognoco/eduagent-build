import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  timestamp,
  integer,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { person } from './identity';
import { curriculumTopics } from './subjects';
import { generateUUIDv7 } from '../utils/uuid';

/**
 * Challenge Round cross-session decline cooldown — one row per
 * `(profile_id, topic_id)`. Written when a learner declines an offered round
 * or completes one; read by the trigger evaluator to suppress repeat offers
 * within 24h of a decline. Acceptances/completions update the row but do not
 * gate subsequent offers (those use in-session state instead).
 *
 * `last_outcome` encoding (kept narrow on purpose — analytics live in
 * `ai_response.metadata` and Inngest events, not here):
 *   0 = declined          → 24h cooldown enforced by trigger
 *   1 = accepted_partial  → no cross-session cooldown
 *   2 = verified          → no cross-session cooldown
 *   3 = reteach           → no cross-session cooldown
 *
 * Both FKs cascade on delete (MED-2 from the Challenge Round plan): profile
 * delete wipes cooldown rows (correct under GDPR export-delete), and a
 * regenerated curriculum topic gets a fresh cooldown automatically.
 */
export const challengeRoundCooldowns = pgTable(
  'challenge_round_cooldowns',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    lastOfferedAt: timestamp('last_offered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastOutcome: integer('last_outcome'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('challenge_round_cooldowns_profile_topic_unique').on(
      table.profileId,
      table.topicId,
    ),
    check(
      'challenge_round_cooldowns_last_outcome_range',
      sql`${table.lastOutcome} IS NULL OR (${table.lastOutcome} >= 0 AND ${table.lastOutcome} <= 3)`,
    ),
  ],
).enableRLS();
