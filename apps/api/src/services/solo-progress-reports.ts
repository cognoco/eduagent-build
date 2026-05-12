import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import {
  accounts,
  consentStates,
  familyLinks,
  learningSessions,
  profiles,
  type Database,
} from '@eduagent/database';
import { MINIMUM_AGE, calculateAge } from './consent';

type SelfReportWindow = {
  start: Date;
  endExclusive: Date;
};

export function isLocalHour9ForTimezone(
  timezone: string | null,
  nowUtc: Date,
): boolean {
  if (!timezone) return nowUtc.getUTCHours() === 9;
  try {
    const localTimeStr = nowUtc.toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(localTimeStr, 10) === 9;
  } catch {
    return nowUtc.getUTCHours() === 9;
  }
}

export async function listEligibleSelfReportProfileIds(
  db: Database,
  window: SelfReportWindow,
): Promise<string[]> {
  const activityRows = await db
    .selectDistinct({ profileId: learningSessions.profileId })
    .from(learningSessions)
    .where(
      and(
        inArray(learningSessions.status, ['completed', 'auto_closed']),
        gte(learningSessions.exchangeCount, 1),
        gte(learningSessions.startedAt, window.start),
        lt(learningSessions.startedAt, window.endExclusive),
      ),
    );

  const candidateIds = activityRows.map((row) => row.profileId);
  if (candidateIds.length === 0) return [];

  const candidateProfiles = await db.query.profiles.findMany({
    where: and(
      inArray(profiles.id, candidateIds),
      eq(profiles.isOwner, true),
      isNull(profiles.archivedAt),
    ),
    columns: {
      id: true,
      accountId: true,
      birthYear: true,
    },
  });

  const ageEligibleProfiles = candidateProfiles.filter(
    (profile) => calculateAge(profile.birthYear) >= MINIMUM_AGE,
  );
  if (ageEligibleProfiles.length === 0) return [];

  const ageEligibleIds = ageEligibleProfiles.map((profile) => profile.id);
  const linkedChildren = await db.query.familyLinks.findMany({
    where: inArray(familyLinks.childProfileId, ageEligibleIds),
    columns: {
      childProfileId: true,
    },
  });

  const linkedChildIds = new Set(
    linkedChildren.map((link) => link.childProfileId),
  );
  const selfManagedProfiles = ageEligibleProfiles.filter(
    (profile) => !linkedChildIds.has(profile.id),
  );
  if (selfManagedProfiles.length === 0) return [];

  const selfManagedIds = selfManagedProfiles.map((profile) => profile.id);
  const consentRows = await db.query.consentStates.findMany({
    where: and(
      inArray(consentStates.profileId, selfManagedIds),
      eq(consentStates.consentType, 'GDPR'),
    ),
    columns: {
      profileId: true,
      status: true,
      requestedAt: true,
    },
  });

  const latestConsentByProfileId = new Map<
    string,
    {
      status: (typeof consentRows)[number]['status'];
      requestedAt: Date;
    }
  >();
  for (const row of consentRows) {
    const previous = latestConsentByProfileId.get(row.profileId);
    if (!previous || row.requestedAt > previous.requestedAt) {
      latestConsentByProfileId.set(row.profileId, {
        status: row.status,
        requestedAt: row.requestedAt,
      });
    }
  }

  return selfManagedProfiles
    .filter((profile) => {
      const latestConsent = latestConsentByProfileId.get(profile.id);
      return latestConsent == null || latestConsent.status === 'CONSENTED';
    })
    .map((profile) => profile.id);
}

export async function listEligibleSelfReportProfileIdsAtLocalHour9(
  db: Database,
  window: SelfReportWindow,
  nowUtc: Date,
): Promise<string[]> {
  const eligibleIds = await listEligibleSelfReportProfileIds(db, window);
  if (eligibleIds.length === 0) return [];

  const timezoneRows = await db
    .select({ profileId: profiles.id, timezone: accounts.timezone })
    .from(profiles)
    .innerJoin(accounts, eq(profiles.accountId, accounts.id))
    .where(inArray(profiles.id, eligibleIds));

  const timezoneByProfileId = new Map(
    timezoneRows.map((row) => [row.profileId, row.timezone]),
  );

  return eligibleIds.filter((profileId) =>
    isLocalHour9ForTimezone(timezoneByProfileId.get(profileId) ?? null, nowUtc),
  );
}
