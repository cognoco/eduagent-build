// ---------------------------------------------------------------------------
// Profile Service — CRUD operations with ownership checks
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, inArray, sql, isNull } from 'drizzle-orm';
import {
  profiles,
  familyLinks,
  guardianship,
  consentStates,
  type Database,
} from '@eduagent/database';
import { createLogger } from './logger';
import { captureException } from './sentry';
import { safeSend } from './safe-non-core';
import { inngest } from '../inngest/client';
import { getChargePersonIds } from './identity-v2/guardianship';

const logger = createLogger();
import type {
  AgeBracket,
  AppContext,
  ProfileCreateInput,
  ProfileUpdateInput,
  Profile,
} from '@eduagent/schemas';
import { computeAgeBracket, ForbiddenError } from '@eduagent/schemas';
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
import {
  getConsentStatus,
  checkConsentRequiredFromDate,
  createPendingConsentState,
  createGrantedConsentState,
} from './consent';
import {
  canAddProfile,
  ensureFreeSubscription,
  getSubscriptionByAccountId,
  provisionProfileQuotaUsage,
} from './billing';

export class ProfileLimitError extends Error {
  constructor() {
    super('Profile limit exceeded');
    this.name = 'ProfileLimitError';
  }
}

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapProfileRow(
  row: typeof profiles.$inferSelect,
  consentStatus: Profile['consentStatus'] = null,
  familyMeta: {
    linkCreatedAt?: Date | null;
    hasFamilyLinks?: boolean;
  } = {},
): Profile {
  return {
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
    hasFamilyLinks: familyMeta.hasFamilyLinks ?? false,
    // BKT-C.1 — narrow the DB row's text type to the Zod enum. The CHECK
    // constraint guarantees the value is always one of the 8 codes; the cast
    // is a type-narrowing no-op at runtime.
    conversationLanguage:
      row.conversationLanguage as Profile['conversationLanguage'],
    pronouns: row.pronouns ?? null,
    consentStatus,
    linkCreatedAt: familyMeta.linkCreatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolves family-link meta for a profile row.
 *
 * [WI-803] v2 seam: flag-on reads `guardianship` (active charges or guardians)
 * instead of `family_links`. Flag-off is byte-identical to pre-WI-803. The v2
 * path is only threaded from `updateProfileAppContext`; the other callers
 * (`findOwnerProfile`, `getProfile`, `updateProfile`) remain on the legacy path
 * until their own WP fixes them.
 */
async function loadProfileFamilyMeta(
  db: Database,
  row: typeof profiles.$inferSelect,
  opts?: { identityV2Enabled?: boolean },
): Promise<{ linkCreatedAt: Date | null; hasFamilyLinks: boolean }> {
  if (opts?.identityV2Enabled) {
    // [WI-803] v2 path: guardianship table — safe post-M-DROP.
    // Owner (guardian): has family links iff they hold active charge edges;
    //   linkCreatedAt is null for owners (matches legacy + profile-v2.ts:413).
    // Non-owner (charge): has family links iff they have an active guardian edge;
    //   linkCreatedAt = that edge's grantedAt (legacy parity with
    //   family_links.createdAt; mirrors the WI-771 mapping in profile-v2.ts:413).
    if (row.isOwner) {
      const charges = await getChargePersonIds(db, row.id);
      return { linkCreatedAt: null, hasFamilyLinks: charges.length > 0 };
    } else {
      // A charge has at most one active edge (partial unique idx); first wins.
      const edge = await db.query.guardianship.findFirst({
        where: and(
          eq(guardianship.chargePersonId, row.id),
          isNull(guardianship.revokedAt),
        ),
        columns: { grantedAt: true },
        orderBy: [asc(guardianship.grantedAt)],
      });
      return {
        linkCreatedAt: edge?.grantedAt ?? null,
        hasFamilyLinks: edge != null,
      };
    }
  }

  // Legacy path — byte-identical to pre-WI-803.
  const link = await db.query.familyLinks.findFirst({
    where: row.isOwner
      ? eq(familyLinks.parentProfileId, row.id)
      : eq(familyLinks.childProfileId, row.id),
  });

  return {
    linkCreatedAt: row.isOwner ? null : (link?.createdAt ?? null),
    hasFamilyLinks: !!link,
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Lists all profiles belonging to an account.
 */
export async function listProfiles(
  db: Database,
  accountId: string,
): Promise<Profile[]> {
  const rows = await db.query.profiles.findMany({
    where: and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
  });
  const ownerRow = rows.find((row) => row.isOwner);
  const links = ownerRow
    ? await db.query.familyLinks.findMany({
        where: eq(familyLinks.parentProfileId, ownerRow.id),
      })
    : [];
  const linkCreatedAtByChildId = new Map(
    links.map((link) => [link.childProfileId, link.createdAt]),
  );
  const linkedChildIds = new Set(links.map((link) => link.childProfileId));

  // [L7-F1] Batch consent lookup: one query for all profileIds, then build a
  // map keyed by profileId with the latest status by requestedAt. Replaces
  // the previous N+1 of one getConsentStatus call per profile.
  const profileIds = rows.map((row) => row.id);
  const consentRows = profileIds.length
    ? await db
        .select({
          profileId: consentStates.profileId,
          status: consentStates.status,
          requestedAt: consentStates.requestedAt,
        })
        .from(consentStates)
        .where(inArray(consentStates.profileId, profileIds))
        .orderBy(desc(consentStates.requestedAt))
    : [];
  const statusByProfileId = new Map<string, Profile['consentStatus']>();
  for (const row of consentRows) {
    // Rows arrive in descending requestedAt order, so the first hit per
    // profileId is the latest status.
    if (!statusByProfileId.has(row.profileId)) {
      statusByProfileId.set(row.profileId, row.status);
    }
  }

  return rows.map((row) =>
    mapProfileRow(row, statusByProfileId.get(row.id) ?? null, {
      linkCreatedAt: linkCreatedAtByChildId.get(row.id) ?? null,
      hasFamilyLinks: row.isOwner
        ? links.length > 0
        : linkedChildIds.has(row.id),
    }),
  );
}

/**
 * Returns the count of non-archived profiles for an account.
 * Used by POST /profiles to distinguish first-profile creation (count === 0)
 * from an existing-account scenario where profileMeta absence means a broken
 * state rather than an empty account.
 *
 * [BUG-407] Lightweight O(1) count — does not load consent or profile data.
 */
export async function countProfiles(
  db: Database,
  accountId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(profiles)
    .where(and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)));
  return Number(row?.count ?? 0);
}

/**
 * Authorizes a POST /profiles request before any write occurs.
 *
 * [CR-2026-05-19-H1 / BUG-407] Only the account owner can create additional
 * profiles. Two distinct cases:
 *
 * 1. profileMeta is present: straightforward — enforce isOwner === true.
 * 2. profileMeta is absent: could be a first-profile creation (brand-new
 *    account, no profiles yet) OR a broken/edge state where meta failed to
 *    load despite existing profiles. The old heuristic treated "meta absent"
 *    as "first profile" and allowed the request — this is wrong when the
 *    account already has profiles but meta resolution failed silently.
 *
 *    Fix: do a real DB count. If 0 profiles exist, allow (first-profile
 *    path). If 1+ exist, the owner must have been in meta — reject.
 *
 * Throws {@link ForbiddenError} (mapped by the route to 403 / FORBIDDEN) when
 * the caller is not allowed to create a profile. Resolves silently when the
 * request is authorized. This is the route-entry gate; per-tier limit
 * enforcement still happens inside {@link createProfileWithLimitCheck}.
 *
 * Note: this is intentionally decoupled from the full `ProfileMeta` shape —
 * the only field the authorization decision reads is `isOwner`.
 */
export async function assertProfileCreationAllowed(
  db: Database,
  accountId: string,
  profileMeta: { isOwner: boolean } | undefined,
): Promise<void> {
  if (profileMeta) {
    if (profileMeta.isOwner !== true) {
      throw new ForbiddenError(
        'Only the account owner can create additional profiles.',
      );
    }
    return;
  }

  // profileMeta absent — check DB to determine if this is a first-profile creation.
  const existingCount = await countProfiles(db, accountId);
  if (existingCount > 0) {
    // Profiles exist but no owner meta resolved — never allow (fail closed).
    throw new ForbiddenError(
      'Only the account owner can create additional profiles.',
    );
  }
  // existingCount === 0: brand-new account, first profile creation is always allowed.
}

/**
 * Finds the owner profile for an account.
 * Used by profile-scope middleware to auto-resolve profileId when X-Profile-Id
 * header is absent, preventing the broken `account.id` fallback.
 *
 * Uses a targeted `WHERE is_owner = true LIMIT 1` query instead of loading all
 * profiles into memory. Falls back to the first profile only if no owner flag
 * is set (defensive — should not happen in normal operation).
 */
export async function findOwnerProfile(
  db: Database,
  accountId: string,
): Promise<Profile | null> {
  // Targeted query: owner profile directly
  const ownerRow = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.accountId, accountId),
      eq(profiles.isOwner, true),
      isNull(profiles.archivedAt),
    ),
  });

  if (ownerRow) {
    const consentStatus = await getConsentStatus(db, ownerRow.id);
    const familyMeta = await loadProfileFamilyMeta(db, ownerRow);
    return mapProfileRow(ownerRow, consentStatus, familyMeta);
  }

  // [BUG-410] Fallback: no owner flag set — account is in a corrupt/inconsistent
  // state. Check whether any profiles exist at all before deciding how to respond.
  //
  // IMPORTANT: We return the fallback row with its ACTUAL isOwner flag (false),
  // NOT with isOwner forced to true. The caller (profile-scope.ts) must propagate
  // this flag faithfully — granting owner privileges to a non-owner profile is
  // the exact bug we are fixing here.
  //
  // We still escalate aggressively: captureException (high severity) + safeSend
  // an Inngest event so the missing-owner-row is alertable in production.
  const fallbackRow = await db.query.profiles.findFirst({
    where: and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
    orderBy: [asc(profiles.createdAt)],
  });
  if (!fallbackRow) return null;

  // Escalate: missing owner row is a data-integrity anomaly, not a normal edge case.
  const noOwnerErr = new Error(
    `[findOwnerProfile] No owner profile found for account ${accountId}; falling back to oldest profile. isOwner will remain false — caller must not elevate.`,
  );
  logger.warn(noOwnerErr.message, {
    accountId,
    fallbackProfileId: fallbackRow.id,
  });
  captureException(noOwnerErr, {
    extra: {
      tag: 'profile.owner_resolution_fallback',
      accountId,
      fallbackProfileId: fallbackRow.id,
    },
  });
  await safeSend(
    () =>
      // orphan-allow: observability-only marker. The data-integrity anomaly
      // (no isOwner row) is already recovered in-line (fall back to the oldest
      // profile, return actual isOwner=false) and escalated via logger.warn +
      // captureException above. This Inngest dispatch exists purely as a
      // dashboard-queryable signal; no remediation handler is required.
      inngest.send({
        name: 'app/profile.no_owner_resolved',
        data: { accountId, fallbackProfileId: fallbackRow.id },
      }),
    'findOwnerProfile.no_owner_resolved',
    { accountId, fallbackProfileId: fallbackRow.id },
  );

  const consentStatus = await getConsentStatus(db, fallbackRow.id);
  // Return with actual isOwner (false) — do NOT force to true.
  const familyMeta = await loadProfileFamilyMeta(db, fallbackRow);
  return mapProfileRow(fallbackRow, consentStatus, familyMeta);
}

/**
 * Creates a new profile under the given account.
 *
 * The first profile created for an account is automatically marked as the
 * owner profile (isOwner = true). Subsequent profiles are non-owner.
 *
 * Consent is determined by age alone (GDPR-everywhere, Story 10.19).
 * If consent is required:
 * - When `parentProfileId` is provided (parent adding child directly),
 *   consent is recorded as GRANTED immediately — the parent IS the consenting
 *   adult, so no email loop is needed. A family_link row is also created.
 * - Otherwise (child self-registering), a PENDING consent state is created and
 *   the child must go through the email-based consent request flow.
 */
export async function createProfile(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  isOwner?: boolean,
  parentProfileId?: string,
): Promise<Profile> {
  const birthYear = input.birthYear;

  // Pre-compute consent check using full date when available (WI-297).
  // birthMonth/birthDay are NOT persisted — used only for precise age calculation
  // at creation time to prevent year-only overestimation from bypassing the age gate.
  const consentCheck = checkConsentRequiredFromDate(
    birthYear,
    input.birthMonth,
    input.birthDay,
  );

  // Enforce minimum age (WI-570 / data-model.md §2A.5: v1 launch floor is 13+)
  if (consentCheck?.belowMinimumAge) {
    throw new ProfileValidationError(
      'CHILD_AGE_VIOLATION',
      'birthYear',
      'Users must be at least 13 years old to create a profile',
    );
  }

  const [row] = await db
    .insert(profiles)
    .values({
      accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl ?? null,
      birthYear,
      location: input.location ?? null,
      isOwner: isOwner ?? false,
      // i18n Phase 1 — close the first-render race. When omitted, Drizzle
      // skips the column and the DB default 'en' applies. When the mobile
      // client forwards i18next.language, the very first LLM call on the new
      // profile uses the device locale rather than English.
      ...(input.conversationLanguage !== undefined
        ? { conversationLanguage: input.conversationLanguage }
        : {}),
    })
    .returning();

  if (!row) throw new Error('Insert profile did not return a row');

  // Always create family link when a parent adds a child, regardless of
  // consent requirements. Without this, children aged 17+ (consent not
  // required) get no family_links row and assertParentAccess rejects nudges,
  // proxy mode, and all parent-scoped operations.
  if (parentProfileId) {
    await db
      .insert(familyLinks)
      .values({ parentProfileId, childProfileId: row.id })
      .onConflictDoNothing();
  }

  // Server-side consent determination: if consent is required, record it.
  // When a parent creates a child (parentProfileId set), consent is GRANTED
  // immediately — the parent IS the consenting adult (BUG-239 fix).
  // Otherwise (child self-registering), create PENDING state for the
  // email-based consent request flow.
  let consentStatus: Profile['consentStatus'] = null;
  if (consentCheck?.required && consentCheck.consentType) {
    if (parentProfileId) {
      const state = await createGrantedConsentState(
        db,
        row.id,
        consentCheck.consentType,
        parentProfileId,
      );
      consentStatus = state.status;
    } else {
      const state = await createPendingConsentState(
        db,
        row.id,
        consentCheck.consentType,
      );
      consentStatus = state.status;
    }
  }

  return mapProfileRow(row, consentStatus, {
    hasFamilyLinks: !!parentProfileId,
  });
}

/**
 * Creates a profile with tier-based limit enforcement and advisory locking.
 * Wraps createProfile in a transaction with pg_advisory_xact_lock to
 * prevent TOCTOU races (two concurrent POSTs both reading below the limit).
 *
 * Throws ProfileLimitError when the account's subscription tier is at capacity.
 */
export async function createProfileWithLimitCheck(
  db: Database,
  accountId: string,
  input: ProfileCreateInput,
  opts?: {
    /**
     * [OPT-C] Adult-owner gate. When true (default), adding a child profile
     * (non-first profile) requires the existing owner to be >=18. Set to false
     * to disable the rule without code changes — controlled by the `ADULT_OWNER_GATE_ENABLED`
     * env var. Callers should read `(c.env?.ADULT_OWNER_GATE_ENABLED ?? 'true') !== 'false'`
     * and pass the result here. Defaults to true (safe default — gate ON when unset).
     */
    adultOwnerGateEnabled?: boolean;
  },
): Promise<Profile> {
  const adultOwnerGateEnabled = opts?.adultOwnerGateEnabled ?? true;
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    // Advisory lock per account — serializes concurrent profile creations
    // without blocking unrelated accounts. Released on commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`);

    // O(1) count instead of loading all profiles + N consent queries.
    // Only need the count and the owner ID — keeps the lock window minimal.
    const [countRow] = await txDb
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(profiles)
      .where(
        and(eq(profiles.accountId, accountId), isNull(profiles.archivedAt)),
      );
    // Neon can deserialize COUNT(*)::int as a string even though the Drizzle
    // type is `number`. Normalize before comparing so the first profile is
    // reliably marked as the owner in every runtime.
    const profileCount = Number(countRow?.count ?? 0);
    const isFirstProfile = profileCount === 0;

    // Enforce per-tier profile limits. First profile creation is always allowed.
    let subscription = await getSubscriptionByAccountId(txDb, accountId);
    if (!isFirstProfile) {
      if (!subscription || !(await canAddProfile(txDb, subscription.id))) {
        throw new ProfileLimitError();
      }
    }

    // [OPT-C] Adult-owner gate. When adding a CHILD (non-first profile),
    // require the account's existing owner to be >=18. Gated by flag so the
    // rule can be toggled off without code changes (kill switch).
    // Defense-in-depth: client-side gate (Task 13 / HIGH-A3) is the primary
    // UX barrier; this is the server-side enforcement fallback.
    if (adultOwnerGateEnabled && !isFirstProfile) {
      const ownerRow = await txDb
        .select({ birthYear: profiles.birthYear })
        .from(profiles)
        .where(
          and(
            eq(profiles.accountId, accountId),
            eq(profiles.isOwner, true),
            isNull(profiles.archivedAt),
          ),
        )
        .limit(1);
      const ownerBirthYear = ownerRow[0]?.birthYear;
      if (
        ownerBirthYear == null ||
        computeAgeBracket(ownerBirthYear) !== 'adult'
      ) {
        throw new ForbiddenError(
          'Account holder must be 18 or older to add a child profile.',
          'ADULT_OWNER_REQUIRED',
        );
      }
    }

    // BUG-239: When a non-first profile is created, the account owner (parent)
    // is always the one creating it — the account has a single Clerk auth
    // session. Consent is granted immediately; the parent IS the consenting
    // adult, so no email loop is needed. A family_link row is also created.
    //
    // Consent flow (PENDING state) is ONLY for first-profile creation by a
    // self-registering underage user who has no parent on the account yet.
    let parentProfileId: string | undefined;
    if (!isFirstProfile) {
      const ownerProfile = await txDb.query.profiles.findFirst({
        where: and(
          eq(profiles.accountId, accountId),
          eq(profiles.isOwner, true),
          isNull(profiles.archivedAt),
        ),
        columns: { id: true },
      });
      if (ownerProfile) {
        parentProfileId = ownerProfile.id;
      }
    }

    const created = await createProfile(
      txDb,
      accountId,
      input,
      isFirstProfile,
      parentProfileId,
    );

    subscription ??= await ensureFreeSubscription(txDb, accountId);
    await provisionProfileQuotaUsage(
      txDb,
      subscription.id,
      created.id,
      created.isOwner ? 'owner' : 'child',
    );

    return created;
  });
}

/**
 * Fetches a single profile by ID with ownership verification.
 *
 * Returns null if the profile does not exist or does not belong to the
 * caller's account — callers should treat null as 404.
 */
export async function getProfile(
  db: Database,
  profileId: string,
  accountId: string,
): Promise<Profile | null> {
  const row = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, accountId),
      isNull(profiles.archivedAt),
    ),
  });
  if (!row) return null;
  const status = await getConsentStatus(db, row.id);
  const familyMeta = await loadProfileFamilyMeta(db, row);
  return mapProfileRow(row, status, familyMeta);
}

/**
 * Updates a profile after verifying ownership.
 *
 * Returns null if the profile does not exist or is not owned by the account.
 * BUG-352: isNull(profiles.archivedAt) prevents writes to GDPR-pending archived profiles.
 */
export async function updateProfile(
  db: Database,
  profileId: string,
  accountId: string,
  input: ProfileUpdateInput,
): Promise<Profile | null> {
  const rows = await db
    .update(profiles)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.accountId, accountId),
        isNull(profiles.archivedAt),
      ),
    )
    .returning();
  if (!rows[0]) return null;
  const status = await getConsentStatus(db, rows[0].id);
  const familyMeta = await loadProfileFamilyMeta(db, rows[0]);
  return mapProfileRow(rows[0], status, familyMeta);
}

/**
 * Persists the active app context for a profile.
 *
 * Returns null if the profile does not exist or is not owned by the account.
 * The route layer enforces whether the caller may update this profile.
 *
 * [WI-802] v2 seam: under `opts.identityV2Enabled`, the family-context guard
 * checks `guardianship` (active charges) instead of `family_links`.
 */
export async function updateProfileAppContext(
  db: Database,
  profileId: string,
  accountId: string,
  defaultAppContext: AppContext,
  opts?: { identityV2Enabled?: boolean },
): Promise<Profile | null> {
  const existing = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, accountId),
      isNull(profiles.archivedAt),
    ),
  });
  if (!existing) return null;

  if (defaultAppContext === 'family') {
    let hasFamilyLink: boolean;
    if (opts?.identityV2Enabled) {
      const charges = await getChargePersonIds(db, profileId);
      hasFamilyLink = charges.length > 0;
    } else {
      const familyLink = await db.query.familyLinks.findFirst({
        where: eq(familyLinks.parentProfileId, profileId),
      });
      hasFamilyLink = familyLink != null;
    }
    if (
      existing.isOwner !== true ||
      computeAgeBracket(existing.birthYear) !== 'adult' ||
      !hasFamilyLink
    ) {
      throw new ForbiddenError(
        'Family mode is only available to adult owner profiles with family links.',
        'FAMILY_CONTEXT_NOT_ALLOWED',
      );
    }
  }

  const rows = await db
    .update(profiles)
    .set({
      defaultAppContext,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.accountId, accountId),
        isNull(profiles.archivedAt),
      ),
    )
    .returning();
  if (!rows[0]) return null;
  const status = await getConsentStatus(db, rows[0].id);
  // [WI-803] Thread opts so the response-build read uses the v2 path flag-on.
  const familyMeta = await loadProfileFamilyMeta(db, rows[0], opts);
  return mapProfileRow(rows[0], status, familyMeta);
}

/**
 * Verifies a profile belongs to the account for profile switching.
 *
 * Returns null if the profile is not owned — caller returns 403.
 */
export async function switchProfile(
  db: Database,
  profileId: string,
  accountId: string,
): Promise<{ profileId: string } | null> {
  const row = await db.query.profiles.findFirst({
    where: and(
      eq(profiles.id, profileId),
      eq(profiles.accountId, accountId),
      isNull(profiles.archivedAt),
    ),
  });
  return row ? { profileId: row.id } : null;
}

/**
 * Returns the learner's age derived from birthYear. Falls back to 12 if
 * birthYear is not set. Minimum returned age is 5.
 * BUG-352: isNull(profiles.archivedAt) prevents reads of GDPR-pending archived profiles.
 */
export async function getProfileAge(
  db: Database,
  profileId: string,
): Promise<number> {
  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
  });
  const currentYear = new Date().getUTCFullYear();
  return profile?.birthYear ? Math.max(5, currentYear - profile.birthYear) : 12;
}

/**
 * Loads the raw profile row by ID. Self-keyed lookup — caller is asking for the
 * exact row that defines the scope, not a child resource, so no parent-chain
 * check is needed. Centralised here so `db.select().from(profiles)` and
 * `db.query.profiles.findFirst({ where: eq(profiles.id, ...) })` are not sprinkled
 * across services. If scoping ever needs to tighten, this is the single migration
 * point.
 * BUG-352: isNull(profiles.archivedAt) prevents reads of GDPR-pending archived profiles.
 */
export async function loadProfileRowById(
  db: Database,
  profileId: string,
): Promise<typeof profiles.$inferSelect | null> {
  const row = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
  });
  return row ?? null;
}

/**
 * Returns the learner's display name. Used to personalise LLM prompts.
 * Returns undefined if the profile does not exist.
 * BUG-352: isNull(profiles.archivedAt) prevents reads of GDPR-pending archived profiles.
 */
export async function getProfileDisplayName(
  db: Database,
  profileId: string,
): Promise<string | undefined> {
  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
    columns: { displayName: true },
  });
  return profile?.displayName;
}

/**
 * Resolves a profile's AgeBracket for passing to LLM safety-preamble calls.
 * Returns 'adult' (the conservative minor-safe default) if birthYear is unset.
 * BUG-352: isNull(profiles.archivedAt) prevents reads of GDPR-pending archived profiles.
 */
export async function getProfileAgeBracket(
  db: Database,
  profileId: string,
): Promise<AgeBracket> {
  const profile = await db.query.profiles.findFirst({
    where: and(eq(profiles.id, profileId), isNull(profiles.archivedAt)),
    columns: { birthYear: true },
  });
  return profile?.birthYear ? computeAgeBracket(profile.birthYear) : 'adult';
}

// ---------------------------------------------------------------------------
// Role resolution (used by recall notifications + daily plan)
// ---------------------------------------------------------------------------

export type ProfileRole = 'guardian' | 'self_learner';

/**
 * Determines whether a profile is a guardian or self-learner by checking
 * the family_links table. A profile with any child links is a guardian.
 */
export async function resolveProfileRole(
  db: Database,
  profileId: string,
): Promise<ProfileRole> {
  const childLink = await db.query.familyLinks.findFirst({
    where: eq(familyLinks.parentProfileId, profileId),
  });
  return childLink ? 'guardian' : 'self_learner';
}
