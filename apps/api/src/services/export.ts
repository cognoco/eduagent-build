// ---------------------------------------------------------------------------
// Data Export Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { inArray } from 'drizzle-orm';
import {
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
  learningProfiles,
  mentorActivityLedger,
  type Database,
} from '@eduagent/database';
import {
  dataExportAssessmentRowSchema,
  dataExportSubjectRowSchema,
  dataExportCurriculumRowSchema,
  dataExportCurriculumTopicRowSchema,
  dataExportLearningSessionRowSchema,
  dataExportSessionEventRowSchema,
  dataExportSessionSummaryRowSchema,
  dataExportRetentionCardRowSchema,
  dataExportXpLedgerRowSchema,
  dataExportStreakRowSchema,
  dataExportNotificationPreferenceRowSchema,
  dataExportLearningModeRowSchema,
  dataExportTeachingPreferenceRowSchema,
  dataExportParkingLotItemRowSchema,
  dataExportSessionEmbeddingRowSchema,
  dataExportNeedsDeepeningTopicRowSchema,
  dataExportMentorActivityLedgerRowSchema,
} from '@eduagent/schemas';
import type { DataExport } from '@eduagent/schemas';
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
  // [WI-1364] `accountId` is retained for caller-shape stability — the sole
  // caller (identity-v2/export-v2.ts) passes the org id positionally — but is
  // UNUSED post-gut. The legacy identity/billing reads that consumed it
  // (accounts / profiles / consent_states / family_links / subscriptions) were
  // dead code: every production call supplies `learningOnlyProfileIds`, which
  // short-circuited all of them, so those `else` branches were removed (WI-1364
  // dead-sweep). This function now produces only the learning-data half keyed on
  // `learningOnlyProfileIds`; the identity + billing sections are empty
  // placeholders the v2 caller (export-v2) overrides.
  opts?: { learningOnlyProfileIds?: string[] },
): Promise<DataExport> {
  const profileIds = opts?.learningOnlyProfileIds ?? [];

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

  const learningProfileRows =
    profileIds.length > 0
      ? await db.query.learningProfiles.findMany({
          where: inArray(learningProfiles.profileId, profileIds),
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
    // [WI-1364] identity/billing placeholders — the sole caller (export-v2)
    // overrides account / profiles / consentStates / familyLinks / subscriptions
    // / quotaPools / topUpCredits from the v2 chain; only the learning-data
    // arrays below are consumed.
    account: { email: '', createdAt: new Date(0).toISOString() },
    profiles: [],
    consentStates: [],
    // [BUG-413] Apply serializeDates to every row so Date objects from the
    // Drizzle / neon-serverless driver are converted to ISO strings before
    // they reach the export payload.  Without this, rows passed as
    // `Record<string, unknown>[]` carry raw Date values that behave
    // inconsistently across zod parse, JSON.stringify, and callers.
    subjects: subjectRows.map((row) =>
      dataExportSubjectRowSchema.parse(serializeDates(row)),
    ),
    curricula: curriculaRows.map((row) =>
      dataExportCurriculumRowSchema.parse(serializeDates(row)),
    ),
    curriculumTopics: curriculumTopicRows.map((row) =>
      dataExportCurriculumTopicRowSchema.parse(serializeDates(row)),
    ),
    learningSessions: learningSessionRows.map((row) =>
      dataExportLearningSessionRowSchema.parse(serializeDates(row)),
    ),
    sessionEvents: sessionEventRows.map((row) => {
      const serialized = serializeDates(row as Record<string, unknown>);
      if (
        serialized['eventType'] === 'ai_response' &&
        typeof serialized['content'] === 'string'
      ) {
        return dataExportSessionEventRowSchema.parse({
          ...serialized,
          content: projectAiResponseContent(serialized['content'] as string, {
            silent: true,
          }),
        });
      }
      return dataExportSessionEventRowSchema.parse(serialized);
    }),
    sessionSummaries: sessionSummaryRows.map((row) =>
      dataExportSessionSummaryRowSchema.parse(serializeDates(row)),
    ),
    retentionCards: retentionCardRows.map((row) =>
      dataExportRetentionCardRowSchema.parse(serializeDates(row)),
    ),
    assessments: assessmentRows.map((row) =>
      dataExportAssessmentRowSchema.parse(serializeDates(row)),
    ),
    xpLedger: xpLedgerRows.map((row) =>
      dataExportXpLedgerRowSchema.parse(serializeDates(row)),
    ),
    streaks: streakRows.map((row) =>
      dataExportStreakRowSchema.parse(serializeDates(row)),
    ),
    notificationPreferences: notificationPrefRows.map((row) =>
      dataExportNotificationPreferenceRowSchema.parse(serializeDates(row)),
    ),
    learningModes: learningModeRows.map((row) =>
      dataExportLearningModeRowSchema.parse(serializeDates(row)),
    ),
    teachingPreferences: teachingPrefRows.map((row) =>
      dataExportTeachingPreferenceRowSchema.parse(serializeDates(row)),
    ),
    parkingLotItems: parkingLotRows.map((row) =>
      dataExportParkingLotItemRowSchema.parse(serializeDates(row)),
    ),
    sessionEmbeddings: sessionEmbeddingRows.map((row) => {
      const serialized = serializeDates(row);
      if (typeof serialized['content'] !== 'string') {
        return dataExportSessionEmbeddingRowSchema.parse(serialized);
      }
      return dataExportSessionEmbeddingRowSchema.parse({
        ...serialized,
        content: projectSessionEmbeddingContent(serialized['content']),
      });
    }),
    subscriptions: [],
    quotaPools: [],
    topUpCredits: [],
    needsDeepeningTopics: needsDeepeningTopicRows.map((row) =>
      dataExportNeedsDeepeningTopicRowSchema.parse(serializeDates(row)),
    ),
    familyLinks: [],
    learningProfiles: learningProfileRows.map((row) => ({
      ...row,
      consentPromptDismissedAt:
        row.consentPromptDismissedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })) as DataExport['learningProfiles'],
    mentorActivityLedger: mentorActivityLedgerRows.map((row) =>
      dataExportMentorActivityLedgerRowSchema.parse(serializeDates(row)),
    ),
    exportedAt: new Date().toISOString(),
  };
}
