// ---------------------------------------------------------------------------
// Settings Service — Sprint 8, Phase 5
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, inArray, ne, sql, exists } from 'drizzle-orm';
import { NotFoundError } from '../errors';
import {
  notificationPreferences,
  notificationLog,
  learningModes,
  learningProfiles,
  membership,
  withdrawalArchivePreferences,
  familyPreferences,
  type Database,
} from '@eduagent/database';
import type {
  NotificationPrefsInput,
  NotificationPrefsResponse,
  CelebrationLevel,
  WithdrawalArchivePreference,
  NotificationPayload,
} from '@eduagent/schemas';
import { ForbiddenError } from '@eduagent/schemas';
import {
  assertChargeNotCredentialed,
  assertParentAccess,
} from './family-access';
import {
  verifyPersonOwnershipV2,
  verifyPersonIsOrgAdminV2,
} from './identity-v2/ownership-v2';
import {
  requireCallerPersonId,
  type IdentityV2Opts,
} from './identity-v2/identity-v2-opts';

export type { IdentityV2Opts };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationPrefs = NotificationPrefsResponse;

export interface LearningModeRecord {
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
  pushTokenRegistered: false,
  maxDailyPush: 3,
};

const DEFAULT_LEARNING_MODE: LearningModeRecord = {
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
  opts?: IdentityV2Opts,
): Promise<void> {
  // v2: account.id = organization.id; write authority = self OR guardian edge
  // (membership alone is existence-visibility, not write authority).
  // callerPersonId is the authenticated caller, never request-supplied.
  // v2: profileId === personId on the cutover path (see CUT-B migration notes).
  await verifyPersonOwnershipV2(
    db,
    profileId,
    accountId,
    requireCallerPersonId(opts!),
  );
}

/**
 * Whether the profile is the account/org owner. Legacy reads
 * `profiles.isOwner`; v2 reads `membership.roles @> '{admin}'` scoped to the
 * caller's org (data-model.md §2B.3: is_owner → admin membership). `accountId`
 * is the caller's resolved org id under v2 (account.id = organization.id).
 */
async function isProfileOwner(
  db: Database,
  profileId: string,
  accountId: string,
  opts?: IdentityV2Opts,
): Promise<boolean> {
  return verifyPersonIsOrgAdminV2(db, profileId, accountId);
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
    pushTokenRegistered: Boolean(row.expoPushToken),
    maxDailyPush: row.maxDailyPush,
  };
}

export async function upsertNotificationPrefs(
  db: Database,
  profileId: string,
  accountId: string,
  input: NotificationPrefsInput,
  opts?: IdentityV2Opts,
): Promise<NotificationPrefs> {
  await verifyProfileOwnership(db, profileId, accountId, opts);
  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });

  // [WI-1441] Fall back to the existing row's value first, matching the
  // three siblings below — omitting maxDailyPush must preserve a user's
  // customized value, not silently reset it to the default. A caller that
  // truly wants the default sends 3 explicitly.
  const maxDailyPush = input.maxDailyPush ?? existing?.maxDailyPush ?? 3;
  const weeklyProgressPush =
    input.weeklyProgressPush ?? existing?.weeklyProgressPush ?? true;
  const weeklyProgressEmail =
    input.weeklyProgressEmail ?? existing?.weeklyProgressEmail ?? true;
  const monthlyProgressEmail =
    input.monthlyProgressEmail ?? existing?.monthlyProgressEmail ?? true;

  if (existing) {
    // [BUG-661 / FCR-2026-05-23-L3.L3.2] Defense-in-depth: even though
    // verifyProfileOwnership above asserts that profileId belongs to
    // accountId, also constrain the UPDATE itself so a future upstream bug
    // that passes a mismatched (profileId, accountId) pair cannot silently
    // mutate another account's notification preferences. The
    // notification_preferences table has no accountId column, so we enforce
    // the link via an EXISTS subquery against profiles.
    const [updated] = await db
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
      .where(
        and(
          eq(notificationPreferences.profileId, profileId),
          // v2 defense-in-depth: enforce the person↔org link via an EXISTS
          // subquery against membership (account.id = organization.id).
          exists(
            db
              .select({ _: sql`1` })
              .from(membership)
              .where(
                and(
                  eq(membership.personId, profileId),
                  eq(membership.organizationId, accountId),
                ),
              ),
          ),
        ),
      )
      .returning({ id: notificationPreferences.id });
    if (!updated) {
      // Defense-in-depth tripwire: the WHERE filtered out the row, which
      // means (profileId, accountId) didn't match in the profiles table.
      // verifyProfileOwnership should have already thrown — getting here is
      // a real bug (race, stale binding, or upstream auth gap). Surface it
      // rather than silently no-op.
      throw new Error(
        `notification_preferences upsert blocked: profile ${profileId} not owned by account ${accountId}`,
      );
    }
  } else {
    // [BUG-661] Same defense-in-depth on insert: verify profile ownership
    // immediately before write to close the read-then-write TOCTOU window
    // (in addition to verifyProfileOwnership at the top of the function).
    const [ownerCheck] = await db
      .select({ id: membership.personId })
      .from(membership)
      .where(
        and(
          eq(membership.personId, profileId),
          eq(membership.organizationId, accountId),
        ),
      );
    if (!ownerCheck) {
      throw new Error(
        `notification_preferences upsert blocked: profile ${profileId} not owned by account ${accountId}`,
      );
    }
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
    pushTokenRegistered: Boolean(existing?.expoPushToken),
    maxDailyPush,
  };
}

// ---------------------------------------------------------------------------
// Learning Mode Record (mode toggle removed; record now carries
// median response seconds + celebration level only)
// ---------------------------------------------------------------------------

export async function getLearningModeRecord(
  db: Database,
  profileId: string,
): Promise<LearningModeRecord> {
  const row = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (!row) return { ...DEFAULT_LEARNING_MODE };

  return {
    medianResponseSeconds: row.medianResponseSeconds,
    celebrationLevel: row.celebrationLevel as CelebrationLevel,
  };
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
  await assertChargeNotCredentialed(db, childProfileId);
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
  opts?: IdentityV2Opts,
): Promise<{ celebrationLevel: CelebrationLevel }> {
  await verifyProfileOwnership(db, profileId, accountId, opts);
  const existing = await db.query.learningModes.findFirst({
    where: eq(learningModes.profileId, profileId),
  });

  if (existing) {
    await db
      .update(learningModes)
      .set({ celebrationLevel, updatedAt: new Date() })
      .where(eq(learningModes.profileId, profileId));
  } else {
    await db.insert(learningModes).values({ profileId, celebrationLevel });
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
  await assertChargeNotCredentialed(db, childProfileId);
  const existing = await db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, childProfileId),
  });
  if (!existing) {
    throw new NotFoundError('Learning profile not found');
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
  opts?: IdentityV2Opts,
): Promise<{ value: WithdrawalArchivePreference }> {
  await verifyProfileOwnership(db, ownerProfileId, accountId, opts);

  if (!(await isProfileOwner(db, ownerProfileId, accountId, opts))) {
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
  opts?: IdentityV2Opts,
): Promise<boolean> {
  await verifyProfileOwnership(db, ownerProfileId, accountId, opts);

  if (!(await isProfileOwner(db, ownerProfileId, accountId, opts))) {
    throw new ForbiddenError('Profile owner required');
  }

  return getFamilyPoolBreakdownSharing(db, ownerProfileId);
}

export async function upsertFamilyPoolBreakdownSharing(
  db: Database,
  ownerProfileId: string,
  accountId: string,
  value: boolean,
  opts?: IdentityV2Opts,
): Promise<{ value: boolean }> {
  await verifyProfileOwnership(db, ownerProfileId, accountId, opts);

  if (!(await isProfileOwner(db, ownerProfileId, accountId, opts))) {
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
      medianResponseSeconds: nextMedian,
      celebrationLevel: 'all',
    });
  }

  return nextMedian;
}

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

export async function registerPushToken(
  db: Database,
  profileId: string,
  accountId: string,
  token: string,
  opts?: IdentityV2Opts,
): Promise<void> {
  await verifyProfileOwnership(db, profileId, accountId, opts);
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

/**
 * Whether the profile has the master push switch enabled. notification_preferences.pushEnabled
 * defaults to false, so an absent/never-configured row counts as disabled.
 */
export async function isPushEnabled(
  db: Database,
  profileId: string,
): Promise<boolean> {
  const row = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.profileId, profileId),
  });
  return row?.pushEnabled === true;
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

  // Count push sends only. Email evidence rows share notification_log for
  // 24h dedup but use `email-*` ticket IDs; counting them here would let a
  // delivered monthly-report email consume the parent's daily push quota.
  // Also exclude rate-limit sentinels that are not user-visible sends.
  const rows = await db
    .select()
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.profileId, profileId),
        gte(notificationLog.sentAt, startOfDay),
        ne(notificationLog.type, 'support_outbox_spillover'),
        sql`(${notificationLog.ticketId} IS NULL OR ${notificationLog.ticketId} NOT LIKE 'email-%')`,
      ),
    );

  return rows.length;
}

/**
 * The notification_log-backed helpers operate on the LOGGABLE subset of push
 * types. `store_cancel_nudge` (WI-1753 AC-6) is a push-only, cap-exempt,
 * Inngest-idempotent notification that is intentionally never written to
 * notification_log — so the DB `notification_type` enum deliberately omits it,
 * and these helpers exclude it from their accepted type. (The push sender in
 * services/notifications.ts guards the log write for it accordingly.)
 */
type LoggableNotificationType = Exclude<
  NotificationPayload['type'],
  'store_cancel_nudge'
>;

/**
 * Server-side only — called exclusively from services/notifications.ts (Inngest pipeline).
 * The profileId originates from a trusted internal notification payload, not user input.
 * No accountId guard required.
 */
export async function logNotification(
  db: Database,
  profileId: string,
  type: LoggableNotificationType,
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
  type: LoggableNotificationType,
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
 *
 * [WI-1461] `opts.dedupTypes` shares the rate-limit bucket (lock key + count
 * window) across multiple notification types — used by recall-nudge-send and
 * review-due-send so the two independent overdue-retention-card crons cannot
 * both push the same profile the same day. The row is still logged with the
 * caller's own `type`; only the *count check* and the *advisory lock* span
 * the dedup set. Omitting `dedupTypes` preserves the exact prior per-type
 * behavior (the default `[type]` singleton reproduces the same lock key).
 */
export async function checkAndLogRateLimitInternal(
  db: Database,
  profileId: string,
  type: LoggableNotificationType,
  opts: {
    hours: number;
    maxCount: number;
    dedupTypes?: LoggableNotificationType[];
  },
): Promise<boolean> {
  const dedupTypes = opts.dedupTypes ?? [type];
  const lockKey =
    'rate-limit:' + profileId + ':' + dedupTypes.slice().sort().join('+');

  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, dedup bucket) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-856]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const since = new Date(Date.now() - opts.hours * 60 * 60 * 1000);
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.profileId, profileId),
          inArray(notificationLog.type, dedupTypes),
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
  type: LoggableNotificationType,
  rateLimitOpts: { hours: number; maxCount: number },
  opts?: IdentityV2Opts,
): Promise<boolean> {
  await verifyProfileOwnership(db, profileId, accountId, opts);
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, notificationKey) — serializes concurrent
    // rate-limit checks for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-861]
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'rate-limit:' + profileId + ':' + type
      }, 0))`,
    );

    const since = new Date(Date.now() - rateLimitOpts.hours * 60 * 60 * 1000);
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

    if (rows.length >= rateLimitOpts.maxCount) {
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
