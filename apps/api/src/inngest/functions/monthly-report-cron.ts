// @inngest-admin: cross-profile
//
// This file is intentionally cross-profile. It contains two exports:
//   - `monthlyReportCron` (admin): cron entry that scans all parent/child
//     family links with active snapshots for the prior month, then fans out
//     per-pair generate events. Legitimately cross-profile.
//   - `monthlyReportGenerate` (per-pair fan-out): event handler driven by
//     `app/monthly-report.generate`; parentId and childId come from the event
//     payload and all DB reads are scoped to those two profiles only.
//
// Profile-scoping rules in AGENTS.md ("Reads must use createScopedRepository")
// do NOT apply to `monthlyReportCron` — this is system-wide work running
// outside any single profile's request context.
//
// If you add raw drizzle queries to this file, ensure they cannot leak
// data between profiles in user-visible output (notifications,
// recommendations). When in doubt, scope by profileId at the leaf even
// when scanning broadly.

import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import {
  guardianship,
  login,
  monthlyReports,
  notificationPreferences,
  person,
  progressSnapshots,
} from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase, getStepResendApiKey } from '../helpers';
import {
  generateMonthlyReportData,
  generateReportHighlights,
} from '../../services/monthly-report';
import { getPracticeActivitySummary } from '../../services/practice-activity-summary';
import { listEligibleSelfReportPersonIdsV2 } from '../../services/identity-v2/solo-progress-reports-v2';
import { isGdprProcessingAllowedV2 } from '../../services/identity-v2/consent-status-v2';
import { isGuardianOf } from '../../services/identity-v2/guardianship';
import { isPersonLive } from '../../services/identity-v2/helpers';
import {
  filterProgressMetricsToActiveSubjects,
  getSnapshotsInRange,
} from '../../services/snapshot-aggregation';
import {
  sendPushNotification,
  sendEmail,
  formatMonthlyProgressEmail,
  type ChildStruggleLine,
} from '../../services/notifications';
import { getRecentNotificationCount } from '../../services/settings';
import { listStruggleTopicNames } from '../../services/learner-profile';
import { captureException } from '../../services/sentry';
import { buildLegacyEmailIdempotencyKey } from '../../services/dedupe-key';
import {
  monthlyReportGenerateEventSchema,
  progressMetricsSchema,
} from '@eduagent/schemas';
import { parseConversationLanguage } from '../../services/llm';

// [BUG-848] Validate the JSONB `metrics` column at runtime instead of casting.
// Older snapshot rows may have a different shape from what current code
// expects, and `as ProgressMetrics` would silently produce a malformed object
// that crashes the report generator with a non-actionable error. safeParse
// keeps the cron resilient: bad rows are skipped per-pair and reported, the
// rest of the batch still completes.
function safeParseMetrics(raw: unknown) {
  if (raw == null) return null;
  const result = progressMetricsSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// ---------------------------------------------------------------------------
// Result type contracts — exported so tests (and any future caller of the
// inngest handler shape) can import them instead of duplicating local
// interfaces or reaching for bare `as` casts. [bug #293]
//
// `status` uses widened string unions; the cron returns a literal union
// across two paths, and Generate has separate completed/skipped/failed
// branches. Keeping these as a single readable shape per handler matches
// the actual runtime returns above.
// ---------------------------------------------------------------------------

export interface MonthlyReportCronResult {
  status: 'completed' | 'partial';
  queuedPairs: number;
  totalPairs?: number;
  queuedBatches?: number;
  failedBatches?: number;
}

export type MonthlyReportGenerateStatus = 'completed' | 'skipped' | 'failed';

export interface MonthlyReportGenerateResult {
  status: MonthlyReportGenerateStatus;
  parentId?: string;
  childId?: string;
  // Skip reason — populated when status === 'skipped' (consent_not_granted,
  // child_missing, no_snapshot, metrics_shape_mismatch, self_display_name_missing).
  reason?: string;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthRangeStart(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1),
  );
}

function monthRangeEnd(date: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset + 1, 0),
  );
}

export const monthlyReportCron = inngest.createFunction(
  {
    id: 'progress-monthly-report',
    name: 'Queue monthly learning reports',
  },
  { cron: '0 10 1 * *' },
  async ({ step }) => {
    const pairs = await step.run('find-report-pairs', async () => {
      const db = getStepDatabase();
      const lastMonthStart = monthRangeStart(new Date(), -1);
      const lastMonthEnd = monthRangeEnd(new Date(), -1);
      const lastMonthEndExclusive = new Date(lastMonthEnd);
      lastMonthEndExclusive.setUTCDate(lastMonthEndExclusive.getUTCDate() + 1);
      // [L7-F3] Filter familyLinks via JOIN against progressSnapshots so we
      // never load every link in the system. Previously this was an
      // unbounded findMany() that scaled linearly with total family-link
      // count regardless of how many had active snapshots in the window.
      const activeRows = await db
        .selectDistinct({ childProfileId: progressSnapshots.profileId })
        .from(progressSnapshots)
        .where(
          and(
            gte(progressSnapshots.snapshotDate, isoDate(lastMonthStart)),
            lte(progressSnapshots.snapshotDate, isoDate(lastMonthEnd)),
          ),
        );
      const activeChildIds = activeRows.map((r) => r.childProfileId);
      // Parent/child pairs for active children: v2 = active guardianship edges
      // whose charge is an active child; legacy = family_links rows.
      const linkedPairs = activeChildIds.length
        ? (
            await db
              .select({
                parentProfileId: guardianship.guardianPersonId,
                childProfileId: guardianship.chargePersonId,
              })
              .from(guardianship)
              .where(
                and(
                  inArray(guardianship.chargePersonId, activeChildIds),
                  isNull(guardianship.revokedAt),
                ),
              )
          ).map((l) => ({
            parentId: l.parentProfileId,
            childId: l.childProfileId,
          }))
        : [];

      const selfWin = {
        start: lastMonthStart,
        endExclusive: lastMonthEndExclusive,
      };
      const selfProfileIds = await listEligibleSelfReportPersonIdsV2(
        db,
        selfWin,
      );

      const candidateProfileIds = Array.from(
        new Set([
          ...linkedPairs.flatMap((pair) => [pair.parentId, pair.childId]),
          ...selfProfileIds,
        ]),
      );
      if (candidateProfileIds.length === 0) return [];

      const activeProfileRows = await db.query.person.findMany({
        where: and(
          inArray(person.id, candidateProfileIds),
          isNull(person.archivedAt),
        ),
        columns: { id: true },
      });
      const activeProfileIds = new Set(
        activeProfileRows.map((profile) => profile.id),
      );
      const activeLinkedPairs = linkedPairs.filter(
        (pair) =>
          activeProfileIds.has(pair.parentId) &&
          activeProfileIds.has(pair.childId),
      );
      const activeSelfProfileIds = selfProfileIds.filter((profileId) =>
        activeProfileIds.has(profileId),
      );

      return [
        ...activeLinkedPairs,
        ...activeSelfProfileIds.map((profileId) => ({
          parentId: profileId,
          childId: profileId,
        })),
      ];
    });

    if (pairs.length === 0) {
      return { status: 'completed', queuedPairs: 0 };
    }

    // [BUG-850 / F-SVC-021] Per-batch try/catch + Sentry escalation. Without
    // per-batch isolation, a single failing sendEvent would either propagate
    // and skip the rest of the batches, or silently report `completed` while
    // half the parent/child pairs missed their monthly report.
    const BATCH_SIZE = 200;
    let queuedBatches = 0;
    let failedBatches = 0;
    let queuedPairs = 0;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      try {
        await step.sendEvent(
          `fan-out-monthly-reports-${i}`,
          batch.map((pair) => ({
            name: 'app/monthly-report.generate' as const,
            data: pair,
          })),
        );
        queuedBatches += 1;
        queuedPairs += batch.length;
      } catch (err) {
        failedBatches += 1;
        captureException(err, {
          extra: {
            context: 'monthly-report-cron-fan-out',
            batchIndex: i,
            batchSize: batch.length,
            totalPairs: pairs.length,
          },
        });
      }
    }

    return {
      status: failedBatches === 0 ? 'completed' : 'partial',
      queuedPairs,
      totalPairs: pairs.length,
      queuedBatches,
      failedBatches,
    };
  },
);

export const monthlyReportGenerate = inngest.createFunction(
  {
    id: 'progress-monthly-report-generate',
    name: 'Generate one monthly learning report',
    // [CR-2026-05-21-034] Dedup duplicate fan-out events from monthlyReportCron
    // before the expensive getSnapshotsInRange + generateReportHighlights (LLM)
    // path runs. The onConflictDoNothing DB rescue only fires AFTER the LLM
    // call; idempotency here short-circuits the entire run for any duplicate
    // event within Inngest's 24-hour dedup window. The cron fires once per
    // month so parentId + childId uniquely identifies one report per cycle.
    idempotency: 'event.data.parentId + "-" + event.data.childId',
  },
  { event: 'app/monthly-report.generate' },
  async ({ event, step }) => {
    // [WI-985] Parse at the Inngest function boundary. Throws ZodError on
    // malformed data — Inngest will retry; avoids silent NaN/undefined
    // propagation from bare destructuring.
    const { parentId, childId } = monthlyReportGenerateEventSchema.parse(
      event.data,
    );
    const isSelfReport = parentId === childId;

    // [J-6] Step 1: Generate and persist report data.
    // The DB insert uses onConflictDoNothing, so retries are idempotent.
    // Push notification is in a SEPARATE step so that if push throws,
    // retry only re-runs the push (not the expensive LLM generation + insert).
    const reportResult = await step.run('generate-monthly-report', async () => {
      try {
        const db = getStepDatabase();

        // Consent gate (parity with weekly-progress-push and sendStruggleNotification):
        // skip child if their most-recent GDPR consent state is anything other than
        // CONSENTED. Missing row = no restriction (pre-consent-flow accounts).
        const gdprOk = await isGdprProcessingAllowedV2(db, childId);
        if (!gdprOk) {
          return { status: 'skipped' as const, reason: 'consent_not_granted' };
        }

        if (!isSelfReport) {
          // Parent→child authority: active guardianship edge (v2) or
          // family_links row (legacy).
          const hasLink = await isGuardianOf(db, parentId, childId);
          if (!hasLink) {
            return {
              status: 'skipped' as const,
              reason: 'parent_child_link_missing',
            };
          }
        }

        const child = await db.query.person.findFirst({
          where: and(eq(person.id, childId), isNull(person.archivedAt)),
          columns: { displayName: true },
        });
        if (!child) {
          return { status: 'skipped' as const, reason: 'child_missing' };
        }
        const parent = isSelfReport
          ? child
          : (await isPersonLive(db, parentId))
            ? { id: parentId }
            : null;
        if (!parent) {
          return { status: 'skipped' as const, reason: 'parent_missing' };
        }
        if (
          isSelfReport &&
          (!child.displayName || child.displayName.trim().length === 0)
        ) {
          captureException(
            new Error('monthly self report missing display name'),
            {
              extra: {
                parentId,
                childId,
                context: 'monthly-report-generate',
                reason: 'self_display_name_missing',
              },
            },
          );
          return {
            status: 'skipped' as const,
            reason: 'self_display_name_missing',
          };
        }

        const lastMonthStart = monthRangeStart(new Date(), -1);
        const lastMonthEnd = monthRangeEnd(new Date(), -1);
        const previousMonthEnd = monthRangeEnd(new Date(), -2);
        const currentWindowStart = new Date(lastMonthEnd);
        currentWindowStart.setUTCDate(currentWindowStart.getUTCDate() - 2);
        const previousWindowStart = new Date(previousMonthEnd);
        previousWindowStart.setUTCDate(previousWindowStart.getUTCDate() - 2);

        const currentSnapshots = await getSnapshotsInRange(
          db,
          childId,
          isoDate(currentWindowStart),
          isoDate(lastMonthEnd),
        );
        const previousSnapshots = await getSnapshotsInRange(
          db,
          childId,
          isoDate(previousWindowStart),
          isoDate(previousMonthEnd),
        );

        const rawThisMonthMetrics = safeParseMetrics(
          currentSnapshots.at(-1)?.metrics,
        );
        if (!rawThisMonthMetrics) {
          // Either no snapshot at all, or the snapshot row is from older
          // code and no longer matches the schema. Either way we cannot
          // generate a useful report — skip with a structured reason so on-
          // call has a queryable signal rather than discovering the drift
          // from a parent's missing report.
          if (currentSnapshots.at(-1)?.metrics != null) {
            captureException(
              new Error('monthly-report metrics shape mismatch'),
              {
                extra: {
                  parentId,
                  childId,
                  context: 'monthly-report-generate',
                  reason: 'progress_metrics_shape_mismatch',
                },
              },
            );
            return {
              status: 'skipped' as const,
              reason: 'metrics_shape_mismatch',
            };
          }
          return { status: 'skipped' as const, reason: 'no_snapshot' };
        }
        const thisMonthMetrics = await filterProgressMetricsToActiveSubjects(
          db,
          childId,
          rawThisMonthMetrics,
        );

        const rawPreviousMetrics = safeParseMetrics(
          previousSnapshots.at(-1)?.metrics,
        );
        const previousMetrics = rawPreviousMetrics
          ? await filterProgressMetricsToActiveSubjects(
              db,
              childId,
              rawPreviousMetrics,
            )
          : null;

        const childDisplayName = isSelfReport
          ? child.displayName
          : (child.displayName ?? 'Your child');

        const previousMonthStart = monthRangeStart(lastMonthStart, -1);
        const practiceSummary = await getPracticeActivitySummary(db, {
          profileId: childId,
          period: {
            start: lastMonthStart,
            endExclusive: new Date(
              Date.UTC(
                lastMonthStart.getUTCFullYear(),
                lastMonthStart.getUTCMonth() + 1,
                1,
              ),
            ),
          },
          previousPeriod: {
            start: previousMonthStart,
            endExclusive: lastMonthStart,
          },
        });

        let reportData = generateMonthlyReportData(
          childDisplayName,
          lastMonthStart.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          thisMonthMetrics,
          previousMetrics,
          practiceSummary,
        );

        // i18n Phase 1 — parent receives the report so use the parent's
        // conversation_language for prose. For self-reports parentId === childId.
        const [reportTargetProfile] = await db
          .select({ conversationLanguage: person.conversationLanguage })
          .from(person)
          .where(and(eq(person.id, parentId), isNull(person.archivedAt)))
          .limit(1);
        const llmContent = await generateReportHighlights(reportData, {
          // DB returns string | null; parse to union before passing to LLM call.
          conversationLanguage: parseConversationLanguage(
            reportTargetProfile?.conversationLanguage,
          ),
        });
        reportData = {
          ...reportData,
          highlights: llmContent.highlights,
          nextSteps: llmContent.nextSteps,
          headlineStat: llmContent.comparison
            ? {
                ...reportData.headlineStat,
                comparison: llmContent.comparison,
              }
            : reportData.headlineStat,
        };

        await db
          .insert(monthlyReports)
          .values({
            profileId: parentId,
            childProfileId: childId,
            reportMonth: isoDate(lastMonthStart),
            reportData,
          })
          .onConflictDoNothing();

        // Minor-PII discipline: this return value is memoized into Inngest's
        // third-party state store, so it carries no child name or struggle
        // topics — the push/email steps rehydrate both from the DB.
        return {
          status: 'completed' as const,
          reportMonth: isoDate(lastMonthStart),
          isSelfReport,
        };
      } catch (error) {
        captureException(error, {
          extra: { parentId, childId, context: 'monthly-report-generate' },
        });
        // [SWEEP-SILENT-RECOVERY / J-11] Returning { status: 'failed' } here
        // resolves the step as a success — Inngest only retries on thrown
        // errors. Without re-throw, transient LLM/DB errors are absorbed and
        // a parent/child pair quietly never gets their monthly report while
        // the dashboard counts the run as completed. Re-throw lets Inngest
        // retry and surface a real failure. See daily-snapshot.ts:78-80.
        throw error;
      }
    });

    if (reportResult.status !== 'completed') {
      return {
        status: reportResult.status,
        parentId,
        childId,
        // Preserve skip reason for observability (child_missing, no_snapshot, consent_not_granted)
        ...(reportResult.status === 'skipped' && 'reason' in reportResult
          ? { reason: reportResult.reason }
          : {}),
      };
    }

    if (reportResult.isSelfReport) {
      return { status: 'completed', parentId, childId };
    }

    // [J-6] Step 2: Send push notification in its own step so that a push
    // failure only retries the push — not the LLM + DB insert above.
    //
    // [BUG-699-FOLLOWUP] 24h notification-log dedup — same shape as the
    // trial-expiry fix. Inngest's step.run memoizes within one run, but a
    // duplicate `app/monthly-report.generate` event (cron edge re-fire,
    // operator replay) creates a new run that would re-push the parent
    // without this guard. The cadence (monthly cron) makes the read-then-
    // write race window irrelevant in practice; if duplicates ever surface,
    // promote to a (profile_id, type, day) unique index on notificationLog.
    //
    // [CR-2026-05-21-022] Push and email are now SEPARATE steps. Previously
    // both lived in one step: if push succeeded (logging a row) and email
    // threw, the retry's dedup check would find recentCount > 0 and return
    // early — email was permanently lost. Splitting them means:
    //   - send-monthly-push:  dedup check + push send (logs internally)
    //   - send-monthly-email: email send only (Resend idempotency key dedupes
    //     within 24h so a retry never double-sends email)
    // The push step's completed status is memoized by Inngest on retry, so
    // the dedup check is NOT re-executed when only the email step replays.
    const pushResult = await step.run('send-monthly-push', async () => {
      const db = getStepDatabase();
      const recentCount = await getRecentNotificationCount(
        db,
        parentId,
        'monthly_report',
        24,
      );
      if (recentCount > 0) {
        return { sent: false, reason: 'dedup_24h' as const };
      }
      const parentLive = await isPersonLive(db, parentId);
      if (!parentLive) {
        return { sent: false, reason: 'profile_archived' as const };
      }
      // Rehydrated at send time — the child's name never rides the memoized
      // generate-step return.
      const activeChild = await db.query.person.findFirst({
        where: and(eq(person.id, childId), isNull(person.archivedAt)),
        columns: { id: true, displayName: true },
      });
      if (!activeChild) {
        return { sent: false, reason: 'profile_archived' as const };
      }
      // Blank/whitespace names fall back too — copy must never render
      // "'s monthly report is ready".
      const childDisplayName = activeChild.displayName?.trim()
        ? activeChild.displayName.trim()
        : 'Your child';
      // [BUG-841] Capture and return the real result so the email-gate and
      // observability see the actual delivery outcome (no_push_token,
      // push_disabled, daily_cap_exceeded, etc.) instead of a hardcoded
      // {sent:true, reason:undefined}. Matches weekly-progress-push pattern.
      // [WI-369] No options needed — push preference is enforced by default.
      return sendPushNotification(db, {
        profileId: parentId,
        title: `${childDisplayName}'s monthly report is ready`,
        body: 'Open the app to see what they learned this month.',
        type: 'monthly_report',
      });
    });

    // [CR-2026-05-21-022] Step 3: Send email in a separate step. If this step
    // throws, Inngest retries only this step — the push step above is already
    // memoized and its dedup marker (the notification log row) does not
    // interfere with the email retry. Resend's idempotencyKey prevents
    // duplicate delivery if the email already sent on a prior attempt.
    //
    // Gate: if the push step was blocked by the 24h dedup guard, the event is
    // a duplicate (cron edge re-fire or operator replay). Skip email too so
    // the parent does not receive a duplicate. On a normal first-send, or on
    // a retry after email failure, pushResult.reason is undefined and email
    // proceeds.
    //
    // Email channel: send when monthly_progress_email = true AND parent has
    // accounts.email.
    if (
      !('reason' in pushResult) ||
      (pushResult.reason !== 'dedup_24h' &&
        pushResult.reason !== 'profile_archived')
    ) {
      await step.run('send-monthly-email', async () => {
        const db = getStepDatabase();
        const prefs = await db.query.notificationPreferences.findFirst({
          where: eq(notificationPreferences.profileId, parentId),
          columns: { monthlyProgressEmail: true },
        });
        if (!(prefs?.monthlyProgressEmail ?? true)) {
          return { sent: false, reason: 'email_pref_off' };
        }
        // v2: the parent's email lives on their login (person→login). Liveness
        // is implied by the login existing on a live person; the child read
        // below still gates the send.
        const loginRow = await db.query.login.findFirst({
          where: eq(login.personId, parentId),
          columns: { email: true },
        });
        const parentEmail: string | null = loginRow?.email ?? null;
        // Rehydrated at send time — name and struggle topics never ride the
        // memoized generate-step return.
        const childProfile = await db.query.person.findFirst({
          where: and(eq(person.id, childId), isNull(person.archivedAt)),
          columns: { id: true, displayName: true },
        });

        if (!childProfile) {
          return { sent: false, reason: 'profile_archived' };
        }
        if (!parentEmail) {
          // Expected: OAuth-only accounts or Clerk not exposing email field.
          return { sent: false, reason: 'no_email' };
        }

        const childDisplayName = childProfile.displayName?.trim()
          ? childProfile.displayName.trim()
          : 'Your child';
        // Struggle watch-line (path A: topic names only). Malformed JSONB
        // degrades to an empty list inside the helper.
        const struggleLines: ChildStruggleLine[] = [
          {
            childName: childDisplayName,
            topics: await listStruggleTopicNames(db, childId, 2),
          },
        ];
        const summary = `${childDisplayName}'s monthly report is ready. Open the app to see what they learned this month.`;
        const emailPayload = formatMonthlyProgressEmail(
          parentEmail,
          summary,
          struggleLines,
        );
        await sendEmail(emailPayload, {
          resendApiKey: getStepResendApiKey(),
          idempotencyKey: buildLegacyEmailIdempotencyKey(
            'monthly',
            parentId,
            reportResult.reportMonth,
          ),
        });
        return { sent: true };
      });
    }

    return { status: 'completed', parentId, childId };
  },
);
