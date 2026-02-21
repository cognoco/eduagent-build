// ---------------------------------------------------------------------------
// Data Export Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, inArray, or } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  subjects,
  curricula,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  sessionEmbeddings,
  retentionCards,
  assessments,
  xpLedger,
  streaks,
  notificationPreferences,
  learningModes,
  teachingPreferences,
  onboardingDrafts,
  parkingLotItems,
  needsDeepeningTopics,
  familyLinks,
  subscriptions,
  quotaPools,
  topUpCredits,
  type Database,
} from '@eduagent/database';
import type { DataExport, ConsentStatus } from '@eduagent/schemas';

export async function generateExport(
  db: Database,
  accountId: string
): Promise<DataExport> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const profileRows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, accountId),
  });

  const profileIds = profileRows.map((p) => p.id);

  const consentRows =
    profileIds.length > 0
      ? await db.query.consentStates.findMany({
          where: inArray(consentStates.profileId, profileIds),
        })
      : [];

  // Build a map of profileId → most-recent consent status for profile export
  const latestConsentByProfileId = new Map<
    string,
    { status: string; requestedAt: Date }
  >();
  for (const row of consentRows) {
    const existing = latestConsentByProfileId.get(row.profileId);
    if (!existing || row.requestedAt > existing.requestedAt) {
      latestConsentByProfileId.set(row.profileId, {
        status: row.status,
        requestedAt: row.requestedAt,
      });
    }
  }
  const consentStatusByProfileId = new Map<string, ConsentStatus>(
    [...latestConsentByProfileId.entries()].map(([pid, { status }]) => [
      pid,
      status as ConsentStatus,
    ])
  );

  // --- GDPR Article 15: query all profile-scoped personal data ---
  const subjectRows =
    profileIds.length > 0
      ? await db.query.subjects.findMany({
          where: inArray(subjects.profileId, profileIds),
        })
      : [];

  const subjectIds = subjectRows.map((s) => s.id);

  const curriculaRows =
    subjectIds.length > 0
      ? await db.query.curricula.findMany({
          where: inArray(curricula.subjectId, subjectIds),
        })
      : [];

  const curriculumIds = curriculaRows.map((c) => c.id);

  const curriculumTopicRows =
    curriculumIds.length > 0
      ? await db.query.curriculumTopics.findMany({
          where: inArray(curriculumTopics.curriculumId, curriculumIds),
        })
      : [];

  const learningSessionRows =
    profileIds.length > 0
      ? await db.query.learningSessions.findMany({
          where: inArray(learningSessions.profileId, profileIds),
        })
      : [];

  const sessionEventRows =
    profileIds.length > 0
      ? await db.query.sessionEvents.findMany({
          where: inArray(sessionEvents.profileId, profileIds),
        })
      : [];

  const sessionSummaryRows =
    profileIds.length > 0
      ? await db.query.sessionSummaries.findMany({
          where: inArray(sessionSummaries.profileId, profileIds),
        })
      : [];

  const retentionCardRows =
    profileIds.length > 0
      ? await db.query.retentionCards.findMany({
          where: inArray(retentionCards.profileId, profileIds),
        })
      : [];

  const assessmentRows =
    profileIds.length > 0
      ? await db.query.assessments.findMany({
          where: inArray(assessments.profileId, profileIds),
        })
      : [];

  const xpLedgerRows =
    profileIds.length > 0
      ? await db.query.xpLedger.findMany({
          where: inArray(xpLedger.profileId, profileIds),
        })
      : [];

  const streakRows =
    profileIds.length > 0
      ? await db.query.streaks.findMany({
          where: inArray(streaks.profileId, profileIds),
        })
      : [];

  const notificationPrefRows =
    profileIds.length > 0
      ? await db.query.notificationPreferences.findMany({
          where: inArray(notificationPreferences.profileId, profileIds),
        })
      : [];

  const learningModeRows =
    profileIds.length > 0
      ? await db.query.learningModes.findMany({
          where: inArray(learningModes.profileId, profileIds),
        })
      : [];

  const teachingPrefRows =
    profileIds.length > 0
      ? await db.query.teachingPreferences.findMany({
          where: inArray(teachingPreferences.profileId, profileIds),
        })
      : [];

  const onboardingDraftRows =
    profileIds.length > 0
      ? await db.query.onboardingDrafts.findMany({
          where: inArray(onboardingDrafts.profileId, profileIds),
        })
      : [];

  const parkingLotRows =
    profileIds.length > 0
      ? await db.query.parkingLotItems.findMany({
          where: inArray(parkingLotItems.profileId, profileIds),
        })
      : [];

  const sessionEmbeddingRows =
    profileIds.length > 0
      ? await db.query.sessionEmbeddings.findMany({
          where: inArray(sessionEmbeddings.profileId, profileIds),
        })
      : [];

  const needsDeepeningTopicRows =
    profileIds.length > 0
      ? await db.query.needsDeepeningTopics.findMany({
          where: inArray(needsDeepeningTopics.profileId, profileIds),
        })
      : [];

  const familyLinkRows =
    profileIds.length > 0
      ? await db.query.familyLinks.findMany({
          where: or(
            inArray(familyLinks.parentProfileId, profileIds),
            inArray(familyLinks.childProfileId, profileIds)
          ),
        })
      : [];

  const subscriptionRows = await db.query.subscriptions.findMany({
    where: eq(subscriptions.accountId, accountId),
  });

  const subscriptionIds = subscriptionRows.map((s) => s.id);

  const quotaPoolRows =
    subscriptionIds.length > 0
      ? await db.query.quotaPools.findMany({
          where: inArray(quotaPools.subscriptionId, subscriptionIds),
        })
      : [];

  const topUpCreditRows =
    subscriptionIds.length > 0
      ? await db.query.topUpCredits.findMany({
          where: inArray(topUpCredits.subscriptionId, subscriptionIds),
        })
      : [];

  return {
    account: {
      email: account.email,
      createdAt: account.createdAt.toISOString(),
    },
    profiles: profileRows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      birthDate: row.birthDate
        ? row.birthDate.toISOString().split('T')[0]
        : null,
      personaType: row.personaType,
      isOwner: row.isOwner,
      consentStatus: consentStatusByProfileId.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    consentStates: consentRows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      consentType: row.consentType,
      status: row.status,
      parentEmail: row.parentEmail ?? null,
      requestedAt: row.requestedAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    })),
    subjects: subjectRows as Record<string, unknown>[],
    curricula: curriculaRows as Record<string, unknown>[],
    curriculumTopics: curriculumTopicRows as Record<string, unknown>[],
    learningSessions: learningSessionRows as Record<string, unknown>[],
    sessionEvents: sessionEventRows as Record<string, unknown>[],
    sessionSummaries: sessionSummaryRows as Record<string, unknown>[],
    retentionCards: retentionCardRows as Record<string, unknown>[],
    assessments: assessmentRows as Record<string, unknown>[],
    xpLedger: xpLedgerRows as Record<string, unknown>[],
    streaks: streakRows as Record<string, unknown>[],
    notificationPreferences: notificationPrefRows as Record<string, unknown>[],
    learningModes: learningModeRows as Record<string, unknown>[],
    teachingPreferences: teachingPrefRows as Record<string, unknown>[],
    onboardingDrafts: onboardingDraftRows as Record<string, unknown>[],
    parkingLotItems: parkingLotRows as Record<string, unknown>[],
    sessionEmbeddings: sessionEmbeddingRows as Record<string, unknown>[],
    subscriptions: subscriptionRows as Record<string, unknown>[],
    quotaPools: quotaPoolRows as Record<string, unknown>[],
    topUpCredits: topUpCreditRows as Record<string, unknown>[],
    needsDeepeningTopics: needsDeepeningTopicRows as Record<string, unknown>[],
    familyLinks: familyLinkRows as Record<string, unknown>[],
    exportedAt: new Date().toISOString(),
  };
}
