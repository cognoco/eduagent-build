// ---------------------------------------------------------------------------
// Family Access Service
// ---------------------------------------------------------------------------
// Shared helper for "can parent X manage child Y?" guards used by routes
// that expose parent-scoped endpoints (e.g., learner-profile child routes).
// Route files must not import ORM primitives or schema tables directly.

import { eq, inArray } from 'drizzle-orm';
import { login, type Database } from '@eduagent/database';
import { ForbiddenError } from '../errors';
import { calculateAge } from './age-utils';
import type { ProfileMeta } from '../middleware/profile-scope';
import {
  validateGuardianshipEdgeV2,
  validateGuardianChargeRelationshipV2,
} from './identity-v2/family-bridge-v2';
import {
  verifyPersonIsOrgAdminV2,
  verifyPersonOwnershipV2,
} from './identity-v2/ownership-v2';
import { captureException } from './sentry';

type ProfileMetaSource = {
  get(key: 'profileMeta'): ProfileMeta | undefined;
};

type OwnConsentProfileMeta = {
  birthYear?: number | null;
  isOwner?: boolean;
  resolvedVia?: ProfileMeta['resolvedVia'];
};

type CallerOwnerSource = {
  get(key: 'db'): Database;
  get(key: 'account'): { id: string } | undefined;
  get(key: 'callerPersonId'): string | undefined;
};

/**
 * Returns true if the authenticated parent profile has authority over the
 * given child profile. Delegates to the v2 guardianship edge
 * (`revoked_at IS NULL`). The boolean form for callers that branch on access.
 */
export async function hasParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<boolean> {
  return validateGuardianshipEdgeV2(db, parentProfileId, childProfileId);
}

/**
 * Throws `ForbiddenError` when `parentProfileId` has no authority over
 * `childProfileId`. Preferred over the return-type pattern because a missing
 * check is a compile-time error (unused variable) or runtime crash, not a
 * silent access bypass.
 */
export async function assertParentAccess(
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  return validateGuardianChargeRelationshipV2(
    db,
    parentProfileId,
    childProfileId,
  );
}

/**
 * Operational guardian access is suppressed once the charge has their own
 * Login. Consent-authority is the explicit exception and must not call this
 * guard (MMT-ADR-0008; OPQ-32).
 */
export async function assertChargeNotCredentialed(
  db: Database,
  chargePersonId: string,
): Promise<void> {
  const [credential] = await db
    .select({ personId: login.personId })
    .from(login)
    .where(eq(login.personId, chargePersonId))
    .limit(1);
  if (credential) {
    throw new ForbiddenError(
      'Guardians cannot access a credentialed charge through managed-child surfaces.',
    );
  }
}

export async function filterUncredentialedCharges(
  db: Database,
  personIds: string[],
): Promise<string[]> {
  if (personIds.length === 0) return [];

  const credentialedRows = await db
    .select({ personId: login.personId })
    .from(login)
    .where(inArray(login.personId, personIds));
  const credentialedIds = new Set(credentialedRows.map((row) => row.personId));
  return personIds.filter((personId) => !credentialedIds.has(personId));
}

/**
 * [CR-2026-05-21-010] Guard for self-routes that mutate consent or collection
 * state on the caller's own learner profile.
 *
 * A non-owner MINOR child (isOwner:false and under 18) must NOT be able to
 * override parental consent decisions — e.g. wipe memory or toggle collection
 * — because the parent-on-behalf routes already require assertOwnerAndParentAccess.
 * Allowing the child to toggle the same switches on self would bypass the parent gate.
 *
 * Permitted callers:
 *   - Account owner profiles (isOwner === true), regardless of age.
 *   - Non-owner profiles that are 18+ adults (birthYear resolves to age >= 18).
 *     An adult sibling on a family plan can manage their own consent.
 *
 * Blocked callers:
 *   - Non-owner profiles under 18 (minor child on a parent's account).
 *   - Any profile where birthYear is missing/null (fail closed).
 *
 * Accepts the already-resolved profile metadata from route context. Keep Hono
 * out of this helper so consent authorization remains framework-independent.
 */
export function assertCanManageOwnConsent<
  T extends OwnConsentProfileMeta | undefined,
>(profileMeta: T): void {
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER profile (isOwner:true) when no X-Profile-Id
  // header is sent. Because the synthesized identity IS the owner, BOTH the
  // isOwner early-return below AND the adult-fallthrough would pass for a
  // headerless caller (privilege escalation). Consent management therefore
  // requires an explicitly selected, verified profile. A legit adult non-owner
  // still works: they send their OWN X-Profile-Id → resolvedVia:'explicit-header',
  // isOwner:false → falls to the age check → adult → permitted.
  if (profileMeta?.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(
      'Consent management requires an explicitly selected profile.',
    );
  }
  if (profileMeta.isOwner === true) {
    // Account owner always allowed to manage own consent.
    return;
  }
  // Non-owner: only allow if they are a verified adult (18+).
  // birthYear is non-null post-Epic 12 (NOT NULL column, migration 0017) but
  // we fail closed if somehow absent.
  const birthYear = profileMeta?.birthYear;
  if (birthYear == null) {
    throw new ForbiddenError(
      'Consent management requires a verified owner or adult profile.',
    );
  }
  // Use the canonical calculateAge() (getUTCFullYear-based) so this consent
  // age-gate shares one definition with calculateAge (age-utils.ts) and
  // getProfileAge (profile.ts). A local getFullYear() could disagree by a
  // year at the 18 boundary depending on host timezone.
  const age = calculateAge(birthYear);
  if (age < 18) {
    throw new ForbiddenError(
      'Minor profiles on a parent account cannot modify consent or collection settings. Ask your parent or guardian to make this change.',
    );
  }
  // Non-owner adult (18+): permitted.
}

/**
 * [CR-2026-05-19-H1] Combined owner + parent-access guard for routes that
 * perform parent-administrative actions on a child profile.
 *
 * 1. Checks that the active profile is the account owner (isOwner === true).
 *    A non-owner profile (child on a parent's account) cannot perform
 *    administrative actions even if a family link exists.
 * 2. Then delegates to assertParentAccess to verify the parent->child link
 *    (IDOR protection -- the owner cannot touch an unrelated child).
 *
 * Use this instead of bare assertParentAccess on all parent-admin routes so
 * that both guards fire at every call site without callers remembering to
 * add the isOwner check manually.
 *
 * The source parameter accepts the narrow getter shape exposed by route
 * context. Keep Hono out of this service so the guard remains framework-free.
 */
export async function assertOwnerAndParentAccess(
  source: ProfileMetaSource,
  db: Database,
  parentProfileId: string,
  childProfileId: string,
): Promise<void> {
  const profileMeta = source.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER (isOwner:true) when no X-Profile-Id header
  // is sent — so an authenticated NON-OWNER caller could omit the header to
  // satisfy the isOwner check above (privilege escalation). Parent-admin actions
  // on child profiles require an explicitly selected, verified owner profile.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(
      'Only the account owner can perform administrative actions on child profiles.',
    );
  }
  await assertParentAccess(db, parentProfileId, childProfileId);
}

export function assertOwnerProfile(
  source: ProfileMetaSource,
  message = 'Only the account owner can view this surface.',
): void {
  const profileMeta = source.get('profileMeta');
  if (profileMeta?.isOwner !== true) {
    throw new ForbiddenError(message);
  }
  // [Issue 901] Reject auto-synthesized owner identity. profileScopeMiddleware
  // auto-resolves the account OWNER profile (isOwner:true) when no X-Profile-Id
  // header is sent — so an authenticated NON-OWNER caller could omit the header
  // to satisfy the isOwner check above (privilege escalation). Owner privileges
  // require an explicitly selected, verified owner profile.
  if (profileMeta.resolvedVia !== 'explicit-header') {
    throw new ForbiddenError(message);
  }
}

/**
 * [WI-1301 — R1 IDOR] Caller-identity owner gate for /account/* and
 * /billing/* surfaces.
 *
 * SECURITY (P1). assertOwnerProfile (above) derives owner authority from
 * `profileMeta.isOwner`, which reflects the profile RESOLVED FROM the
 * client-supplied X-Profile-Id header. profileScopeMiddleware verifies that
 * X-Profile-Id belongs to the caller's organization, but NOT that it is the
 * caller's OWN identity — in any multi-person org (every family org: owner +
 * non-owner children), an authenticated non-owner member can set
 * X-Profile-Id to a DIFFERENT member's id (e.g. the owner's) and pass
 * assertOwnerProfile's isOwner + resolvedVia checks while acting as
 * themselves. That is the exact IDOR this guard closes: it derives authority
 * from `callerPersonId` — resolved server-side from the authenticated
 * login->person binding by accountMiddleware, NEVER request-supplied — via
 * verifyPersonIsOrgAdminV2 (the v2 twin of the legacy `profiles.isOwner`
 * read, scoped to the caller's OWN person id, not the X-Profile-Id-selected
 * one).
 *
 * Deviation note: the WI-1301 AC names verifyPersonOwnershipV2 as the
 * reference primitive. That guard authorizes write authority over a TARGET
 * person (self-or-guardian) and requires a target person id; account/billing
 * routes act on the account/org itself, not on a target person, so
 * verifyPersonOwnershipV2(callerPersonId, callerPersonId) would be a
 * self===self tautology. verifyPersonIsOrgAdminV2(callerPersonId,
 * organizationId) is the primitive that actually expresses "is the caller an
 * org admin" and satisfies the AC's underlying requirement (authority from
 * server callerPersonId, never client X-Profile-Id).
 *
 * Used ALONGSIDE assertOwnerProfile / assertNotProxyMode at every
 * /account/* and /billing/* owner-or-proxy gate — both checks must pass.
 * assertOwnerProfile's own body is intentionally untouched (its X-Profile-Id
 * based pattern is shared by ~30 other route files outside this WI's AC
 * scope; a repo-wide sweep is a separate, tracked follow-up).
 */
export async function assertCallerIsAccountOwner(
  source: CallerOwnerSource,
  message = 'Only the account owner can perform this action.',
): Promise<void> {
  const account = source.get('account');
  const callerPersonId = source.get('callerPersonId');
  if (!account || !callerPersonId) {
    throw new ForbiddenError(message);
  }
  const db = source.get('db');
  const isCallerAdmin = await verifyPersonIsOrgAdminV2(
    db,
    callerPersonId,
    account.id,
  );
  if (!isCallerAdmin) {
    throw new ForbiddenError(message);
  }
}

type CanReadProfileSource = {
  get(key: 'db'): Database;
  get(key: 'account'): { id: string } | undefined;
  get(key: 'callerPersonId'): string | undefined;
};

/**
 * [WI-2416 — read-side IDOR] Read-authority twin of assertCallerIsAccountOwner.
 *
 * Authorizes a READ of `targetProfileId` when the server-resolved caller
 * (`callerPersonId`, set app-wide by accountMiddleware from the authenticated
 * login->person binding, never request-supplied) is SELF or holds an active
 * guardianship edge over an uncredentialed charge — mirroring the write-side
 * authority rule in verifyPersonOwnershipV2. It deliberately does NOT accept a
 * bare org-admin OR-clause: membership/admin role is existence-visibility,
 * not data-read authority (canon §2A.4, ownership-v2.ts:11-15) — an org admin
 * reading an adult sibling's private learning memory purely on admin role
 * would be a privacy regression the owner-as-guardian path does not need,
 * since an owner IS the guardian of their own uncredentialed charges.
 *
 * profileScopeMiddleware / getPersonScope only verify that the client-supplied
 * X-Profile-Id belongs to the caller's organization — NOT that it is the
 * caller's own identity or a charge they guard. Route handlers must call this
 * (not rely on profileMeta/profileId alone) before reading another profile's
 * data.
 *
 * verifyPersonOwnershipV2 throws a bare `Error` for "no authority" (designed
 * for its write callers, which don't map errors to HTTP) and a
 * `ForbiddenError` for the credentialed-charge suppression case. Both paths
 * must surface as 403 on a read route, so both are remapped/passed through
 * here.
 */
export async function assertCanReadProfile(
  source: CanReadProfileSource,
  targetProfileId: string,
  message = 'You are not authorized to read this profile.',
): Promise<void> {
  const account = source.get('account');
  const callerPersonId = source.get('callerPersonId');
  if (!account || !callerPersonId) {
    throw new ForbiddenError(message);
  }
  const db = source.get('db');
  try {
    await verifyPersonOwnershipV2(
      db,
      targetProfileId,
      account.id,
      callerPersonId,
    );
  } catch (err) {
    // Credentialed-charge suppression already throws ForbiddenError — 403.
    if (err instanceof ForbiddenError) throw err;
    // Bare Error (self/guardian miss, non-membership, OR an underlying DB
    // failure — verifyPersonOwnershipV2 does not distinguish "no authority"
    // from infra errors by type) — fail closed to 403, but capture it so a
    // DB outage surfaces in Sentry instead of silently reading as "denied"
    // (repo rule: silent recovery without escalation is banned in auth code).
    captureException(err, {
      tags: { surface: 'family-access.assertCanReadProfile' },
      extra: { targetProfileId },
    });
    throw new ForbiddenError(message);
  }
}

type CanWriteProfileSource = CanReadProfileSource;

/**
 * [WI-2398 — write-side IDOR] Write-authority twin of assertCanReadProfile,
 * used by assertNotProxyMode (middleware/proxy-guard.ts).
 *
 * assertNotProxyMode's pre-existing checks (isOwner === true, resolvedVia ===
 * 'explicit-header') only prove that the client-supplied X-Profile-Id
 * resolves to SOME owner-role profile in the caller's org — never that it is
 * the caller's OWN identity. A non-owner member (own login, own
 * callerPersonId) can send X-Profile-Id = a DIFFERENT owner/admin profile's
 * id and pass those checks while acting as themselves, mutating that
 * profile's self-service data (curriculum skip/unskip/challenge/topics,
 * onboarding pronouns/interests, and every other write gated solely by
 * assertNotProxyMode). That is the exact IDOR this guard closes.
 *
 * Currently logic-identical to assertCanReadProfile (both wrap
 * verifyPersonOwnershipV2 with the same self-or-guardian authority rule and
 * error remapping) — kept as a separate, named export for call-site clarity
 * (a write call site should not read "assertCanReadProfile") and because read
 * and write authority are independently ruled by product/security and may
 * diverge in the future.
 */
export async function assertCanWriteProfile(
  source: CanWriteProfileSource,
  targetProfileId: string,
  message = 'You are not authorized to modify this profile.',
): Promise<void> {
  const account = source.get('account');
  const callerPersonId = source.get('callerPersonId');
  if (!account || !callerPersonId) {
    throw new ForbiddenError(message);
  }
  const db = source.get('db');
  try {
    await verifyPersonOwnershipV2(
      db,
      targetProfileId,
      account.id,
      callerPersonId,
    );
  } catch (err) {
    // Credentialed-charge suppression already throws ForbiddenError — 403.
    if (err instanceof ForbiddenError) throw err;
    // Bare Error (self/guardian miss, non-membership, OR an underlying DB
    // failure — verifyPersonOwnershipV2 does not distinguish "no authority"
    // from infra errors by type) — fail closed to 403, but capture it so a
    // DB outage surfaces in Sentry instead of silently reading as "denied"
    // (repo rule: silent recovery without escalation is banned in auth code).
    captureException(err, {
      tags: { surface: 'family-access.assertCanWriteProfile' },
      extra: { targetProfileId },
    });
    throw new ForbiddenError(message);
  }
}
