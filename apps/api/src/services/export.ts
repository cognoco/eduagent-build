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
  parkingLotItems,
  needsDeepeningTopics,
  familyLinks,
  learningProfiles,
  subscriptions,
  quotaPools,
  topUpCredits,
  mentorActivityLedger,
  type Database,
} from '@eduagent/database';
import type { DataExport, ConsentStatus, Profile } from '@eduagent/schemas';
import { projectAiResponseContent } from './llm/project-response';

/**
 * [BUG-413] Walk a Drizzle row (Record<string, unknown>) and convert any JS
 * Date values to ISO-8601 strings so the row can be safely passed through
 * dataExportSchema.parse() and JSON.stringify().
 *
 * Without this, tables cast as `Record<string, unknown>[]` pass Date objects
 * directly into the export payload.  zod's `z.record(z.string(), z.unknown())`
 * schema accepts them silently, but the downstream JSON serialisation emits a
 * string (JSON.stringify calls toISOString internally), while any caller that
 * does a strict equality check or feeds the value into a Date constructor gets
 * the raw Date object rather than a string — causing inconsistent behaviour.
 *
 * The fix is explicit: walk every row before returning it so the export payload
 * is always string-typed for date fields, regardless of what the DB driver
 * returns.
 */
export function serializeDates(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

const EMBEDDED_ENVELOPE_KEYS = new Set([
  'reply',
  'signals',
  'ui_hints',
  'private_sources',
  'confidence',
]);
const EMBEDDED_ENVELOPE_SIBLING_KEYS = new Set([
  'signals',
  'ui_hints',
  'private_sources',
  'confidence',
]);

function isEmbeddedEnvelopeObject(candidate: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return false;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    typeof record['reply'] === 'string' &&
    record['reply'].length > 0 &&
    keys.every((key) => EMBEDDED_ENVELOPE_KEYS.has(key)) &&
    keys.some((key) => EMBEDDED_ENVELOPE_SIBLING_KEYS.has(key))
  );
}

function findJsonObjectSpans(
  text: string,
): Array<{ start: number; end: number; value: string }> {
  const spans: Array<{ start: number; end: number; value: string }> = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const start = text.indexOf('{', searchFrom);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let found = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const end = i + 1;
          spans.push({ start, end, value: text.slice(start, end) });
          searchFrom = end;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      searchFrom = start + 1;
    }
  }

  return spans;
}

function projectSessionEmbeddingContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('```')) {
    return projectAiResponseContent(content, { silent: true });
  }

  const spans = findJsonObjectSpans(content);
  if (spans.length > 0) {
    let out = '';
    let cursor = 0;
    let changed = false;

    for (const span of spans) {
      out += content.slice(cursor, span.start);
      if (isEmbeddedEnvelopeObject(span.value)) {
        const projected = projectAiResponseContent(span.value, {
          silent: true,
        });
        out += projected;
        changed = changed || projected !== span.value;
      } else {
        out += span.value;
      }
      cursor = span.end;
    }

    if (changed) {
      return out + content.slice(cursor);
    }
  }

  return projectAiResponseContent(content, { silent: true });
}

export async function generateExport(
  db: Database,
  accountId: string,
  // [WI-809] When the v2 export twin (export-v2.ts) calls this for the
  // learning-data half, it supplies the org's profileIds (= person ids) so we
  // skip the legacy identity tables dropped at the cutover (accounts / profiles
  // / consent_states / family_links). [WI-805] The legacy `subscriptions`
  // billing chain is ALSO skipped on this path (it is dropped by 0119) — the v2
  // caller overrides subscriptions / quotaPools / topUpCredits from the v2
  // `subscription` chain. The identity + billing sections of the returned
  // DataExport are then empty placeholders the v2 caller overrides; only the
  // learning-data arrays it spreads are consumed. Omitting opts (every flag-off
  // caller) is byte-identical to the pre-WI-809 behavior.
  opts?: { learningOnlyProfileIds?: string[] },
): Promise<DataExport> {
  const learningOnly = opts?.learningOnlyProfileIds;

  const account = learningOnly
    ? null
    : await db.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
      });

  if (!learningOnly && !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const profileRows = learningOnly
    ? []
    : await db.query.profiles.findMany({
        where: eq(profiles.accountId, accountId),
      });

  const profileIds = learningOnly ?? profileRows.map((p) => p.id);

  const consentRows =
    !learningOnly && profileIds.length > 0
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
    ]),
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

  // [BUG-912] Intentionally reads RAW streak rows (not findCurrentForToday) —
  // user-data export must reflect the actual stored truth, not a derived
  // display value. Display paths must use repo.streaks.findCurrentForToday().
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
    !learningOnly && profileIds.length > 0
      ? await db.query.familyLinks.findMany({
          where: or(
            inArray(familyLinks.parentProfileId, profileIds),
            inArray(familyLinks.childProfileId, profileIds),
          ),
        })
      : [];

  const linkCreatedAtByChildId = new Map(
    familyLinkRows.map((link) => [link.childProfileId, link.createdAt]),
  );
  const linkedParentIds = new Set(
    familyLinkRows.map((link) => link.parentProfileId),
  );
  const linkedChildIds = new Set(
    familyLinkRows.map((link) => link.childProfileId),
  );

  const learningProfileRows =
    profileIds.length > 0
      ? await db.query.learningProfiles.findMany({
          where: inArray(learningProfiles.profileId, profileIds),
        })
      : [];

  // [WI-805] Billing is part of the learning-only skip too: the v2 export twin
  // overrides subscriptions / quotaPools / topUpCredits from the v2
  // `subscription` chain, so the legacy `subscriptions` read must NOT run on the
  // learning-only path — post-0119-drop it would 500 (`relation "subscriptions"
  // does not exist`). subscriptionIds = [] then cascades quotaPools /
  // topUpCredits to [] via their existing length guards below.
  const subscriptionRows = learningOnly
    ? []
    : await db.query.subscriptions.findMany({
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

  // [WI-679] GDPR Art-15 gap: mentor_activity_ledger was missing from the
  // export — erasure via FK cascade was covered but portability was not.
  const mentorActivityLedgerRows =
    profileIds.length > 0
      ? await db.query.mentorActivityLedger.findMany({
          where: inArray(mentorActivityLedger.profileId, profileIds),
        })
      : [];

  return {
    // [WI-809] account is null only on the learning-only v2 path, where the v2
    // caller overrides this section; a placeholder keeps the shape valid.
    account: account
      ? {
          email: account.email,
          createdAt: account.createdAt.toISOString(),
        }
      : { email: '', createdAt: new Date(0).toISOString() },
    profiles: profileRows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      birthYear: row.birthYear,
      location: row.location ?? null,
      isOwner: row.isOwner,
      hasPremiumLlm: row.hasPremiumLlm,
      defaultAppContext:
        (row.defaultAppContext as Profile['defaultAppContext']) ?? null,
      hasFamilyLinks: row.isOwner
        ? linkedParentIds.has(row.id)
        : linkedChildIds.has(row.id),
      // BKT-C.1 — include the new personalization dimensions in the GDPR
      // export. The CHECK constraint on conversation_language guarantees the
      // value is one of the 8 codes; cast narrows Drizzle's `string` to the
      // schema enum.
      conversationLanguage:
        row.conversationLanguage as Profile['conversationLanguage'],
      pronouns: row.pronouns ?? null,
      consentStatus: consentStatusByProfileId.get(row.id) ?? null,
      linkCreatedAt: linkCreatedAtByChildId.get(row.id)?.toISOString() ?? null,
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
    // [BUG-413] Apply serializeDates to every row so Date objects from the
    // Drizzle / neon-serverless driver are converted to ISO strings before
    // they reach the export payload.  Without this, rows passed as
    // `Record<string, unknown>[]` carry raw Date values that behave
    // inconsistently across zod parse, JSON.stringify, and callers.
    subjects: subjectRows.map(serializeDates),
    curricula: curriculaRows.map(serializeDates),
    curriculumTopics: curriculumTopicRows.map(serializeDates),
    learningSessions: learningSessionRows.map(serializeDates),
    sessionEvents: sessionEventRows.map((row) => {
      const serialized = serializeDates(row as Record<string, unknown>);
      if (
        serialized['eventType'] === 'ai_response' &&
        typeof serialized['content'] === 'string'
      ) {
        return {
          ...serialized,
          content: projectAiResponseContent(serialized['content'] as string, {
            silent: true,
          }),
        };
      }
      return serialized;
    }),
    sessionSummaries: sessionSummaryRows.map(serializeDates),
    retentionCards: retentionCardRows.map(serializeDates),
    assessments: assessmentRows.map(serializeDates),
    xpLedger: xpLedgerRows.map(serializeDates),
    streaks: streakRows.map(serializeDates),
    notificationPreferences: notificationPrefRows.map(serializeDates),
    learningModes: learningModeRows.map(serializeDates),
    teachingPreferences: teachingPrefRows.map(serializeDates),
    parkingLotItems: parkingLotRows.map(serializeDates),
    sessionEmbeddings: sessionEmbeddingRows.map((row) => {
      const serialized = serializeDates(row);
      if (typeof serialized['content'] !== 'string') {
        return serialized;
      }
      return {
        ...serialized,
        content: projectSessionEmbeddingContent(serialized['content']),
      };
    }),
    subscriptions: subscriptionRows.map(serializeDates),
    quotaPools: quotaPoolRows.map(serializeDates),
    topUpCredits: topUpCreditRows.map(serializeDates),
    needsDeepeningTopics: needsDeepeningTopicRows.map(serializeDates),
    familyLinks: familyLinkRows.map(serializeDates),
    learningProfiles: learningProfileRows.map((row) => ({
      ...row,
      consentPromptDismissedAt:
        row.consentPromptDismissedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })) as DataExport['learningProfiles'],
    mentorActivityLedger: mentorActivityLedgerRows.map(serializeDates),
    exportedAt: new Date().toISOString(),
  };
}
