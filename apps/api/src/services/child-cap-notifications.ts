import { and, eq, isNull } from 'drizzle-orm';
import { childCapNotifications, type Database } from '@eduagent/database';

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
