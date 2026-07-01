import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Nudge, NudgeTemplate } from '@eduagent/schemas';
import { ConsentRequiredError, RateLimitedError } from '@eduagent/schemas';
import {
  membership,
  nudges,
  organization,
  person,
  type Database,
} from '@eduagent/database';

import { assertParentAccess } from './family-access';
import { isGdprProcessingAllowedV2 } from './identity-v2/consent-status-v2';
import { createLogger } from './logger';
import { sendPushNotification } from './notifications';
import { getGuardianPersonIds } from './identity-v2/guardianship';

const logger = createLogger();

export const NUDGE_RATE_LIMIT = 4;
export const NUDGE_WINDOW_HOURS = 24;
export const NUDGE_QUIET_HOURS_START = 21;
export const NUDGE_QUIET_HOURS_END = 7;

const TEMPLATE_COPY: Record<NudgeTemplate, string> = {
  you_got_this: 'You got this',
  proud_of_you: 'Proud of you',
  quick_session: 'Want to do a quick session?',
  thinking_of_you: 'Just thinking of you',
};

function mapNudgeRow(row: {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  fromDisplayName: string;
  template: NudgeTemplate;
  createdAt: Date;
  readAt: Date | null;
}): Nudge {
  return {
    id: row.id,
    fromProfileId: row.fromProfileId,
    toProfileId: row.toProfileId,
    fromDisplayName: row.fromDisplayName,
    template: row.template,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

function isQuietHours(now: Date, timezone: string | null | undefined): boolean {
  // An invalid timezone string stored on the recipient account would otherwise
  // throw RangeError from the Intl.DateTimeFormat constructor (e.g. 'foo',
  // 'Europe/', '<garbage>'). The nudge row has already been committed by the
  // time this runs, so an exception here would return 500 to the client and
  // burn another rate-limit slot on retry. Allow the push (return false) and
  // log so the bad timezone is debuggable.
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone ?? 'UTC',
    });
    const hour = Number(formatter.format(now));
    if (!Number.isFinite(hour)) return false;
    return hour >= NUDGE_QUIET_HOURS_START || hour < NUDGE_QUIET_HOURS_END;
  } catch (error) {
    logger.warn('nudge_quiet_hours_invalid_timezone', {
      metric: 'nudge_quiet_hours_invalid_timezone',
      timezone: timezone ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function createNudge(
  db: Database,
  params: {
    fromProfileId: string;
    toProfileId: string;
    template: NudgeTemplate;
    now?: Date;
  },
): Promise<{ nudge: Nudge; pushSent: boolean }> {
  const now = params.now ?? new Date();
  await assertParentAccess(db, params.fromProfileId, params.toProfileId);

  // null means no consent_states row exists — which for the post-profile-create
  // state happens when consent isn't required for this profile's age (17+).
  // See checkConsentRequired in consent.ts: ages 17+ return required:false, and
  // createProfile skips createPendingConsentState / createGrantedConsentState
  // in that case, so getConsentStatus resolves null. Treating null the same as
  // 'CONSENTED' here lets parents nudge their 17+ linked children. The block
  // still rejects PENDING / WITHDRAWN / PARENTAL_CONSENT_REQUESTED.
  //
  // [WI-809] flag-on: consent_states is dropped at the cutover, so route through
  // the GDPR-pinned v2 gate. isGdprProcessingAllowedV2 returns true iff there is
  // no GDPR consent row OR the latest GDPR grant is CONSENTED — byte-identical to
  // the legacy null-or-CONSENTED allow rule above, pinned to GDPR (BUG-465: a
  // newer COPPA row must not mask a withdrawn GDPR consent). flag-off path is
  // unchanged (legacy AnyBasis getConsentStatus).
  const consentBlocked = !(await isGdprProcessingAllowedV2(
    db,
    params.toProfileId,
  ));
  if (consentBlocked) {
    throw new ConsentRequiredError(
      "This child can't receive nudges until consent is active.",
      'CONSENT_REQUIRED',
    );
  }

  const windowStart = new Date(
    now.getTime() - NUDGE_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${
        'nudge-rate:' + params.toProfileId
      }, 0))`,
    );

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(nudges)
      .where(
        and(
          eq(nudges.toProfileId, params.toProfileId),
          gt(nudges.createdAt, windowStart),
        ),
      );
    if ((countRow?.count ?? 0) >= NUDGE_RATE_LIMIT) {
      throw new RateLimitedError(
        "You've sent enough encouragement for now.",
        'NUDGE_RATE_LIMITED',
      );
    }

    const [row] = await tx
      .insert(nudges)
      .values({
        fromProfileId: params.fromProfileId,
        toProfileId: params.toProfileId,
        template: params.template,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('Nudge insert did not return a row');
    return row;
  });

  // [WI-586] v2 path: read displayName from person; timezone from the child's
  // org (via membership join) — scoped to params.toProfileId so we never read
  // an arbitrary org's timezone.
  const [fromPersonRows, toOrgRows] = await Promise.all([
    db
      .select({ displayName: person.displayName })
      .from(person)
      .where(eq(person.id, params.fromProfileId))
      .limit(1),
    db
      .select({ timezone: organization.timezone })
      .from(membership)
      .innerJoin(organization, eq(organization.id, membership.organizationId))
      .where(eq(membership.personId, params.toProfileId))
      .limit(1),
  ]);
  const parentName = fromPersonRows[0]?.displayName ?? 'Your parent';
  const childTimezone = toOrgRows[0]?.timezone;

  let pushSent = false;
  if (isQuietHours(now, childTimezone)) {
    logger.info('Nudge push suppressed by quiet hours', {
      event: 'notification.nudge.quiet_hours_suppressed',
      toProfileId: params.toProfileId,
    });
  } else {
    const push = await sendPushNotification(
      db,
      {
        profileId: params.toProfileId,
        title: `${parentName} sent you a nudge`,
        body: TEMPLATE_COPY[params.template],
        type: 'nudge',
        data: {
          nudgeId: inserted.id,
          fromDisplayName: parentName,
          templateKey: params.template,
        },
      },
      { skipDailyCap: true },
    );
    pushSent = push.sent;
  }

  return {
    nudge: mapNudgeRow({
      ...inserted,
      fromDisplayName: parentName,
    }),
    pushSent,
  };
}

/**
 * Lists unread nudges for a profile.
 *
 * [WI-803] v2 seam: flag-on reads `guardianship` (active guardian person IDs)
 * instead of legacy `family_links`. The legacy INNER JOIN path is preserved
 * byte-identical for flag-off.
 */
export async function listUnreadNudges(
  db: Database,
  profileId: string,
): Promise<Nudge[]> {
  // [WI-803/WI-586] v2 path: resolve guardian person IDs via guardianship table
  // and join person for displayName — safe post-M-DROP (no profiles/family_links join).
  const guardianPersonIds = await getGuardianPersonIds(db, profileId);
  if (guardianPersonIds.length === 0) return [];
  const rows = await db
    .select({
      id: nudges.id,
      fromProfileId: nudges.fromProfileId,
      toProfileId: nudges.toProfileId,
      fromDisplayName: person.displayName,
      template: nudges.template,
      createdAt: nudges.createdAt,
      readAt: nudges.readAt,
    })
    .from(nudges)
    .innerJoin(person, eq(person.id, nudges.fromProfileId))
    .where(
      and(
        eq(nudges.toProfileId, profileId),
        isNull(nudges.readAt),
        inArray(nudges.fromProfileId, guardianPersonIds),
      ),
    )
    .orderBy(desc(nudges.createdAt));
  return rows.map(mapNudgeRow);
}

export async function markNudgeRead(
  db: Database,
  profileId: string,
  nudgeId: string,
): Promise<number> {
  // Idempotent: matching id+profileId returns 1 even if already read so that
  // client retries after network failure don't surface as 404. IDOR protection
  // is preserved by the toProfileId match — wrong profile still returns 0.
  const rows = await db
    .update(nudges)
    .set({ readAt: new Date() })
    .where(and(eq(nudges.id, nudgeId), eq(nudges.toProfileId, profileId)))
    .returning({ id: nudges.id });
  return rows.length;
}

export async function markAllNudgesRead(
  db: Database,
  profileId: string,
): Promise<number> {
  const rows = await db
    .update(nudges)
    .set({ readAt: new Date() })
    .where(and(eq(nudges.toProfileId, profileId), isNull(nudges.readAt)))
    .returning({ id: nudges.id });
  return rows.length;
}
