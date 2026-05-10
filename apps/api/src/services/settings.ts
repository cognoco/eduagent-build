// ---------------------------------------------------------------------------
// Settings Service — Sprint 8, Phase 5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, sql } from 'drizzle-orm';
import {
  notificationPreferences,
  notificationLog,
  learningModes,
  learningProfiles,
  profiles,
  withdrawalArchivePreferences,
  familyPreferences,
  type Database,
} from '@eduagent/database';
import type {
  NotificationPrefsInput,
  LearningMode,
  CelebrationLevel,
  WithdrawalArchivePreference,
} from '@eduagent/schemas';
import { ForbiddenError } from '@eduagent/schemas';
import { assertParentAccess } from './family-access';
import type { NotificationPayload } from './notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPrefs {
  reviewReminders: boolean;
  dailyReminders: boolean;
  weeklyProgressPush: boolean;
  weeklyProgressEmail: boolean;
  monthlyProgressEmail: boolean;
  pushEnabled: boolean;
  maxDailyPush: number;
}

export interface LearningModeRecord {
  mode: LearningMode;
  medianResponseSeconds?: number | null;
  celebrationLevel?: CelebrationLevel;
}

// ---------------------------------------------------------------------------
// Defaults (returned when no row exists yet)
// ---------------------------------------------------------------------------

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  reviewReminders: false,
  dailyReminders: false,
  weeklyProgressPush: true,
  weeklyProgressEmail: true,
  monthlyProgressEmail: true,
  pushEnabled: false,
  maxDailyPush: 3,
};

const DEFAULT_LEARNING_MODE: LearningModeRecord = {
  mode: 'casual',
  medianResponseSeconds: null,
  celebrationLevel: 'all',
};

// ---------------------------------------------------------------------------
// Ownership guard — verifies profileId belongs to accountId before writes
// ---------------------------------------------------------------------------

async function verifyProfileOwnership(
  db: Database,
  profileId: string,
  accountId: string,
): Promise<void> {
  const [owner] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.accountId, accountId)));
  if (!owner) {
    throw new Error(`Profile ${profileId} not found for account`);
  }
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export async function getNotificationPrefs(
  db: Database,
  profileId: string,
): Promise<NotificationPrefs> {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };

  return {
    reviewReminders: row.reviewReminders,
    dailyReminders: row.dailyReminders,
    weeklyProgressPush: row.weeklyProgressPush ?? true,
    weeklyProgressEmail: row.weeklyProgressEmail ?? true,
    monthlyProgressEmail: row.monthlyProgressEmail ?? true,
    pushEnabled: row.pushEnabled,
    maxDailyPush: row.maxDailyPush,
  };
}

export async function upsertNotificationPrefs(
  db: Database,
  profileId: string,
  accountId: string,
  input: NotificationPrefsInput,
): Promise<NotificationPrefs> {
  await verifyProfileOwnership(db, profileId, accountId);
  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  const maxDailyPush = input.maxDailyPush ?? 3;
  const weeklyProgressPush =
    input.weeklyProgressPush ?? existing?.weeklyProgressPush ?? true;
  const weeklyProgressEmail =
    input.weeklyProgressEmail ?? existing?.weeklyProgressEmail ?? true;
  const monthlyProgressEmail =
    input.monthlyProgressEmail ?? existing?.monthlyProgressEmail ?? true;

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({
        reviewReminders: input.reviewReminders,
        dailyReminders: input.dailyReminders,
        weeklyProgressPush,
        weeklyProgressEmail,
        monthlyProgressEmail,
        pushEnabled: input.pushEnabled,
        maxDailyPush,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.profileId, profileId));
  } else {
    await db.insert(notificationPreferences).values({
      profileId,
      reviewReminders: input.reviewReminders,
      dailyReminders: input.dailyReminders,
      weeklyProgressPush,
      weeklyProgressEmail,
      monthlyProgressEmail,
      pushEnabled: input.pushEnabled,
      maxDailyPush,
    });
  }

  return {
    reviewReminders: input.reviewReminders,
    dailyReminders: input.dailyReminders,
    weeklyProgressPush,
    weeklyProgressEmail,
    monthlyProgressEmail,
    pushEnabled: input.pushEnabled,
    maxDailyPush,
  };
}

// ---------------------------------------------------------------------------
// Learning Mode
// ---------------------------------------------------------------------------

export async function getLearningMode(
  db: Database,
  profileId: string,
): Promise<LearningModeRecord> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (!row) return { ...DEFAULT_LEARNING_MODE };

  return {
    mode: row.mode,
    medianResponseSeconds: row.medianResponseSeconds,
    celebrationLevel: row.celebrationLevel as CelebrationLevel,
  };
}

export async function upsertLearningMode(
  db: Database,
  profileId: string,
  accountId: string,
  mode: LearningMode,
): Promise<LearningModeRecord> {
  await verifyProfileOwnership(db, profileId, accountId);
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (existing) {
    await db
      .update(learningModes)
      .set({ mode, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  } else {
    await db.insert(learningModes).values({ profileId, mode });
  }

  return { mode };
}

export async function getCelebrationLevel(
  db: Database,
  profileId: string,
): Promise<CelebrationLevel> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  // Default 'all' for the active-profile path: historical default for the
  // self-celebrations channel. Note: the per-child column on
  // learning_profiles has a different default ('big_only') — see
  // getChildCelebrationLevel below. The two read from different tables and
  // serve different surfaces (self-session vs. parent control).
  return (row?.celebrationLevel as CelebrationLevel | undefined) ?? 'all';
}

export async function getChildCelebrationLevel(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<CelebrationLevel> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const row = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, childProfileId),
  });

  // Default 'big_only' for the parent-controlled per-child setting
  // (deliberately quieter than the self-default of 'all' returned by
  // getCelebrationLevel above). Asymmetric on purpose: parents tuning a
  // child's experience usually want a calmer baseline than the child
  // would self-select, and the column has its own default in the schema.
  return (row?.celebrationLevel as CelebrationLevel | undefined) ?? 'big_only';
}

export async function upsertCelebrationLevel(
  db: Database,
  profileId: string,
  accountId: string,
  celebrationLevel: CelebrationLevel,
): Promise<{ celebrationLevel: CelebrationLevel }> {
  await verifyProfileOwnership(db, profileId, accountId);
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (existing) {
    await db
      .update(learningModes)
      .set({ celebrationLevel, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  } else {
    await db
      .insert(learningModes)
      .values({ profileId, celebrationLevel, mode: 'serious' });
  }

  return { celebrationLevel };
}

export async function upsertChildCelebrationLevel(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
  celebrationLevel: CelebrationLevel,
): Promise<{ celebrationLevel: CelebrationLevel }> {
  await assertParentAccess(db, parentProfileId, childProfileId);
  const existing = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, childProfileId),
  });
  if (!existing) {
    return { celebrationLevel: 'big_only' };
  }
  await db
    .update(learningProfiles)
    .set({ celebrationLevel, updatedAt: new Date() })
    .where(eq(learningProfiles.profileId, childProfileId));

  return { celebrationLevel };
}

// ---------------------------------------------------------------------------
// Withdrawal Archive Preference
// ---------------------------------------------------------------------------

export async function getWithdrawalArchivePreference(
  db: Database,
  ownerProfileId: string,
): Promise<WithdrawalArchivePreference> {
  const row = await db.query.withdrawalArchivePreferences.findFirst({
    where: eq(withdrawalArchivePreferences.ownerProfileId, ownerProfileId),
  });

  return row?.preference ?? 'auto';
}

export async function upsertWithdrawalArchivePreference(
  db: Database,
  ownerProfileId: string,
  accountId: string,
  value: WithdrawalArchivePreference,
): Promise<{ value: WithdrawalArchivePreference }> {
  await verifyProfileOwnership(db, ownerProfileId, accountId);

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, ownerProfileId),
    columns: { isOwner: true },
  });
  if (!profile?.isOwner) {
    throw new ForbiddenError('Profile owner required');
  }

  await db
    .insert(withdrawalArchivePreferences)
    .values({ ownerProfileId, preference: value })
    .onConflictDoUpdate({
      target: withdrawalArchivePreferences.ownerProfileId,
      set: { preference: value, updatedAt: new Date() },
    });

  return { value };
}

// ---------------------------------------------------------------------------
// Family Pool Breakdown Sharing
// ---------------------------------------------------------------------------

export async function getFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
): Promise<boolean> {
  const row = await db.query.familyPreferences.findFirst({
    where: eq(familyPreferences.ownerProfileId, ownerProfileId),
    columns: { poolBreakdownShared: true },
  });

  return row?.poolBreakdownShared ?? false;
}

export async function getOwnedFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
  accountId: string,
): Promise<boolean> {
  await verifyProfileOwnership(db, ownerProfileId, accountId);

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, ownerProfileId),
    columns: { isOwner: true },
  });
  if (!profile?.isOwner) {
    throw new ForbiddenError('Profile owner required');
  }

  return getFamilyPoolBreakdownSharing(db, ownerProfileId);
}

export async function upsertFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
  accountId: string,
  value: boolean,
): Promise<{ value: boolean }> {
  await verifyProfileOwnership(db, ownerProfileId, accountId);

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, ownerProfileId),
    columns: { isOwner: true },
  });
  if (!profile?.isOwner) {
    throw new ForbiddenError('Profile owner required');
  }

  await db
    .insert(familyPreferences)
    .values({ ownerProfileId, poolBreakdownShared: value })
    .onConflictDoUpdate({
      target: familyPreferences.ownerProfileId,
      set: { poolBreakdownShared: value, updatedAt: new Date() },
    });

  return { value };
}

export async function getMedianResponseSeconds(
  db: Database,
  profileId: string,
): Promise<number | null> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });
  return row?.medianResponseSeconds ?? null;
}

/**
 * Server-side only — called exclusively from Inngest functions (session-completed).
 * The profileId originates from a trusted DB-sourced session row, not user input.
 * No accountId guard required.
 */
export async function updateMedianResponseSeconds(
  db: Database,
  profileId: string,
  sessionMedianSeconds: number,
): Promise<number> {
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const nextMedian =
    existing?.medianResponseSeconds != null
      ? Math.round(
          existing.medianResponseSeconds * 0.8 + sessionMedianSeconds * 0.2,
        )
      : Math.round(sessionMedianSeconds);

  if (existing) {
    await db
      .update(learningModes)
      .set({ medianResponseSeconds: nextMedian, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  } else {
    await db.insert(learningModes).values({
      profileId,
      mode: 'serious',
      medianResponseSeconds: nextMedian,
      celebrationLevel: 'all',
    });
  }

  return nextMedian;
}

// ---------------------------------------------------------------------------
// Learning Mode Rules
// ---------------------------------------------------------------------------

export interface LearningModeRules {
  masteryGates: boolean;
  verifiedXpOnly: boolean;
  mandatorySummaries: boolean;
}

/**
 * Returns the behavioral rules for a given learning mode.
 *
 * Serious: mastery gates on, XP pending until delayed recall, summaries required.
 * Casual: no mastery gates, XP awarded immediately as verified, summaries optional.
 */
export function getLearningModeRules(mode: LearningMode): LearningModeRules {
  if (mode === 'casual') {
    return {
      masteryGates: false,
      verifiedXpOnly: false,
      mandatorySummaries: false,
    };
  }
  return {
    masteryGates: true,
    verifiedXpOnly: true,
    mandatorySummaries: true,
  };
}

// ---------------------------------------------------------------------------
// Summary Skip Tracking
// ---------------------------------------------------------------------------

export const SKIP_WARNING_THRESHOLD = 5;

export async function getConsecutiveSummarySkips(
  db: Database,
  profileId: string,
): Promise<number> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });
  return row?.consecutiveSummarySkips ?? 0;
}

/**
 * Server-side only — called exclusively from Inngest functions and session services.
 * The profileId originates from a trusted DB-sourced session row, not user input.
 * No accountId guard required.
 */
export async function incrementSummarySkips(
  db: Database,
  profileId: string,
): Promise<number> {
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const newCount = (existing?.consecutiveSummarySkips ?? 0) + 1;

  if (existing) {
    await db
      .update(learningModes)
      .set({ consecutiveSummarySkips: newCount, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  } else {
    await db
      .insert(learningModes)
      .values({ profileId, consecutiveSummarySkips: newCount });
  }

  return newCount;
}

/**
 * Server-side only — called exclusively from Inngest functions and session services.
 * The profileId originates from a trusted DB-sourced session row, not user input.
 * No accountId guard required.
 */
export async function resetSummarySkips(
  db: Database,
  profileId: string,
): Promise<void> {
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (existing && existing.consecutiveSummarySkips > 0) {
    await db
      .update(learningModes)
      .set({ consecutiveSummarySkips: 0, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  }
}

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

export async function registerPushToken(
  db: Database,
  profileId: string,
  accountId: string,
  token: string,
): Promise<void> {
  await verifyProfileOwnership(db, profileId, accountId);
  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({ expoPushToken: token, updatedAt: new Date() })
      .where(eq(notificationPreferences.profileId, profileId));
  } else {
    await db
      .insert(notificationPreferences)
      .values({ profileId, expoPushToken: token });
  }
}

export async function getPushToken(
  db: Database,
  profileId: string,
): Promise<string | null> {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });
  return row?.expoPushToken ?? null;
}

// ---------------------------------------------------------------------------
// Notification Logging (daily cap enforcement)
// ---------------------------------------------------------------------------

export async function getDailyNotificationCount(
  db: Database,
  profileId: string,
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        gte(notificationLog.sentAt, startOfDay),
      ),
    );

  return rows.length;
}

/**
 * Server-side only — called exclusively from services/notifications.ts (Inngest pipeline).
 * The profileId originates from a trusted internal notification payload, not user input.
 * No accountId guard required.
 */
export async function logNotification(
  db: Database,
  profileId: string,
  type: NotificationPayload['type'],
  ticketId?: string,
): Promise<void> {
  await db.insert(notificationLog).values({
    profileId,
    type,
    ticketId: ticketId ?? null,
  });
}

/**
 * Counts notifications of a specific type within the last N hours for a profile.
 */
export async function getRecentNotificationCount(
  db: Database,
  profileId: string,
  type: NotificationPayload['type'],
  hours: number,
): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        eq(notificationLog.type, type),
        gte(notificationLog.sentAt, since),
      ),
    );

  return rows.length;
}

/**
 * Atomic rate-limit check: counts recent notifications and logs a new one
 * inside a single transaction to avoid TOCTOU races where concurrent
 * requests both read a below-limit count and both proceed.
 *
 * Returns `true` if the caller is rate-limited (count >= maxCount),
 * `false` if the request was allowed and logged.
 *
 * Server-internal variant — no profile-ownership check. Use only from trusted
 * server contexts (Inngest functions, internal notification pipelines).
 * For user-driven flows use `checkAndLogRateLimit`.
 */
export async function checkAndLogRateLimitInternal(
  db: Database,
  profileId: string,
  type: NotificationPayload['type'],
  opts: { hours: number; maxCount: number },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, notificationKey) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-856]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'rate-limit:' + profileId + ':' + type
      }, 0))`,
    );

    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000);
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profileId),
          eq(notificationLog.type, type),
          gte(notificationLog.sentAt, since),
        ),
      );

    if (rows.length >= opts.maxCount) {
      return true;
    }

    await tx.insert(notificationLog).values({
      profileId,
      type,
      ticketId: null,
    });

    return false;
  });
}

export async function checkAndLogRateLimit(
  db: Database,
  profileId: string,
  accountId: string,
  type: NotificationPayload['type'],
  opts: { hours: number; maxCount: number },
): Promise<boolean> {
  await verifyProfileOwnership(db, profileId, accountId);
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, notificationKey) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-861]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'rate-limit:' + profileId + ':' + type
      }, 0))`,
    );

    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000);
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profileId),
          eq(notificationLog.type, type),
          gte(notificationLog.sentAt, since),
        ),
      );

    if (rows.length >= opts.maxCount) {
      return true;
    }

    await tx.insert(notificationLog).values({
      profileId,
      type,
      ticketId: null,
    });

    return false;
  });
}
