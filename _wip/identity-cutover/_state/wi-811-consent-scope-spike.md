# WI-811 Consent-Scope Spike (AC#8) — VERDICT: GREEN, build is contained

> Read-only spike, run by the shepherd inline (fork subagent unavailable in-harness).
> All claims cite file:line in the MAIN checkout (apps/api). Run 2026-06-17.

## ▶ VERDICT
- **(a) Consent branch = SINGLE call? YES.** Parent-created-child consent is one
  `createDirectConsentGrant(...)` → one `db.insert(consentGrant)` row, `granted:true`,
  NO request row, NO email, NO reminder loop. The required/type decision is
  `checkConsentRequired(birthYear)` (or `...FromDate`) returning `{required, consentType:'GDPR'|null, age}`.
- **(b) Jurisdiction tree? NO — definitively absent.** consent.ts:236-243 documents the
  "GDPR-everywhere model (Story 10.19): location is no longer a factor." The only branch is
  age→(GDPR-required | not-required). No jurisdiction/region logic anywhere in the path.
- **(c) Scope-expansion STOP trigger? NONE FOUND.** Every primitive exists; the net-new is
  exactly what the WI scoped (orchestrator + route discriminator + schema field + tests + mobile e2e verify).
- **(d) Recommended seam:** new `createChildProfileV2` orchestrator in `services/identity-v2/`
  (sibling of `createIdentityGraph`); wire it into the route gap at `routes/profiles.ts:146-161`;
  add a discriminator field to `profileCreateSchema` (`packages/schemas/src/profiles.ts:58`).

## Primitives — ALL CONFIRMED PRESENT (real signatures)
| Primitive | Location | Signature / shape |
|---|---|---|
| `canAddProfileV2` | billing-v2/family-v2.ts:99 (barrel: billing-v2/index.ts:69) | `(db, subscriptionId)` → bool; per-tier limit. Caller must resolve the org's subscription first; throw `ProfileLimitError` at cap (parity). |
| `createDirectConsentGrant` | identity-v2/consent-v2.ts:177 | `(db, chargePersonId, organizationId, consentType, guardianPersonId, snapshot?:{ageAtGrant?,jurisdictionAtGrant?})` → void. One `consentGrant` insert; `lawfulBasis=consentTypeToBasis(type)`; `auditFact={source:'parent_created_child', guardianPersonId}`. |
| `checkConsentRequired` / `checkConsentRequiredFromDate` | consent.ts:249 / :203 | `(birthYear[,m,d])` → `{required, consentType:'GDPR'\|null, belowMinimumAge?, age}`. Fail-closed on unknown age. This IS the WI's "consentCheck". |
| `createIdentityGraph` (owner bootstrap — the PATTERN to mirror) | identity-v2/identity-graph.ts:208 | the transactional person/membership/org builder for the OWNER; child orchestrator is its sibling but adds a guardianship edge + learner membership instead of admin/org-create. |
| `getOwnerProfileV2` | identity-v2/profile-v2.ts | resolves the owner under an org; used in the route gap. |
| legacy parity model `createProfileWithLimitCheck` | services/profile.ts:470 | the flag-OFF child path; behavioral parity target (advisory lock, per-tier limit, adult-owner≥18 gate, BUG-239 immediate parent grant + family edge). Must remain UNTOUCHED (AC#7). |

## CRITICAL design constraint (consent-v2.ts:171-175)
`createDirectConsentGrant` **does NOT create the guardianship edge (inv 14)** — the edge is a
*precondition* of the call, not a side effect. So the orchestrator ORDER is:
1. resolve org = caller's resolved `account.id` (account.id IS organization.id — identity-resolve.ts; see profiles.ts:118-120). **This is the cross-org guard (AC#5): org is derived from the authenticated caller, never from client input.**
2. adult-owner ≥18 gate (else `ADULT_OWNER_REQUIRED`) — parity with legacy.
3. `canAddProfileV2(db, subscriptionId)` per-tier limit (else `ProfileLimitError`).
4. insert person(child) + membership(role 'learner', org) + guardianship(owner→child edge).
5. IF `checkConsentRequired(child.birthYear).required` → `createDirectConsentGrant(db, childPersonId, orgId, 'GDPR', ownerPersonId, {ageAtGrant})`.
All in ONE transaction (AC#1).

## The route gap + discriminator (routes/profiles.ts:126-234)
- Flag-ON POST /profiles, resolved account + owner exists → **always returns the owner (201 replay)**
  (lines 146-151); the genuine child-create path is the `409` at :155 ("not yet available, CUT-B2").
  **This is the bug WI-811 fixes.**
- Pre-graph (no account) → `createIdentityGraph` owner bootstrap (:174). Flag-OFF → legacy `createProfileWithLimitCheck` (:206).
- **Discriminator (AC#3):** `profileCreateSchema` (packages/schemas/src/profiles.ts:58) needs an explicit
  field to distinguish "owner replay" from "create child" (e.g. `kind:'owner'|'child'` or a `relationship`/`isChild`).
  Today the route cannot tell a network-replay-of-owner from an intentional add-child — it must NOT silently
  answer a child-create with the owner profile (AC#3). Owner-replay stays idempotent (return existing owner);
  child-create routes to `createChildProfileV2`.
- Mobile save-wizard posts parent THEN child via the SAME route (ProfileBasicsStep) — verify the two-POST
  flow end-to-end flag-on (AC#4); the second POST must carry the child discriminator.

## Tests (AC#5/#6, security-sensitive)
- Cross-org isolation: a caller cannot create a child under another org → red-green-revert on the
  org-derivation/ownership guard (org from resolved account, not input).
- Consent correctness: non-vacuous assert the `consentGrant` row exists with correct `lawfulBasis` +
  snapshot age; below-16 → grant written, 17+ → no grant.
- Per-tier limit (ProfileLimitError at cap); adult-owner gate (ADULT_OWNER_REQUIRED). No internal mocks (GC1/GC6).
- Flag-OFF path byte-identical (legacy `createProfileWithLimitCheck` untouched, AC#7).

## Cutover-plan provenance
Code is the stronger evidence (above). Doc corroboration: `docs/adr/MMT-ADR-0020-cutover-completion-amendments.md`
+ `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md` (the cutover-plan family; the WI cited "§2.3 createGrantedConsentState" — the v2 twin is `createDirectConsentGrant`).

## Open items to pin AT BUILD (not blockers)
- Exact subscription-id resolution for `canAddProfileV2` under the org (read createIdentityGraph + subscription-core-v2.ts).
- Exact guardianship/membership insert shapes (read createIdentityGraph:208 body + schema).
- Discriminator field name/shape — propose in the build plan; keep owner-replay backward-compatible.
