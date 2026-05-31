import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Nudge, NudgeDirection, NudgeTemplate } from '@eduagent/schemas';
import {
  BadRequestError,
  ConsentRequiredError,
  RateLimitedError,
  guardianToLearnerNudgeTemplates,
  learnerToGuardianNudgeTemplates,
} from '@eduagent/schemas';
import {
  accounts,
  familyLinks,
  nudges,
  profiles,
  type Database,
} from '@eduagent/database';

import { assertParentAccess } from './family-access';
import { getConsentStatus } from './consent';
import { createLogger } from './logger';
import { sendPushNotification } from './notifications';

const logger = createLogger();

const NUDGE_RATE_LIMIT = 4;
const NUDGE_WINDOW_HOURS = 24;
const QUIET_HOURS_START = 21;
const QUIET_HOURS_END = 7;

const TEMPLATE_COPY: Record<NudgeTemplate, string> = {
  you_got_this: 'You got this',
  proud_of_you: 'Proud of you',
  quick_session: 'Want to do a quick session?',
  thinking_of_you: 'Just thinking of you',
  thanks: 'Thank you',
  need_help: 'I need help',
  proud_moment: "I'm proud of what I did",
};

const TEMPLATES_BY_DIRECTION: Record<NudgeDirection, ReadonlySet<string>> = {
  guardian_to_learner: new Set(guardianToLearnerNudgeTemplates),
  learner_to_guardian: new Set(learnerToGuardianNudgeTemplates),
};

function mapNudgeRow(row: {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  fromDisplayName: string;
  direction: NudgeDirection;
  template: NudgeTemplate;
  createdAt: Date;
  readAt: Date | null;
}): Nudge {
  return {
    id: row.id,
    fromProfileId: row.fromProfileId,
    toProfileId: row.toProfileId,
    fromDisplayName: row.fromDisplayName,
    direction: row.direction,
    template: row.template,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

function assertTemplateAllowed(
  direction: NudgeDirection,
  template: NudgeTemplate,
): void {
  if (!TEMPLATES_BY_DIRECTION[direction].has(template)) {
    throw new BadRequestError(
      `Template ${template} is not allowed for ${direction}.`,
    );
  }
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
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
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
    direction?: NudgeDirection;
    template: NudgeTemplate;
    now?: Date;
  },
): Promise<{ nudge: Nudge; pushSent: boolean }> {
  const now = params.now ?? new Date();
  const direction = params.direction ?? 'guardian_to_learner';
  assertTemplateAllowed(direction, params.template);

  const guardianProfileId =
    direction === 'guardian_to_learner'
      ? params.fromProfileId
      : params.toProfileId;
  const learnerProfileId =
    direction === 'guardian_to_learner'
      ? params.toProfileId
      : params.fromProfileId;

  await assertParentAccess(db, guardianProfileId, learnerProfileId);

  // null means no consent_states row exists — which for the post-profile-create
  // state happens when consent isn't required for this profile's age (17+).
  // See checkConsentRequired in consent.ts: ages 17+ return required:false, and
  // createProfile skips createPendingConsentState / createGrantedConsentState
  // in that case, so getConsentStatus resolves null. Treating null the same as
  // 'CONSENTED' here lets guardians and learners nudge when the learner is 17+
  // or otherwise has no consent row. The block still rejects PENDING /
  // WITHDRAWN / PARENTAL_CONSENT_REQUESTED.
  const consentStatus = await getConsentStatus(db, learnerProfileId);
  if (consentStatus !== null && consentStatus !== 'CONSENTED') {
    throw new ConsentRequiredError(
      "This learner can't send or receive nudges until consent is active.",
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
        direction,
        template: params.template,
        createdAt: now,
      })
      .returning();
    if (!row) throw new Error('Nudge insert did not return a row');
    return row;
  });

  const [fromProfile, toProfile] = await Promise.all([
    db.query.profiles.findFirst({
      where: eq(profiles.id, params.fromProfileId),
      columns: { displayName: true, accountId: true },
    }),
    db.query.profiles.findFirst({
      where: eq(profiles.id, params.toProfileId),
      columns: { displayName: true, accountId: true },
    }),
  ]);
  const fromDisplayName =
    fromProfile?.displayName ??
    (direction === 'guardian_to_learner' ? 'Your parent' : 'Your learner');

  // Quiet hours follow the recipient's local time only — senders may be in a
  // different zone, but it's the recipient we don't want to ping at 23:00.
  // If the recipient has no timezone on file, isQuietHours
  // defaults to UTC.
  const recipientAccount = toProfile?.accountId
    ? await db.query.accounts.findFirst({
        where: eq(accounts.id, toProfile.accountId),
        columns: { timezone: true },
      })
    : null;

  let pushSent = false;
  if (isQuietHours(now, recipientAccount?.timezone)) {
    logger.info('Nudge push suppressed by quiet hours', {
      event: 'notification.nudge.quiet_hours_suppressed',
      toProfileId: params.toProfileId,
    });
  } else {
    const payload = {
      profileId: params.toProfileId,
      title:
        direction === 'guardian_to_learner'
          ? `${fromDisplayName} sent you a nudge`
          : 'Your learner sent you a nudge',
      body: TEMPLATE_COPY[params.template],
      type: 'nudge' as const,
      data: {
        nudgeId: inserted.id,
        fromProfileId: params.fromProfileId,
        toProfileId: params.toProfileId,
        direction,
        templateKey: params.template,
      },
    };
    const push =
      direction === 'guardian_to_learner'
        ? await sendPushNotification(db, payload, { skipDailyCap: true })
        : await sendPushNotification(db, payload);
    pushSent = push.sent;
  }

  return {
    nudge: mapNudgeRow({
      ...inserted,
      direction,
      fromDisplayName,
    }),
    pushSent,
  };
}

export async function listUnreadNudges(
  db: Database,
  profileId: string,
): Promise<Nudge[]> {
  const rows = await db
    .select({
      id: nudges.id,
      fromProfileId: nudges.fromProfileId,
      toProfileId: nudges.toProfileId,
      fromDisplayName: profiles.displayName,
      direction: nudges.direction,
      template: nudges.template,
      createdAt: nudges.createdAt,
      readAt: nudges.readAt,
    })
    .from(nudges)
    .innerJoin(profiles, eq(profiles.id, nudges.fromProfileId))
    .innerJoin(
      familyLinks,
      or(
        and(
          eq(nudges.direction, 'guardian_to_learner'),
          eq(familyLinks.parentProfileId, nudges.fromProfileId),
          eq(familyLinks.childProfileId, nudges.toProfileId),
        ),
        and(
          eq(nudges.direction, 'learner_to_guardian'),
          eq(familyLinks.parentProfileId, nudges.toProfileId),
          eq(familyLinks.childProfileId, nudges.fromProfileId),
        ),
      ),
    )
    .where(and(eq(nudges.toProfileId, profileId), isNull(nudges.readAt)))
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
