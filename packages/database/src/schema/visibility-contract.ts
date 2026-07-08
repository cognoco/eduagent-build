import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import { person, supportership } from './identity';

export const supportVisibilityContracts = pgTable(
  'support_visibility_contracts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    supportershipId: uuid('supportership_id')
      .notNull()
      .references(() => supportership.id, { onDelete: 'cascade' }),
    supporterPersonId: uuid('supporter_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    supporteePersonId: uuid('supportee_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'restrict' }),
    relation: text('relation').notNull(),
    status: text('status').notNull().default('pending'),
    contractVersion: integer('contract_version').notNull().default(1),
    reportableKinds: text('reportable_kinds').array().notNull(),
    artifactWall: boolean('artifact_wall').notNull().default(true),
    renderEquivalence: boolean('render_equivalence').notNull().default(true),
    safetyException: boolean('safety_exception').notNull().default(true),
    supporterAcceptedAt: timestamp('supporter_accepted_at', {
      withTimezone: true,
    }),
    supporteeAcceptedAt: timestamp('supportee_accepted_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('support_visibility_contracts_supportership_active_unique')
      .on(table.supportershipId)
      .where(sql`${table.status} IN ('pending','accepted','restamped')`),
    index('support_visibility_contracts_supporter_idx').on(
      table.supporterPersonId,
    ),
    index('support_visibility_contracts_supportee_idx').on(
      table.supporteePersonId,
    ),
    check(
      'support_visibility_contracts_relation_check',
      sql`${table.relation} IN ('parent','sibling','teacher','other')`,
    ),
    check(
      'support_visibility_contracts_status_check',
      sql`${table.status} IN ('pending','accepted','revoked','restamped','lapsed')`,
    ),
    check(
      'support_visibility_contracts_kinds_check',
      sql`${table.reportableKinds} <@ ARRAY['mastery','effort','observable_engagement']::text[] AND cardinality(${table.reportableKinds}) >= 1`,
    ),
    check(
      'support_visibility_contracts_trust_invariants_check',
      sql`${table.artifactWall} = true AND ${table.renderEquivalence} = true AND ${table.safetyException} = true`,
    ),
  ],
);

export const supportVisibilityAuditEvents = pgTable(
  'support_visibility_audit_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    supportershipId: uuid('supportership_id')
      .notNull()
      .references(() => supportership.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(
      () => supportVisibilityContracts.id,
      { onDelete: 'set null' },
    ),
    actorPersonId: uuid('actor_person_id').references(() => person.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('support_visibility_audit_events_supportership_created_idx').on(
      table.supportershipId,
      table.createdAt,
    ),
    index('support_visibility_audit_events_actor_idx').on(table.actorPersonId),
    check(
      'support_visibility_audit_events_type_check',
      sql`${table.eventType} IN ('contract_initiated','contract_accepted','appeal_requested','supportership_revoked','graduation_restamped')`,
    ),
  ],
);

export const supportVisibilityNotices = pgTable(
  'support_visibility_notices',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => generateUUIDv7()),
    supportershipId: uuid('supportership_id')
      .notNull()
      .references(() => supportership.id, { onDelete: 'cascade' }),
    contractId: uuid('contract_id').references(
      () => supportVisibilityContracts.id,
      { onDelete: 'set null' },
    ),
    noticeType: text('notice_type').notNull(),
    targetAudience: text('target_audience').notNull(),
    targetPersonId: uuid('target_person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex(
      'support_visibility_notices_supportership_type_target_payload_uq',
    ).on(
      table.supportershipId,
      table.noticeType,
      table.targetAudience,
      table.targetPersonId,
      table.payload,
    ),
    index('support_visibility_notices_target_created_idx').on(
      table.targetPersonId,
      table.createdAt,
    ),
    index('support_visibility_notices_supportership_idx').on(
      table.supportershipId,
    ),
    check(
      'support_visibility_notices_type_check',
      sql`${table.noticeType} IN ('support_link_ended','graduation_contract_restamped')`,
    ),
    check(
      'support_visibility_notices_audience_check',
      sql`${table.targetAudience} IN ('supporter','supportee')`,
    ),
  ],
);

export type SupportVisibilityContract =
  typeof supportVisibilityContracts.$inferSelect;
export type NewSupportVisibilityContract =
  typeof supportVisibilityContracts.$inferInsert;
export type SupportVisibilityAuditEvent =
  typeof supportVisibilityAuditEvents.$inferSelect;
export type NewSupportVisibilityAuditEvent =
  typeof supportVisibilityAuditEvents.$inferInsert;
export type SupportVisibilityNotice =
  typeof supportVisibilityNotices.$inferSelect;
export type NewSupportVisibilityNotice =
  typeof supportVisibilityNotices.$inferInsert;
