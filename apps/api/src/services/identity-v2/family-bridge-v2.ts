// ---------------------------------------------------------------------------
// WP-6 family-bridge-v2 — HIGH-severity guardianship authorization guards
// (enumeration §4.3–4.5). The v2 twins of the synchronous, route-facing family
// guards that legacy `family-access.ts` / `family-bridge.ts` expose:
//
//   §4.3 validateGuardianshipEdgeV2          — twin of family-access hasParentAccess
//   §4.4 validateGuardianChargeRelationshipV2 — twin of family-access assertParentAccess
//   §4.5 getChargeSubjectsForGuardianV2       — twin of family-bridge getChildTopicSnapshotForParent
//
// The legacy guards read `family_links` (parent_profile_id × child_profile_id)
// and the cross-person snapshot joins `subjects → profiles`. The v2 twins read
// the ratified `guardianship` edge (guardian_person_id × charge_person_id,
// revoked_at IS NULL = active — docs/canon/identity/data-model.md §4.6) and join
// `subjects → person`. person.id = profiles.id throughout (canon §2), so the
// guardian/charge ids ARE the legacy parent/child profile ids unchanged, and the
// subject-owner scope key (`subjects.profile_id`) is the charge's person id.
//
// SECURITY (the cross-person authorization boundary). Every cross-person read
// here is gated on the active guardianship edge: the guard verifies the
// (guardian, charge) edge BEFORE any subject/topic row is exposed. The edge check
// is the IDOR guard — an unrelated guardian holds no edge over another guardian's
// charge, so the active-edge predicate denies the cross-person read. This module
// never re-implements the edge primitive: it composes `isGuardianOf` from the
// CUT-B2 guardianship read module (single source of truth).
//
// FLAG-GATED via the calling seam (the family-surface routes branch on
// `isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED)`); legacy stays intact until
// WP-FLAG.
// ---------------------------------------------------------------------------

import { and, eq } from 'drizzle-orm';
import {
  curriculumBooks,
  curriculumTopics,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import type { ChildTopicSnapshot } from '@eduagent/schemas';
import { ForbiddenError } from '../../errors';
import { hashTopicDescription, sourceAgeBracket } from '../family-bridge';
import { isGuardianOf } from './guardianship';

/**
 * §4.3 — the v2 `hasParentAccess`: true when `guardianPersonId` holds an ACTIVE
 * guardianship edge over `chargePersonId`. Delegates to the CUT-B2 edge primitive
 * (`isGuardianOf`) — the single source of truth for the active-edge predicate.
 * The boolean form, for callers that branch on access rather than assert it.
 */
export async function validateGuardianshipEdgeV2(
  db: Database,
  guardianPersonId: string,
  chargePersonId: string,
): Promise<boolean> {
  return isGuardianOf(db, guardianPersonId, chargePersonId);
}

/**
 * §4.4 — the v2 `assertParentAccess`: throws `ForbiddenError` when
 * `guardianPersonId` holds NO active guardianship edge over `chargePersonId`.
 * Preferred over the boolean form at call sites that must deny — a missing check
 * is a compile-time unused-variable error or a runtime crash, never a silent
 * access bypass (mirrors the legacy assertParentAccess contract + message).
 */
export async function validateGuardianChargeRelationshipV2(
  db: Database,
  guardianPersonId: string,
  chargePersonId: string,
): Promise<void> {
  if (
    !(await validateGuardianshipEdgeV2(db, guardianPersonId, chargePersonId))
  ) {
    throw new ForbiddenError('You do not have access to this child profile.');
  }
}

/**
 * §4.5 — the v2 `getChildTopicSnapshotForParent`: the cross-person subject/topic
 * data read a guardian makes against a charge's curriculum (the "Learn this too"
 * bridge snapshot). Verifies the active guardianship edge FIRST (throws
 * `ForbiddenError` on no edge — the cross-person data-leak guard), then reads the
 * topic scoped to the charge's own subjects (`subjects.profile_id = chargePersonId`).
 *
 * Returns null when no such topic belongs to the charge (the topic exists under a
 * different person, or not at all) — the scoped read, byte-identical to the legacy
 * snapshot shape. childDisplayName / birthYear come from `person` (the v2 re-home
 * of the legacy `profiles.display_name` / `profiles.birth_year` reads); birthYear
 * is derived from `person.birth_date` (canon §2B.3).
 */
export async function getChargeSubjectsForGuardianV2(
  db: Database,
  guardianPersonId: string,
  chargePersonId: string,
  topicId: string,
): Promise<ChildTopicSnapshot | null> {
  // The cross-person authorization gate — deny BEFORE exposing any subject row.
  await validateGuardianChargeRelationshipV2(
    db,
    guardianPersonId,
    chargePersonId,
  );

  const [row] = await db
    .select({
      chargePersonId: person.id,
      childDisplayName: person.displayName,
      childBirthDate: person.birthDate,
      subjectName: subjects.name,
      subjectLanguage: subjects.languageCode,
      bookTitle: curriculumBooks.title,
      topicTitle: curriculumTopics.title,
      topicDescription: curriculumTopics.description,
      estimatedMinutes: curriculumTopics.estimatedMinutes,
    })
    .from(curriculumTopics)
    .innerJoin(curriculumBooks, eq(curriculumTopics.bookId, curriculumBooks.id))
    .innerJoin(subjects, eq(curriculumBooks.subjectId, subjects.id))
    .innerJoin(person, eq(subjects.profileId, person.id))
    .where(
      and(
        eq(curriculumTopics.id, topicId),
        // Scope key: the topic must belong to the charge's own subjects.
        eq(subjects.profileId, chargePersonId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    childProfileId: row.chargePersonId,
    childDisplayName: row.childDisplayName,
    subjectName: row.subjectName,
    subjectLanguage: row.subjectLanguage,
    bookTitle: row.bookTitle,
    bookAuthor: null,
    topicTitle: row.topicTitle,
    topicDescription: row.topicDescription,
    topicDescriptionHash: hashTopicDescription(
      row.topicTitle,
      row.topicDescription,
    ),
    estimatedMinutes: row.estimatedMinutes,
    sourceAgeBracket: sourceAgeBracket(Number(row.childBirthDate.slice(0, 4))),
  };
}
