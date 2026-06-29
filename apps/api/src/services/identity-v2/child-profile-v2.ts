// ---------------------------------------------------------------------------
// WI-811 createChildProfileV2 — the v2 add-child orchestrator (CUT-B2). The
// v2 twin of services/profile.ts::createProfileWithLimitCheck for the
// PARENT-CREATED-CHILD path: a managed child `person` (login_id NULL), a
// learner `membership`, the owner→child `guardianship` edge, the per-profile
// `profile_quota_usage` satellite, and — when the child's age requires it — a
// CONSENTED `consent_grant` written DIRECTLY (no email workflow; the parent IS
// the consenting adult), ALL in ONE advisory-locked transaction.
//
// It is a strict SUBSET of createIdentityGraph (the owner bootstrap): no
// organization/login/subscription create, a learner (not admin) membership, and
// it adds the guardianship edge + the direct consent grant.
//
// SECURITY (cross-org): `organizationId` is ALWAYS the caller's resolved
// account.id (= organization.id), supplied by the route, never by the client
// (profileCreateSchema has no org field). The owner is resolved from THAT org
// via getOwnerProfileV2 (org-scoped), so the child can never be parented under
// a foreign org or to a foreign owner.
//
// SEQUENCING: the `profile_quota_usage` insert's satellite FKs target the
// LEGACY `subscriptions`/`profiles` tables until the convergence FK re-point
// (M-REPOINT, WI-586). The owner bootstrap already dual-writes retained legacy
// FK parents; this child writer mirrors that bridge for `profiles` so flag-on
// pre-repoint CI can exercise the real route.
// ---------------------------------------------------------------------------

import { sql } from 'drizzle-orm';
import {
  guardianship,
  membership,
  person,
  profiles,
  type Database,
} from '@eduagent/database';
import {
  ForbiddenError,
  type Profile,
  type ProfileCreateInput,
} from '@eduagent/schemas';
import { ConflictError } from '../../errors';
import { ProfileLimitError, ProfileValidationError } from '../profile';
import { checkConsentRequired, checkConsentRequiredFromDate } from '../consent';
import {
  canAddProfileV2,
  getSubscriptionByAccountIdV2,
  provisionProfileQuotaUsageV2,
} from '../billing/billing-v2';
import {
  buildValidatedBirthDate,
  locationToJurisdiction,
} from './identity-graph';
import { getOwnerProfileV2, jurisdictionToLocation } from './profile-v2';
import { createDirectConsentGrant } from './consent-v2';
import { calculateAge } from '../age-utils';

async function legacyProfilesTableExists(db: Database): Promise<boolean> {
  const raw = (await db.execute(
    sql`SELECT to_regclass('public.profiles') AS reg`,
  )) as unknown;
  const rows = Array.isArray(raw)
    ? (raw as Array<{ reg: string | null }>)
    : ((raw as { rows?: Array<{ reg: string | null }> }).rows ?? []);
  return rows[0]?.reg != null;
}

export interface CreateChildProfileV2Input {
  /**
   * The caller's resolved organization id (account.id = organization.id). MUST
   * come from the authenticated account, never from client input — this is the
   * cross-org isolation guard.
   */
  organizationId: string;
  input: ProfileCreateInput;
  /**
   * [OPT-C parity] Adult-owner gate. When true (default), adding a child
   * requires the existing owner to be >=18. Mirror the legacy flag plumbing:
   * the route reads `(c.env?.ADULT_OWNER_GATE_ENABLED) !== 'false'`.
   */
  adultOwnerGateEnabled: boolean;
}

/**
 * Create a parent-created child profile under the caller's organization.
 * Throws ProfileLimitError (at tier capacity), ForbiddenError/ADULT_OWNER_REQUIRED
 * (non-adult owner), or ConflictError (no owner — structurally broken graph).
 */
export async function createChildProfileV2(
  db: Database,
  { organizationId, input, adultOwnerGateEnabled }: CreateChildProfileV2Input,
): Promise<Profile> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Advisory lock per org — serializes concurrent child creations (TOCTOU on
    // the per-tier limit) without blocking unrelated orgs. Mirrors legacy.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`,
    );

    // Per-tier profile limit (a child is always a non-first profile).
    const sub = await getSubscriptionByAccountIdV2(txDb, organizationId);
    if (!sub || !(await canAddProfileV2(txDb, sub.id))) {
      throw new ProfileLimitError();
    }

    // Resolve the org's owner (org-scoped — the cross-org guard) for the adult
    // gate and the guardianship edge.
    const owner = await getOwnerProfileV2(txDb, organizationId);
    if (!owner) {
      // A resolved org with no admin owner is a structurally-broken graph; the
      // route guards this with a 409 before calling. Defend in depth.
      throw new ConflictError(
        'Cannot add a child to an organization without an owner.',
      );
    }
    // Adult-owner gate: the existing owner must be >=18 to add a child.
    // Year-only math via calculateAge() (UTC-safe currentYear - birthYear),
    // behavior-identical to the legacy createProfileWithLimitCheck gate and
    // consistent with birthYearSchema.
    // NOT computeAgeBracket() — AGENTS.md §Profile Shapes bans it for feature
    // gating (theming/copy only); this is a feature gate. Fail-closed on null.
    if (
      adultOwnerGateEnabled &&
      (owner.birthYear == null || calculateAge(owner.birthYear) < 18)
    ) {
      throw new ForbiddenError(
        'Account holder must be 18 or older to add a child profile.',
        'ADULT_OWNER_REQUIRED',
      );
    }
    const ownerPersonId = owner.id;

    // Consent/age check, computed BEFORE any write (mirrors legacy
    // createProfile order: limit → adult-gate → minimum-age floor). Use the
    // exact full date when WI-297 parts are present (so a year-only age of 13
    // cannot mask an exact age of 12), else year-only — both fail closed on a
    // null/0 birthYear (consent.ts F-029-sem).
    const consentCheck =
      input.birthMonth != null && input.birthDay != null
        ? checkConsentRequiredFromDate(
            input.birthYear,
            input.birthMonth,
            input.birthDay,
          )
        : checkConsentRequired(input.birthYear);

    // Enforce the v1 minimum-age floor (WI-570 / data-model.md §2A.5: 13+),
    // matching the legacy writer (services/profile.ts createProfile). Reject
    // below-minimum BEFORE inserting any rows.
    if (consentCheck.belowMinimumAge) {
      throw new ProfileValidationError(
        'CHILD_AGE_VIOLATION',
        'birthYear',
        'Users must be at least 13 years old to create a profile',
      );
    }

    // birth_date: exact full date when WI-297 parts present, else year-01-01.
    const birthDate =
      input.birthMonth != null && input.birthDay != null
        ? buildValidatedBirthDate(
            input.birthYear,
            input.birthMonth,
            input.birthDay,
          )
        : `${input.birthYear}-01-01`;

    // (1) managed child person — login_id stays NULL (no credential).
    const [childRow] = await txDb
      .insert(person)
      .values({
        displayName: input.displayName,
        birthDate,
        residenceJurisdiction: locationToJurisdiction(input.location ?? null),
        ...(input.conversationLanguage !== undefined
          ? { conversationLanguage: input.conversationLanguage }
          : {}),
        pronouns: input.pronouns ?? null,
        avatarUrl: input.avatarUrl ?? null,
      })
      .returning();
    if (!childRow) throw new Error('child person insert did not return a row');

    // (2) Pre-M-REPOINT bridge for retained quota/profile satellites whose FKs
    // still target legacy profiles(id). Remove with the FK convergence drop.
    if (await legacyProfilesTableExists(txDb)) {
      await txDb.insert(profiles).values({
        id: childRow.id,
        accountId: organizationId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        birthYear: input.birthYear,
        location: input.location ?? null,
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: input.conversationLanguage ?? 'en',
        pronouns: input.pronouns ?? null,
      });
    }

    // (3) learner membership scoped to the caller's org.
    await txDb.insert(membership).values({
      personId: childRow.id,
      organizationId,
      roles: ['learner'],
    });

    // (4) owner→child guardianship edge. MUST precede the consent grant — the
    // grant treats the edge as a precondition (consent-v2.ts inv 14).
    const [edge] = await txDb
      .insert(guardianship)
      .values({
        guardianPersonId: ownerPersonId,
        chargePersonId: childRow.id,
      })
      .returning();
    if (!edge) throw new Error('guardianship insert did not return a row');

    // (5) per-profile quota satellite (role child).
    await provisionProfileQuotaUsageV2(txDb, sub.id, childRow.id, 'child');

    // (6) direct consent grant when the child's age requires it (consentCheck
    // computed above). The parent is the consenting adult, so the grant is
    // written CONSENTED with no email loop.
    let consented = false;
    if (consentCheck.required && consentCheck.consentType) {
      await createDirectConsentGrant(
        txDb,
        childRow.id,
        organizationId,
        consentCheck.consentType,
        ownerPersonId,
        {
          ageAtGrant: consentCheck.age,
          jurisdictionAtGrant: childRow.residenceJurisdiction ?? undefined,
        },
      );
      consented = true;
    }

    return {
      id: childRow.id,
      accountId: organizationId, // account.id = organization.id
      displayName: childRow.displayName,
      avatarUrl: childRow.avatarUrl ?? null,
      birthYear: Number(childRow.birthDate.slice(0, 4)),
      location: jurisdictionToLocation(childRow.residenceJurisdiction),
      isOwner: false,
      hasPremiumLlm: false,
      defaultAppContext:
        (childRow.defaultAppContext as Profile['defaultAppContext']) ?? null,
      hasFamilyLinks: true,
      conversationLanguage:
        childRow.conversationLanguage as Profile['conversationLanguage'],
      pronouns: childRow.pronouns ?? null,
      consentStatus: consented ? 'CONSENTED' : null,
      linkCreatedAt: edge.grantedAt.toISOString(),
      createdAt: childRow.createdAt.toISOString(),
      updatedAt: childRow.updatedAt.toISOString(),
    };
  });
}
