# WI-811 Build Plan — v2 child-profile create + parent-created-child consent grant

> Placeholder-free TDD plan from the spike (`wi-811-consent-scope-spike.md`) + confirmed shapes.
> Worktree: `.worktrees/WI-811` (branch WI-811 from origin/main). Self-executed inline (fork unavailable).
> Build TEST-FIRST; flag-OFF byte-identical (AC#7); SECURITY (cross-org) → red-green-revert.

## Confirmed shapes (all in worktree)
- `createIdentityGraph` owner-bootstrap pattern: identity-graph.ts:208 (person/login/membership/subscription inserts; the child orchestrator is its SUBSET).
- `guardianship` table (packages/database/src/schema/identity.ts:351): `{guardianPersonId→person, chargePersonId→person, qualification default 'biological_parent'}`. Edge = guardian=owner, charge=child.
- `getOwnerProfileV2(db, organizationId): Profile|null` (profile-v2.ts:167) — selects person.id (as personId), birthDate, roles where membership.roles @> ['admin']. **Need ownerPersonId** → confirm the mapped Profile.id IS person.id (v2 profiles keyed on personId); else read person.id directly.
- `getSubscriptionByAccountIdV2(db, accountId)` (subscription-core-v2.ts:107) — accountId===organizationId → the org subscription (gives subId for limit + quota).
- `canAddProfileV2(db, subscriptionId): bool` (billing-v2/family-v2.ts:99) — per-tier limit.
- `provisionProfileQuotaUsageV2(db, subscriptionId, profileId, role)` (quota-provision-v2.ts:112).
- `createDirectConsentGrant(db, chargePersonId, organizationId, consentType, guardianPersonId, snapshot?:{ageAtGrant?,jurisdictionAtGrant?})` (consent-v2.ts:177) — ONE consentGrant insert, granted, no edge (edge is THIS orchestrator's job).
- `checkConsentRequired(birthYear)` / `checkConsentRequiredFromDate(by,bm,bd)` (consent.ts:249/:203) → `{required, consentType:'GDPR'|null, age}`.
- `computeAgeBracket(birthYear)` (@eduagent/schemas) — adult gate.
- Legacy parity (UNTOUCHED): `createProfileWithLimitCheck` (profile.ts:477).

## STEP 1 — schema discriminator (packages/schemas/src/profiles.ts:58)
`profileCreateSchema` is `.strict()`. Add OPTIONAL discriminator so existing owner-POST payloads (no field) still validate AND flag-off stays byte-identical:
```ts
kind: z.enum(['owner', 'child']).optional(), // WI-811: flag-on add-child discriminator; absent = owner bootstrap/replay (legacy auto-classifies by count)
```
Flag-OFF ignores it (legacy `createProfileWithLimitCheck` classifies first-vs-child by COUNT — unchanged). Flag-ON: `kind==='child'` routes to the child orchestrator; absent/`'owner'` keeps current owner replay/bootstrap.

## STEP 2 — orchestrator `createChildProfileV2` (NEW services/identity-v2/child-profile-v2.ts)
Signature: `createChildProfileV2(db, { organizationId, input, adultOwnerGateEnabled }): Promise<Profile>`. ONE `db.transaction`:
1. `pg_advisory_xact_lock(hashtext(organizationId))` (mirror legacy serialization).
2. `sub = getSubscriptionByAccountIdV2(tx, organizationId)`; if `!sub || !(await canAddProfileV2(tx, sub.id))` → throw `ProfileLimitError`.
3. adult-owner gate (when `adultOwnerGateEnabled`): `owner = getOwnerProfileV2(tx, organizationId)`; if `owner.birthYear==null || computeAgeBracket(owner.birthYear)!=='adult'` → throw `ForbiddenError(...,'ADULT_OWNER_REQUIRED')`. (owner also yields `ownerPersonId` for the edge — confirm Profile.id===person.id, else direct read.)
4. insert `person`(child): displayName, birthDate (exact if birthMonth/Day else `${birthYear}-01-01`), residenceJurisdiction=locationToJurisdiction(input.location), conversationLanguage (only if defined), pronouns, avatarUrl. **login_id stays NULL = managed/no-credential** (the child has no auth).
5. insert `membership` {personId: child, organizationId, roles: ['learner']}.
6. insert `guardianship` {guardianPersonId: ownerPersonId, chargePersonId: childPersonId} (qualification defaults).
7. `provisionProfileQuotaUsageV2(tx, sub.id, childPersonId, 'child')`.
8. consent: `cc = (birthMonth!=null&&birthDay!=null) ? checkConsentRequiredFromDate(by,bm,bd) : checkConsentRequired(by)`; if `cc.required` → `createDirectConsentGrant(tx, childPersonId, organizationId, cc.consentType /* 'GDPR' */, ownerPersonId, { ageAtGrant: cc.age, jurisdictionAtGrant: child.residenceJurisdiction })`.
9. return mapped child `Profile` (mirror buildBootstrapProfile / mapProfileRow; isOwner=false).

ORDER matters: edge (6) BEFORE grant (8) — grant assumes the edge as precondition (consent-v2.ts:171-175). All in one tx → AC#1 atomicity.

## STEP 3 — route wiring (routes/profiles.ts:146-161, flag-on resolvedAccount branch)
```
if (resolvedAccount) {
  const owner = await getOwnerProfileV2(db, resolvedAccount.id);
  if (input.kind === 'child') {
    if (!owner) return 409 (structurally-broken graph — no owner to parent the child);
    const child = await createChildProfileV2(db, { organizationId: resolvedAccount.id, input,
      adultOwnerGateEnabled: c.env?.ADULT_OWNER_GATE_ENABLED !== 'false' });
    return c.json(profileResponseSchema.parse({ profile: child }), 201);
  }
  if (owner) return c.json(... owner ..., 201);   // idempotent owner replay (UNCHANGED)
  return 409 (broken graph);
}
```
Catch: `ProfileLimitError`→402 PROFILE_LIMIT_EXCEEDED; `ForbiddenError`→403; `ProfileValidationError`→validationError (mirror the legacy catch ladder at :212-232). **Cross-org guard (AC#5):** organizationId is ALWAYS `resolvedAccount.id` (the authenticated caller's org) — never from client input. The replay-vs-child discriminator is `input.kind` (AC#3): a child-create is never silently answered with the owner.

## STEP 4 — tests (TDD; integration, NO internal mocks — GC1/GC6)
New `services/identity-v2/child-profile-v2.integration.test.ts` (+ route coverage in profiles route integration). Seed a v2 graph (org + owner person(adult) + admin+learner membership + login + subscription). Cases:
- **AC#1** flag-on child-create → asserts person(child)+membership(learner)+guardianship(owner→child)+consent_grant (when minor) all written in one tx; rollback on any failure.
- **AC#2** at-cap → `ProfileLimitError`; owner <18 → `ADULT_OWNER_REQUIRED` (403).
- **AC#3** owner replay (no `kind` / `kind:'owner'`) returns existing owner, creates NO 2nd profile; `kind:'child'` never returns the owner.
- **AC#5 SECURITY (non-vacuous)** caller's org A cannot create a child under org B → org derived from resolved account, not input; **red-green-revert**: break the org-derivation (use an input-supplied org) → cross-org test fails → restore.
- **AC#6** consent: minor (≤16) → consent_grant with lawfulBasis from consentTypeToBasis('GDPR') + snapshotAgeAtGrant; 17+ → NO grant. Non-vacuous (assert the row).
- **AC#7** flag-off path byte-identical (legacy `createProfileWithLimitCheck` untouched; existing profiles route tests stay green).
- **GATING:** the quota-provision insert hits `quota_pools.subscription_id` whose FK targets LEGACY `subscriptions` until M-REPOINT (identity-graph.ts:333). Full child-create with quota provisioning → gate the integration test on `IDENTITY_V2_REPOINTED=1` (or run on post-drop/repointed stg), mirroring createIdentityGraph's full-graph tests. The non-quota assertions (person/membership/guardianship/consent) can run earlier if the quota step is the only repoint-dependent piece — confirm at build whether to split.

## STEP 5 — mobile two-POST (AC#4)
Read the save-wizard child POST call-site (ProfileBasicsStep / save-wizard hook). The second (child) POST must send `kind:'child'` flag-on. Verify the parent→child two-POST flow end-to-end flag-on; no call-site regression flag-off (legacy ignores `kind`). Likely a small edit to the child create body + a mobile test/verify.

## Validation before Gate-1
- `nx run api:typecheck` (test-inclusive) = 0; affected unit/integration green flag-on AND flag-off, WITHOUT --bail (the 809 lesson) before any SKIP_PRE_PUSH.
- Run what CI runs for the change classes touched (api + shared-schemas + mobile).
- Commit via the commit skill (own-work scope, [WI-811] finding-id); push on orch authorization; orch runs Gate-1 (no self-merge); SEPARATE Gate-2 reviewer (security item).

## Open to confirm AT BUILD (small)
- getOwnerProfileV2 mapped Profile exposes person.id as the ownerPersonId (else direct person read for the edge).
- exact `Profile` mapping/return helper for the child (buildBootstrapProfile vs a v2 mapper).
- whether to split the integration test so non-quota assertions run pre-REPOINT.
