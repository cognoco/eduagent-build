// ---------------------------------------------------------------------------
// CUT-B3 (WI-693) — child-cap notifications v2
//
// v2 twins of the child-cap-notifications.ts functions that read legacy identity
// tables. The owner/child resolution re-points from `profiles` (by account_id,
// is_owner) onto person × membership of the subscription's organization;
// listActiveChildCapNotificationsV2 joins `person` for the child display name
// instead of `profiles`. The `child_cap_notifications` satellite writes/reads are
// unchanged (keyed on ownerProfileId/childProfileId = person.id by the reseed).
//
// Flag-gated: dispatched by routes/notifications.ts and the
// notify-parent-child-cap-hit Inngest function. Legacy
// child-cap-notifications.ts stays byte-identical.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  childCapNotifications,
  person,
  membership,
  subscription as subscriptionTable,
  type Database,
} from '@eduagent/database';
import {
  childCapNotificationSchema,
  type ChildCapNotification,
  type ChildCapNotificationKind,
} from '@eduagent/schemas';
import { findOwnerPersonId } from '../../identity-v2/helpers';

type RecordChildCapNotificationInput = {
  childProfileId: string;
  kind: ChildCapNotificationKind;
  resetsAt: string;
  occurredAt: string;
};

type RecordChildCapNotificationResult = {
  inserted: boolean;
  reason?: 'owner_not_found' | 'child_not_in_subscription_account';
};

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toDateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function mapNotificationRow(row: {
  id: string;
  ownerProfileId: string;
  childProfileId: string;
  childDisplayName: string;
  kind: ChildCapNotificationKind;
  occurredOn: Date | string;
  resetsAt: Date | string;
  createdAt: Date | string;
}): ChildCapNotification {
  return childCapNotificationSchema.parse({
    id: row.id,
    ownerProfileId: row.ownerProfileId,
    childProfileId: row.childProfileId,
    childDisplayName: row.childDisplayName,
    kind: row.kind,
    occurredOn: toDateOnly(row.occurredOn),
    resetsAt: toIsoString(row.resetsAt),
    createdAt: toIsoString(row.createdAt),
  });
}

/** v2: owner person of a subscription's organization (membership admin role). */
async function findOwnerPersonIdBySubscription(
  db: Database,
  subscriptionId: string,
): Promise<string | null> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { organizationId: true },
  });
  if (!sub) return null;
  return findOwnerPersonId(db, sub.organizationId);
}

/** v2: whether a person is a member of the subscription's organization. */
async function childBelongsToSubscriptionOrg(
  db: Database,
  subscriptionId: string,
  childProfileId: string,
): Promise<boolean> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscriptionTable.id, subscriptionId),
    columns: { organizationId: true },
  });
  if (!sub) return false;

  const [row] = await db
    .select({ id: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, sub.organizationId),
        eq(person.id, childProfileId),
      ),
    )
    .limit(1);
  return row != null;
}

async function insertChildCapNotification(
  db: Database,
  ownerProfileId: string,
  input: RecordChildCapNotificationInput,
): Promise<RecordChildCapNotificationResult> {
  const rows = await db
    .insert(childCapNotifications)
    .values({
      ownerProfileId,
      childProfileId: input.childProfileId,
      kind: input.kind,
      occurredOn: toDateOnly(input.occurredAt),
      resetsAt: new Date(input.resetsAt),
    })
    .onConflictDoNothing({
      target: [
        childCapNotifications.ownerProfileId,
        childCapNotifications.childProfileId,
        childCapNotifications.kind,
        childCapNotifications.occurredOn,
      ],
    })
    .returning({ id: childCapNotifications.id });

  return { inserted: rows.length > 0 };
}

/**
 * v2 of listActiveChildCapNotifications. Joins `person` for the child display
 * name instead of `profiles`.
 */
export async function listActiveChildCapNotificationsV2(
  db: Database,
  ownerProfileId: string,
): Promise<ChildCapNotification[]> {
  const rows = await db
    .select({
      id: childCapNotifications.id,
      ownerProfileId: childCapNotifications.ownerProfileId,
      childProfileId: childCapNotifications.childProfileId,
      childDisplayName: person.displayName,
      kind: childCapNotifications.kind,
      occurredOn: childCapNotifications.occurredOn,
      resetsAt: childCapNotifications.resetsAt,
      createdAt: childCapNotifications.createdAt,
    })
    .from(childCapNotifications)
    .innerJoin(person, eq(person.id, childCapNotifications.childProfileId))
    .where(
      and(
        eq(childCapNotifications.ownerProfileId, ownerProfileId),
        isNull(childCapNotifications.dismissedAt),
      ),
    )
    .orderBy(desc(childCapNotifications.createdAt));

  return rows.map(mapNotificationRow);
}

export async function recordChildCapNotificationForSubscriptionV2(
  db: Database,
  input: RecordChildCapNotificationInput & { subscriptionId: string },
): Promise<RecordChildCapNotificationResult> {
  const ownerProfileId = await findOwnerPersonIdBySubscription(
    db,
    input.subscriptionId,
  );
  if (!ownerProfileId) return { inserted: false, reason: 'owner_not_found' };
  if (
    !(await childBelongsToSubscriptionOrg(
      db,
      input.subscriptionId,
      input.childProfileId,
    ))
  ) {
    return { inserted: false, reason: 'child_not_in_subscription_account' };
  }

  return insertChildCapNotification(db, ownerProfileId, input);
}

export async function recordChildCapNotificationForAccountV2(
  db: Database,
  input: RecordChildCapNotificationInput & { accountId: string },
): Promise<RecordChildCapNotificationResult> {
  // accountId = organization.id under the flag.
  const ownerProfileId = await findOwnerPersonId(db, input.accountId);
  if (!ownerProfileId) return { inserted: false, reason: 'owner_not_found' };

  return insertChildCapNotification(db, ownerProfileId, input);
}
