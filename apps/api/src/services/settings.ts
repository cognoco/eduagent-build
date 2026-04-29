// ---------------------------------------------------------------------------
// Settings Service — Sprint 8, Phase 5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, sql } from 'drizzle-orm';
import {
  notificationPreferences,
  notificationLog,
  learningModes,
  profiles,
  type Database,
} from '@eduagent/database';
import type {
  NotificationPrefsInput,
  LearningMode,
  CelebrationLevel,
} from '@eduagent/schemas';
import type { NotificationPayload } from './notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPrefs {
  reviewReminders: boolean;
  dailyReminders: boolean;
  weeklyProgressPush: boolean;
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
  accountId: string
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
  profileId: string
): Promise<NotificationPrefs> {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };

  return {
    reviewReminders: row.reviewReminders,
    dailyReminders: row.dailyReminders,
    weeklyProgressPush: row.weeklyProgressPush,
    pushEnabled: row.pushEnabled,
    maxDailyPush: row.maxDailyPush,
  };
}

export async function upsertNotificationPrefs(
  db: Database,
  profileId: string,
  accountId: string,
  input: NotificationPrefsInput
): Promise<NotificationPrefs> {
  await verifyProfileOwnership(db, profileId, accountId);
  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  const maxDailyPush = input.maxDailyPush ?? 3;

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({
        reviewReminders: input.reviewReminders,
        dailyReminders: input.dailyReminders,
        weeklyProgressPush: input.weeklyProgressPush ?? true,
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
      weeklyProgressPush: input.weeklyProgressPush ?? true,
      pushEnabled: input.pushEnabled,
      maxDailyPush,
    });
  }

  return {
    reviewReminders: input.reviewReminders,
    dailyReminders: input.dailyReminders,
    weeklyProgressPush: input.weeklyProgressPush ?? true,
    pushEnabled: input.pushEnabled,
    maxDailyPush,
  };
}

// ---------------------------------------------------------------------------
// Learning Mode
// ---------------------------------------------------------------------------

export async function getLearningMode(
  db: Database,
  profileId: string
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
  mode: LearningMode
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
  profileId: string
): Promise<CelebrationLevel> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  return (row?.celebrationLevel as CelebrationLevel | undefined) ?? 'all';
}

export async function upsertCelebrationLevel(
  db: Database,
  profileId: string,
  accountId: string,
  celebrationLevel: CelebrationLevel
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

export async function getMedianResponseSeconds(
  db: Database,
  profileId: string
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
  sessionMedianSeconds: number
): Promise<number> {
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const nextMedian =
    existing?.medianResponseSeconds != null
      ? Math.round(
          existing.medianResponseSeconds * 0.8 + sessionMedianSeconds * 0.2
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
// Summary Skip Tracking (FR37 5-skip warning + FR94 10-skip casual-switch prompt)
// ---------------------------------------------------------------------------

/** Threshold for showing a warning before the full casual-switch prompt */
export const SKIP_WARNING_THRESHOLD = 5;

/** Threshold for prompting the learner to switch to Casual Explorer */
export const CASUAL_SWITCH_PROMPT_THRESHOLD = 10;

export async function getConsecutiveSummarySkips(
  db: Database,
  profileId: string
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
  profileId: string
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
  profileId: string
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

/**
 * Returns true when the learner has skipped >= 10 consecutive summaries
 * AND is currently in 'serious' mode. Used to prompt switching to Casual Explorer.
 */
export async function shouldPromptCasualSwitch(
  db: Database,
  profileId: string
): Promise<boolean> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const mode = row?.mode ?? 'serious';
  const skips = row?.consecutiveSummarySkips ?? 0;

  return mode === 'serious' && skips >= CASUAL_SWITCH_PROMPT_THRESHOLD;
}

/**
 * Returns true when the learner has skipped >= 5 but < 10 consecutive summaries
 * AND is in 'serious' mode. Used for an early warning before the casual-switch prompt.
 */
export async function shouldWarnSummarySkip(
  db: Database,
  profileId: string
): Promise<boolean> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const mode = row?.mode ?? 'serious';
  const skips = row?.consecutiveSummarySkips ?? 0;

  return (
    mode === 'serious' &&
    skips >= SKIP_WARNING_THRESHOLD &&
    skips < CASUAL_SWITCH_PROMPT_THRESHOLD
  );
}

/**
 * Single-query replacement for calling shouldPromptCasualSwitch() and
 * shouldWarnSummarySkip() independently. Returns both flags from one DB read.
 */
export async function getSkipWarningFlags(
  db: Database,
  profileId: string
): Promise<{
  shouldPromptCasualSwitch: boolean;
  shouldWarnSummarySkip: boolean;
}> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  const mode = row?.mode ?? 'serious';
  const skips = row?.consecutiveSummarySkips ?? 0;

  const promptCasualSwitch =
    mode === 'serious' && skips >= CASUAL_SWITCH_PROMPT_THRESHOLD;
  const warnSummarySkip =
    !promptCasualSwitch &&
    mode === 'serious' &&
    skips >= SKIP_WARNING_THRESHOLD &&
    skips < CASUAL_SWITCH_PROMPT_THRESHOLD;

  return {
    shouldPromptCasualSwitch: promptCasualSwitch,
    shouldWarnSummarySkip: warnSummarySkip,
  };
}

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

export async function registerPushToken(
  db: Database,
  profileId: string,
  accountId: string,
  token: string
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
  profileId: string
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
  profileId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        gte(notificationLog.sentAt, startOfDay)
      )
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
  ticketId?: string
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
  hours: number
): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        eq(notificationLog.type, type),
        gte(notificationLog.sentAt, since)
      )
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
  opts: { hours: number; maxCount: number }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, notificationKey) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-856]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'rate-limit:' + profileId + ':' + type
      }, 0))`
    );

    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000);
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profileId),
          eq(notificationLog.type, type),
          gte(notificationLog.sentAt, since)
        )
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
  opts: { hours: number; maxCount: number }
): Promise<boolean> {
  await verifyProfileOwnership(db, profileId, accountId);
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, notificationKey) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-861]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'rate-limit:' + profileId + ':' + type
      }, 0))`
    );

    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000);
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profileId),
          eq(notificationLog.type, type),
          gte(notificationLog.sentAt, since)
        )
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
