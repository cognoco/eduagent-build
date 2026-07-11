// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, isNull } from 'drizzle-orm';
import {
  guardianship,
  membership,
  person,
  type Database,
} from '@eduagent/database';
import { getChargePersonIds } from './identity-v2/guardianship';
import {
  resolveLatestConsentStatusAnyBasis,
  DEFAULT_CONSENT_PURPOSE,
} from './identity-v2/consent-status-v2';
import {
  jurisdictionToLocation,
  birthYearFromDate,
  birthMonthDayFromDate,
} from './identity-v2/profile-v2';
import type { AppContext, Profile } from '@eduagent/schemas';
import { computeAgeBracketFromDate, ForbiddenError } from '@eduagent/schemas';
export type ProfileValidationCode = 'CHILD_AGE_VIOLATION';

export class ProfileValidationError extends Error {
  code: ProfileValidationCode;
  field: string;

  constructor(code: ProfileValidationCode, field: string, message: string) {
    super(message);
    this.name = 'ProfileValidationError';
    this.code = code;
    this.field = field;
  }
}
export class ProfileLimitError extends Error {
  constructor() {
    super('Profile limit exceeded');
    this.name = 'ProfileLimitError';
  }
}

export async function updateProfileAppContext(
  db: Database,
  profileId: string,
  accountId: string,
  defaultAppContext: AppContext,
): Promise<Profile | null> {
  // [WI-586] v2 path: read/write person + membership; no profiles/family_links touch.
  // accountId maps to organizationId in v2.
  const organizationId = accountId;
  const [existingPerson, existingMembership] = await Promise.all([
    db.query.person.findFirst({
      where: and(eq(person.id, profileId), isNull(person.archivedAt)),
      columns: { id: true, birthDate: true },
    }),
    db.query.membership.findFirst({
      where: and(
        eq(membership.personId, profileId),
        eq(membership.organizationId, organizationId),
      ),
      columns: { roles: true },
    }),
  ]);
  if (!existingPerson || !existingMembership) return null;

  const isOwner = existingMembership.roles.includes('admin');
  // [WI-367] Exact-date family-mode gate. Year-only math (currentYear -
  // birthYear) overestimates age by up to 11 months, which could let a
  // 17-year-old owner (birthday not yet passed) switch into family mode.
  // NOT computeAgeBracket() — AGENTS.md §Profile Shapes bans year-only math
  // for feature gating (theming/copy only); this is a feature gate.
  const birthYear = birthYearFromDate(existingPerson.birthDate);
  const { birthMonth, birthDay } = birthMonthDayFromDate(
    existingPerson.birthDate,
  );

  if (defaultAppContext === 'family') {
    const charges = await getChargePersonIds(db, profileId);
    if (
      !isOwner ||
      computeAgeBracketFromDate(
        birthYear,
        birthMonth ?? undefined,
        birthDay ?? undefined,
      ) !== 'adult' ||
      charges.length === 0
    ) {
      throw new ForbiddenError(
        'Family mode is only available to adult owner profiles with family links.',
        'FAMILY_CONTEXT_NOT_ALLOWED',
      );
    }
  }

  const updated = await db
    .update(person)
    .set({ defaultAppContext, updatedAt: new Date() })
    .where(and(eq(person.id, profileId), isNull(person.archivedAt)))
    .returning();
  if (!updated[0]) return null;

  // Resolve family meta and consent in parallel.
  // owner/guardian → hasFamilyLinks if any active charge; linkCreatedAt null
  // non-owner/charge → hasFamilyLinks if active guardian edge; linkCreatedAt = edge.grantedAt
  const [consentStatus, chargeIds, guardianEdge] = await Promise.all([
    resolveLatestConsentStatusAnyBasis(
      db,
      profileId,
      organizationId,
      DEFAULT_CONSENT_PURPOSE,
    ),
    isOwner
      ? getChargePersonIds(db, profileId)
      : Promise.resolve([] as string[]),
    !isOwner
      ? db.query.guardianship.findFirst({
          where: and(
            eq(guardianship.chargePersonId, profileId),
            isNull(guardianship.revokedAt),
          ),
          columns: { grantedAt: true },
        })
      : Promise.resolve(undefined),
  ]);

  const hasFamilyLinks = isOwner ? chargeIds.length > 0 : guardianEdge != null;
  const linkCreatedAt =
    !isOwner && guardianEdge ? guardianEdge.grantedAt.toISOString() : null;

  const p = updated[0];
  return {
    id: p.id,
    accountId: organizationId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl ?? null,
    birthYear,
    birthMonth,
    birthDay,
    location: jurisdictionToLocation(p.residenceJurisdiction),
    isOwner,
    hasPremiumLlm: false,
    defaultAppContext:
      (p.defaultAppContext as Profile['defaultAppContext']) ?? null,
    hasFamilyLinks,
    conversationLanguage:
      p.conversationLanguage as Profile['conversationLanguage'],
    pronouns: p.pronouns ?? null,
    consentStatus,
    linkCreatedAt,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
