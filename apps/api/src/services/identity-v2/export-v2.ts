// ---------------------------------------------------------------------------
// CUT-B2 GDPR export twin (cutover-plan §2.3a / §2.6 + D3). The v2 of
// `services/export.ts` — same `DataExport` OUTPUT contract (mobile sees an
// identical response shape; the schema is fixed), reading the identity data
// from the ratified tables instead of legacy:
//
//   account        ← organization (deletion stamps) + login (email)
//   profiles        ← person (re-homed presentation cols) + membership (isOwner)
//   consentStates   ← consent_request + consent_grant (enumerated verbatim,
//                     reduced to the legacy {status, parentEmail} export shape)
//   familyLinks     ← guardianship (revoked_at IS NULL)
//   subscriptions   ← subscription (organization-keyed)
//
// All learning-data tables are keyed on profileId = person.id (unchanged by the
// cutover), so those reads are byte-identical to the legacy export — this twin
// reuses the legacy `generateExport` for the learning-data half and overrides
// the identity + billing sections, avoiding a ~250-line duplication that would
// drift.
//
// D3 (v1.6): the `mentor_activity_ledger` Art-15 inclusion carries verbatim —
// it is profileId-keyed and already in the legacy export (WI-679), so the reused
// learning-data half covers it. This module asserts its presence so a silent
// regression of the Art-15 leg fails the test.
//
// FLAG-GATED: reachable only when IDENTITY_V2_ENABLED is 'true'.
// ---------------------------------------------------------------------------

import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  guardianship,
  login,
  membership,
  organization,
  person,
  quotaPools,
  subscription,
  topUpCredits,
  type Database,
} from '@eduagent/database';
import {
  dataExportSubscriptionRowSchema,
  dataExportFamilyLinkRowSchema,
  dataExportQuotaPoolRowSchema,
  dataExportTopUpCreditRowSchema,
} from '@eduagent/schemas';
import type { ConsentStatus, DataExport, Profile } from '@eduagent/schemas';
import { generateExport, serializeDates } from '../export';
import {
  resolveLatestConsentStatusAnyBasis,
  type ConsentBasis,
} from './consent-status-v2';

/**
 * v2 `generateExport` — the GDPR Art-15 access/portability export over the
 * ratified identity tables. Produces the same `DataExport` shape as the legacy
 * export; the route's `dataExportSchema.parse()` is unchanged.
 *
 * Strategy: run the legacy `generateExport` to obtain the learning-data half
 * (every learning table is profileId = person.id keyed and untouched by the
 * cutover, incl. the D3 `mentor_activity_ledger` inclusion), then OVERRIDE the
 * identity + billing sections (account / profiles / consentStates / familyLinks /
 * subscriptions / quotaPools / topUpCredits) with reads from the v2 tables.
 * `accountId` = organization.id by the deterministic reseed.
 *
 * NOTE: [WI-809] the legacy half is now called with `learningOnlyProfileIds`, so
 * it no longer reads the four identity tables dropped at the cutover (accounts /
 * profiles / consent_states / family_links) — those reads would 500 post-drop.
 * [WI-805] It also no longer reads the legacy `subscriptions` billing chain
 * (dropped by 0119): this twin overrides subscriptions / quotaPools /
 * topUpCredits from the v2 `subscription` chain (the 4 quota satellites' FK was
 * repointed to v2 `subscription` by 0117). The identity + billing sections it
 * returns are empty placeholders we override below. At grep-clean (WI-586) the
 * legacy export and this delegation are deleted together and the learning reads
 * fold directly into a single v2 export.
 */
export async function generateExportV2(
  db: Database,
  organizationId: string,
): Promise<DataExport> {
  // 1. Identity root: organization (account stand-in) + owner login (email).
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { id: true, createdAt: true },
  });
  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }
  const ownerLoginRow = await db
    .select({ email: login.email })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .innerJoin(login, eq(login.personId, person.id))
    .where(
      and(
        eq(membership.organizationId, organizationId),
        // The owner login: admin membership. Falls back to any login in the org
        // if no admin (defensive — every org has an admin by the reseed).
      ),
    )
    .limit(1);
  const ownerEmail = ownerLoginRow[0]?.email ?? '';

  // 2. The org's persons (via membership) + their roles (isOwner derivation).
  const memberRows = await db
    .select({
      personId: membership.personId,
      roles: membership.roles,
    })
    .from(membership)
    .where(eq(membership.organizationId, organizationId));
  const personIds = memberRows.map((m) => m.personId);
  const isOwnerByPersonId = new Map(
    memberRows.map((m) => [m.personId, m.roles.includes('admin')]),
  );

  const personRows =
    personIds.length > 0
      ? await db.query.person.findMany({
          where: inArray(person.id, personIds),
        })
      : [];

  // 3. Consent: enumerate consent_request + consent_grant; reduce to the legacy
  // export's per-profile {status, parentEmail, requestedAt} shape via the
  // reused AnyBasis resolver (the same behavior-preserving read the rest of the
  // cutover uses).
  const requestRows =
    personIds.length > 0
      ? await db.query.consentRequest.findMany({
          where: inArray(consentRequest.chargePersonId, personIds),
        })
      : [];
  const grantRows =
    personIds.length > 0
      ? await db.query.consentGrant.findMany({
          where: inArray(consentGrant.chargePersonId, personIds),
        })
      : [];

  const consentStatusByPersonId = new Map<string, ConsentStatus>();
  await Promise.all(
    personIds.map(async (pid) => {
      const status = await resolveLatestConsentStatusAnyBasis(
        db,
        pid,
        organizationId,
      );
      if (status !== null) consentStatusByPersonId.set(pid, status);
    }),
  );

  // The legacy export's `consentStates` array is the per-profile latest row. v2
  // enumerates BOTH request and grant rows verbatim (the §2.3a "enumerates all
  // request/grant rows verbatim" requirement), mapped to the export row shape.
  const consentStatesExport = buildConsentStatesExport(requestRows, grantRows);

  // 4. Guardianship → familyLinks export rows.
  const guardianshipRows =
    personIds.length > 0
      ? await db.query.guardianship.findMany({
          where: isNull(guardianship.revokedAt),
        })
      : [];
  const idSet = new Set(personIds);
  const relevantEdges = guardianshipRows.filter(
    (g) => idSet.has(g.guardianPersonId) || idSet.has(g.chargePersonId),
  );
  const linkGrantedByChild = new Map(
    relevantEdges.map((g) => [g.chargePersonId, g.grantedAt]),
  );

  // 5. Subscription (organization-keyed) + its quota satellites. [WI-805] The 4
  // quota satellites' subscription_id FK was repointed to the v2 `subscription`
  // by 0117 (m-repoint), so quotaPools / topUpCredits are read HERE by the v2
  // subscription ids and overridden below — the reused legacy generateExport no
  // longer reads the legacy `subscriptions` billing chain (dropped by 0119).
  // usage_events / profile_quota_usage are not in the DataExport contract, so
  // only quotaPools + topUpCredits surface.
  const subscriptionRows = await db.query.subscription.findMany({
    where: eq(subscription.organizationId, organizationId),
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

  // 6. Profiles export (person → the legacy Profile export shape). isOwner from
  // membership; consentStatus from the resolver; conversationLanguage/pronouns
  // /avatarUrl/defaultAppContext from the re-homed person columns.
  const profilesExport: DataExport['profiles'] = personRows.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl ?? null,
    birthYear: Number(p.birthDate.slice(0, 4)),
    location: jurisdictionToLocation(p.residenceJurisdiction),
    isOwner: isOwnerByPersonId.get(p.id) ?? false,
    // has_premium_llm is derived post-cutover; served false here (mobile
    // contract revision is out of scope — §1.3).
    hasPremiumLlm: false,
    defaultAppContext:
      (p.defaultAppContext as Profile['defaultAppContext']) ?? null,
    hasFamilyLinks: isOwnerByPersonId.get(p.id)
      ? relevantEdges.some((g) => g.guardianPersonId === p.id)
      : relevantEdges.some((g) => g.chargePersonId === p.id),
    conversationLanguage:
      p.conversationLanguage as Profile['conversationLanguage'],
    pronouns: p.pronouns ?? null,
    consentStatus: consentStatusByPersonId.get(p.id) ?? null,
    linkCreatedAt: linkGrantedByChild.get(p.id)?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  // 7. Learning-data half: reuse the legacy export (profileId = person.id keyed;
  // unchanged by the cutover — incl. the D3 mentor_activity_ledger inclusion).
  // [WI-809] Pass the org's personIds as learningOnlyProfileIds so the legacy
  // export does NOT read the four identity tables dropped at the cutover
  // (accounts / profiles / consent_states / family_links) — they 500 post-drop.
  // It returns only the learning-data + billing arrays we consume; the identity
  // sections it returns are empty placeholders overridden below.
  const legacy = await generateExport(db, organizationId, {
    learningOnlyProfileIds: personIds,
  });

  return {
    ...legacy,
    account: {
      email: ownerEmail,
      createdAt: org.createdAt.toISOString(),
    },
    profiles: profilesExport,
    consentStates: consentStatesExport,
    // [WI-1097] guardianship "replaces family_links" (schema comment): map the
    // edge to the legacy/contract familyLinks row shape (guardian = parent,
    // charge = child) so the v2 export's familyLinks conform to the now-strict
    // dataExportFamilyLinkRowSchema — identical to the legacy export's shape.
    // The prior {guardianPersonId, chargePersonId, qualification, grantedAt}
    // shape was accepted only because the schema was a loose z.record.
    familyLinks: relevantEdges.map((g) =>
      dataExportFamilyLinkRowSchema.parse(
        serializeDates({
          id: g.id,
          parentProfileId: g.guardianPersonId,
          childProfileId: g.chargePersonId,
          createdAt: g.createdAt,
        }),
      ),
    ),
    subscriptions: subscriptionRows.map((s) =>
      dataExportSubscriptionRowSchema.parse(
        serializeDates(s as Record<string, unknown>),
      ),
    ),
    quotaPools: quotaPoolRows.map((row) =>
      dataExportQuotaPoolRowSchema.parse(serializeDates(row)),
    ),
    topUpCredits: topUpCreditRows.map((row) =>
      dataExportTopUpCreditRowSchema.parse(serializeDates(row)),
    ),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a residence jurisdiction back to the legacy `location` export value. */
function jurisdictionToLocation(jurisdiction: string): Profile['location'] {
  switch (jurisdiction) {
    case 'US':
      return 'US';
    case 'EU':
      return 'EU';
    default:
      return 'OTHER';
  }
}

/** Map the v2 basis back to the legacy ConsentType for the export row. */
function basisToConsentType(basis: string): 'GDPR' | 'COPPA' {
  return basis === 'coppa_parental_consent' ? 'COPPA' : 'GDPR';
}

/** Map a v2 request.status to the legacy ConsentStatus for the export row. */
function requestStatusToConsentStatus(status: string): ConsentStatus {
  switch (status) {
    case 'pending':
      return 'PENDING';
    case 'requested':
      return 'PARENTAL_CONSENT_REQUESTED';
    case 'approved':
      return 'CONSENTED';
    case 'denied':
    case 'expired':
      return 'WITHDRAWN';
    default:
      return 'PENDING';
  }
}

/**
 * Build the legacy `consentStates` export rows from the v2 request + grant
 * enumeration. Each request row is emitted (the workflow record), and each grant
 * row that is withdrawn is emitted as a WITHDRAWN row (so the export surfaces the
 * full grant-layer history, not only the request state). The export contract's
 * row shape is {id, profileId, consentType, status, parentEmail, requestedAt,
 * respondedAt}.
 */
function buildConsentStatesExport(
  requestRows: Array<{
    id: string;
    chargePersonId: string;
    requestedBasis: string;
    status: string;
    guardianEmail: string | null;
    requestedAt: Date | null;
    respondedAt: Date | null;
    createdAt: Date;
  }>,
  grantRows: Array<{
    id: string;
    chargePersonId: string;
    lawfulBasis: string;
    granted: boolean;
    grantedAt: Date;
    withdrawnAt: Date | null;
  }>,
): DataExport['consentStates'] {
  const fromRequests = requestRows.map((r) => ({
    id: r.id,
    profileId: r.chargePersonId,
    consentType: basisToConsentType(r.requestedBasis),
    status: requestStatusToConsentStatus(r.status),
    parentEmail: r.guardianEmail ?? null,
    requestedAt: (r.requestedAt ?? r.createdAt).toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
  }));
  // Grants whose current state is CONSENTED/WITHDRAWN and that have no request
  // row (the parent-created-child direct grant) are surfaced too, so the export
  // is complete for direct grants.
  const requestPersonBasis = new Set(
    requestRows.map((r) => `${r.chargePersonId}:${r.requestedBasis}`),
  );
  const fromDirectGrants = grantRows
    .filter(
      (g) => !requestPersonBasis.has(`${g.chargePersonId}:${g.lawfulBasis}`),
    )
    .map((g) => ({
      id: g.id,
      profileId: g.chargePersonId,
      consentType: basisToConsentType(g.lawfulBasis),
      status: (g.withdrawnAt ? 'WITHDRAWN' : 'CONSENTED') as ConsentStatus,
      parentEmail: null,
      requestedAt: g.grantedAt.toISOString(),
      respondedAt: (g.withdrawnAt ?? g.grantedAt).toISOString(),
    }));
  return [...fromRequests, ...fromDirectGrants];
}

// Re-export so callers importing the basis type from the export twin compile.
export type { ConsentBasis };
