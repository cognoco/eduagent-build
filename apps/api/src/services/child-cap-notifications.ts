import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  childCapNotifications,
  profiles,
  subscriptions,
  type Database,
} from '@eduagent/database';
import {
  childCapNotificationSchema,
  type ChildCapNotification,
  type ChildCapNotificationKind,
} from '@eduagent/schemas';

type RecordChildCapNotificationInput = {
  childProfileId: string;
  kind: ChildCapNotificationKind;
  resetsAt: string;
  occurredAt: string;
};

type RecordChildCapNotificationResult = {
  inserted: boolean;
  reason?: 'owner_not_found';
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

async function findOwnerProfileIdBySubscription(
  db: Database,
  subscriptionId: string,
): Promise<string | null> {
  const [owner] = await db
    .select({ id: profiles.id })
    .from(subscriptions)
    .innerJoin(profiles, eq(profiles.accountId, subscriptions.accountId))
    .where(
      and(eq(subscriptions.id, subscriptionId), eq(profiles.isOwner, true)),
    )
    .limit(1);

  return owner?.id ?? null;
}

async function findOwnerProfileIdByAccount(
  db: Database,
  accountId: string,
): Promise<string | null> {
  const [owner] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.accountId, accountId), eq(profiles.isOwner, true)))
    .limit(1);

  return owner?.id ?? null;
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

export async function listActiveChildCapNotifications(
  db: Database,
  ownerProfileId: string,
): Promise<ChildCapNotification[]> {
  const rows = await db
    .select({
      id: childCapNotifications.id,
      ownerProfileId: childCapNotifications.ownerProfileId,
      childProfileId: childCapNotifications.childProfileId,
      childDisplayName: profiles.displayName,
      kind: childCapNotifications.kind,
      occurredOn: childCapNotifications.occurredOn,
      resetsAt: childCapNotifications.resetsAt,
      createdAt: childCapNotifications.createdAt,
    })
    .from(childCapNotifications)
    .innerJoin(profiles, eq(profiles.id, childCapNotifications.childProfileId))
    .where(
      and(
        eq(childCapNotifications.ownerProfileId, ownerProfileId),
        isNull(childCapNotifications.dismissedAt),
      ),
    )
    .orderBy(desc(childCapNotifications.createdAt));

  return rows.map(mapNotificationRow);
}

export async function dismissChildCapNotification(
  db: Database,
  ownerProfileId: string,
  notificationId: string,
): Promise<boolean> {
  const [existing] = await db
    .select({
      id: childCapNotifications.id,
      dismissedAt: childCapNotifications.dismissedAt,
    })
    .from(childCapNotifications)
    .where(
      and(
        eq(childCapNotifications.id, notificationId),
        eq(childCapNotifications.ownerProfileId, ownerProfileId),
      ),
    )
    .limit(1);

  if (!existing) return false;
  if (existing.dismissedAt) return true;

  await db
    .update(childCapNotifications)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(childCapNotifications.id, notificationId),
        eq(childCapNotifications.ownerProfileId, ownerProfileId),
        isNull(childCapNotifications.dismissedAt),
      ),
    );

  return true;
}

export async function recordChildCapNotificationForSubscription(
  db: Database,
  input: RecordChildCapNotificationInput & { subscriptionId: string },
): Promise<RecordChildCapNotificationResult> {
  const ownerProfileId = await findOwnerProfileIdBySubscription(
    db,
    input.subscriptionId,
  );
  if (!ownerProfileId) return { inserted: false, reason: 'owner_not_found' };

  return insertChildCapNotification(db, ownerProfileId, input);
}

export async function recordChildCapNotificationForAccount(
  db: Database,
  input: RecordChildCapNotificationInput & { accountId: string },
): Promise<RecordChildCapNotificationResult> {
  const ownerProfileId = await findOwnerProfileIdByAccount(db, input.accountId);
  if (!ownerProfileId) return { inserted: false, reason: 'owner_not_found' };

  return insertChildCapNotification(db, ownerProfileId, input);
}
