# Identity Foundation — Drift Map (Phase A)

**Status:** 2026-06-01 — Phase A deliverable. Product intent NOT yet locked (that is Phase B).
**Method:** three-way reconciliation (intent vs. canonical docs vs. as-built code/schema), organized by
domain area, citation-backed. Produced by a 34-agent Sonnet fan-out (6 deep clusters × code-lens +
doc-lens + reconcile; 3 light clusters; cross-cutting audit re-triage + sibling-coupling + doc-staleness
+ completeness critic), every cluster's citations re-checked by an independent adversarial verifier.
Synthesis is hand-authored from the verified records.

**How to read this:** "Intent" = the unratified forward model reverse-engineered in
`identity-reconstructed-prd.md` (its thinness is itself a finding — do not treat it as ratified).
"Docs" = the canonical docs, presumed stale. "Code" = ground truth as-built. **Direction** answers the
key question per drift: is the code already moving *toward* the new intent, *stuck* on the old model, are
only the *docs* stale, or do all three *diverge*? **PRD-refresh priority** (P0–P3) doubles this map as the
canonical-doc refresh backlog. Citations are `path:line` or `doc:§/line`; a handful flagged
**⚠cite-unverified** were not independently re-checked (see Appendix B).

> **Reading guardrail (carried from README):** this map *informs* product intent (Phase B); it does
> **not** design the target model. Where it describes the archived org/membership table shapes, that is
> "what the rejected design proposed," never an input to the new model.

---

## 1. Headline findings

1. **The drift is symmetric: code *and* docs are both stuck on the old model.** Every canonical doc
   describes the fused `accounts` + `profiles.isOwner` + `family_links` + per-account `subscriptions`
   model; every live request path resolves authority through it. This is not "docs lag code" — it is
   "a competent solution was built and documented for a problem statement that was never written."

2. **T1 (migration `0106`) is real on disk and inert in behavior.** `organizations`, `memberships`,
   `profiles.clerk_user_id`, and `subscriptions.organization_id` exist, are exported, and were
   backfilled — but **zero production reader/writer references them** (`rg` for `organizations|memberships`
   in `apps/api/src/` returns empty; confirmed across the identity, org, roles, billing, auth, and
   notification clusters). The schema comment says so itself: *"No reader/writer is rewired in T1"*
   (`packages/database/src/schema/profiles.ts:135-144`). The clean-cut decision means this machinery
   should be reverted, not wired — its inertness is the *correct* state, but it is a live trap for
   reviewers who read the green schema as "done."

3. **Consent/COPPA under own-logins is the single load-bearing P0** — confirmed independently in five
   clusters. The entire consent stack assumes a parent owns the account and consents by email for a
   *managed* minor. The *credentialed* minor (own login) has **no code, no schema branch, and no doc**;
   `docs/PRD.md:424` literally self-annotates *"MISSING: Detailed GDPR/COPPA implementation requirements."*
   The `requestConsent` guard (`apps/api/src/routes/consent.ts:237-246`) is *semantically wrong* for a
   minor's own account, and graduation re-consent, cross-org consent, and minor-signs-up-first are all
   unanswered. **No identity code touching consent should land until this has a functional spec + legal
   check.**

4. **There are four parallel role/ownership encodings in the live codebase, not one.** Beyond
   `profiles.isOwner` (boolean), the code carries `profileQuotaUsage.role` (`'owner'|'child'` text enum,
   `billing.ts:143`), `AgeGateRole` (`'owner'|'child'|'impersonated-child'`, mobile, `CONTEXT.md:368`),
   and the inert `membershipRoleEnum` (`'owner'|'mentor'|'student'`). The clean cut must collapse the
   first three — not just swap `isOwner` for a membership query. This cross-cutting tangle is under-counted
   in the archived plans.

5. **The one "conflict" the docs frame as open is strategically decided — but only in the right place.**
   The reconstructed PRD §10 still carries the transition as an open **`[CONFLICT]`** (its heading is
   literally `[CONFLICT]`, verified). The **clean-cut resolution lives in `README.md` / `ROADMAP.md`
   decision logs (2026-06-01)**, *not* in the PRD. Several worker agents wrote "CONFLICT→RESOLVED"; that
   is correct about the *decision* but wrong about *where* it is recorded — the PRD itself was never
   updated. (Correction applied per verifier finding `ob-4`.)

---

## 2. Drift by domain area

Legend — **Dir:** `code→intent` (code drifting toward new model) · `stuck-old` · `docs-stale` ·
`3-way` (all diverge) · `aligned`. **Blast:** L/M/H. **PRD:** refresh priority.

### 2.1 Identity core — Person / Profile / accounts  *(DEEP)*

**Staleness:** code and all four docs describe the fused model; T1 person/org additions invisible in docs,
inert in code. **Net direction: stuck-old, with inert code→intent schema scaffolding.**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| PPA-R01 | T1 org/membership/clerk_user_id/org_id added + backfilled; **zero readers/writers** | code→intent | H | P0 | `profiles.ts:135-203`; `0106_…sql:1-119`; empty `rg` in `apps/api/src/` |
| PPA-R02 | `profiles.isOwner` is the **sole** live authz discriminator; write-once in practice | stuck-old | H | P0 | `profiles.ts:91`; `profile-scope.ts:44`; `services/profile.ts:221,257`; `CONTEXT.md:24-25,368` |
| PPA-R03 | `family_links` is the live parent-child graph; "mentor" role is backfill-only | stuck-old | H | P0 | `profiles.ts:284-311`; `services/profile.ts:101-130`; `0106_…sql:87-99`; `CONTEXT.md:320` |
| PPA-R04 | `profiles.clerk_user_id` exists, backfilled for owners, read by nobody | code→intent | M | P1 | `profiles.ts:80-85`; `0106_…sql:106-113`; `middleware/account.ts:79-86` |
| PPA-R05 | One-owner-per-org enforced only by a **run-once backfill RAISE**, no persistent constraint | stuck-old | M | P1 | `0106_…sql:38-49`; `profiles.ts:111-132` |
| PPA-R06 | Subscription still keyed on `accountId`; `organization_id` inert; 2nd quota-role binary | stuck-old | M | P1 | `billing.ts:37-47,143`; `quota-provision.ts:15,67-87`; `subscription-core.ts:66-73` |
| PPA-R07 | Consent anchored to `profileId`, managed-minor only; credentialed minor absent | stuck-old | H | P0 | `profiles.ts:313-376`; `services/consent.ts:473-575`; `PRD.md:424`; `age.ts:53-64` |
| PPA-R08 | The flag/shim machinery (`MODE_IDENTITY_V1`, `ensureIdentityV1`, …) was **never built** | aligned | L | P3 | `README.md:17-18`; zero `rg` matches |
| PPA-R09 | `memberships` has no RLS; coverage test blind (column is `person_id`) | code→intent | M | P1 | `profiles.ts:141-144`; `profiles.test.ts:87` |
| PPA-R10 | Docs describe fused model only; `architecture.md:373` cites removed `parent/teen/learner` types | docs-stale | M | P1 | `architecture.md:373,1624`; `PRD.md:892`; `CONTEXT.md:18-27` |
| PPA-R11 | PRD describes child→"standalone Free account" graduation that is **not implemented** | stuck-old | M | P1 | `PRD.md:465-473`; `billing/family.ts:586-626`; gap-audit:335-346 |

**Load-bearing note (PPA-R02/R06):** `isOwner` is not just a column to rename — it is read directly by
middleware, the profile service, billing quota-provision, and the proxy guard, *and* mirrored by the
`profileQuotaUsage.role` text enum. `CONTEXT.md:368` actively instructs agents to *"prefer isOwner for
profile checks,"* so the doc is propagating the very constraint the intent retires. Open: should
`CONTEXT.md` be annotated `[TRANSITIONAL]` now to stop agents hardening `isOwner` patterns before the cut?

### 2.2 Organization / Membership / tenancy  *(DEEP)*

**Staleness:** tenancy is entirely account-scoped as-built; org/membership concept absent from all three
doc anchors. **Direction: stuck-old; inert code→intent tables.** (Heavy overlap with 2.1 — deduped: the
distinct contribution here is multi-org and RLS.)

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| ORG-01 | `organizations`/`memberships` defined+backfilled, no service reads them | code→intent | H | P0 | `profiles.ts:135-203`; `0106_…sql:1-120`; `services/profile.ts:101-130` |
| ORG-02 | `profileMeta.isOwner` is sole authz signal; `memberships.roles[]` never consulted | stuck-old | H | P0 | `proxy-guard.ts:58`; `profile-scope.ts:44,132,200`; `profiles.ts:180` |
| ORG-03 | Family relations via `family_links`; ≥3 Inngest fns query it directly | stuck-old | H | P1 | `services/profile.ts:101-130,388,760`; `weekly-progress-push.ts:25,282-283`; `recall-nudge-send.ts:133-134` |
| ORG-04 | `subscriptions.organization_id` backfilled = `account_id`, never read | code→intent | M | P1 | `billing.ts:37-47`; `account-repository.ts:32-37`; `subscription-core.ts:66-70` |
| ORG-05 | `profiles.clerk_user_id` backfilled for owners only, no auth reader | code→intent | M | P1 | `profiles.ts:80-85`; `0106_…sql:105-113`; `services/account.ts:57-60` |
| ORG-06 | RLS coverage scanner blind to `memberships`/`organizations` (`person_id`, not `profile_id`) | stuck-old | H | P0 | `rls-coverage.test.ts:54-82`; `profiles.ts:141-144`; `rls.ts:13-15` |
| ORG-07 | `docs/PRD.md` silent on Organization/Membership across all 1760 lines | stuck-old | H | P0 | `PRD.md:435-484,892,969,1601` |
| ORG-08 | `architecture.md` names `family_links` as the canonical+forward role mechanism | stuck-old | H | P1 | `architecture.md:96,373,580,1128,1941,1947` |
| ORG-09 | No DB constraint enforces one-owner-per-org (backfill RAISE is one-time) | stuck-old | M | P1 | `profiles.ts:188-199`; `0106_…sql:39-49` |

**Multi-org gap (carries into billing/consent):** the `memberships` UNIQUE is on `(person_id,
organization_id)`, so a person in two orgs is schema-legal but unmodeled everywhere — whose
subscription, quota, consent, and visibility govern is unanswered (intent §8/§11). Flag for Phase B.

### 2.3 Roles, capabilities, authorization & data-scoping  *(DEEP)*

**Staleness:** authorization is `isOwner` + four guards; the three-role set is schema-only. **Direction:
stuck-old; one structural code→intent (org-subscription FK).**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| RC-01 | All runtime authz reduces to `isOwner` boolean; `memberships.roles` never read | stuck-old | H | P0 | `profiles.ts:91`; `profile-scope.ts:44,132`; `family-access.ts:154` |
| RC-02 | `proxy-guard` treats `isOwner===false` as "child proxy" — **mis-blocks Mentors / 2nd Owners** | stuck-old | H | P0 | `proxy-guard.ts:57-63`; comment at `proxy-guard.ts:24` (not :34-36 — verifier) |
| RC-03 | Mentor role schema-present, zero enforcement; `assertParentAccess` reads `family_links` | stuck-old | M | P1 | `family-access.ts:26-53,126-143`; backfill (mentor from `family_links`) |
| RC-04 | Student role never materialized; "own-data" enforced implicitly by `createScopedRepository` | stuck-old | L | P3 | `repository.ts:71-84`; backfill (student always included) |
| RC-05 | "Minor ≠ Owner/Mentor" only partially enforced (consent surface); no age gate on `isOwner=true` | stuck-old | M | P1 | `family-access.ts:76-106`; `services/profile.ts:352-358`; `profiles.ts:91` |
| RC-06 | `memberships` RLS gap is structural, not just deferred (scanner blind to `person_id`) | code→intent | M | P2 | `profiles.ts:143-144,174`; `rls-coverage.test.ts:79,27-52` |
| RC-07 | **No capability matrix anywhere** — authz is ad-hoc `isOwner` checks across route guards | stuck-old | H | P0 | `family-access.ts:76-157`; `proxy-guard.ts:34-74`; `audience-matrix.md:106,130` |
| RC-08 | `architecture.md:373` + `CONTEXT.md:368` canonicalize `isOwner` and removed persona types | docs-stale | M | P1 | `architecture.md:373`; `CONTEXT.md:24-25,352-354,368-370` |
| RC-09 | `subscriptions.organizationId` in schema+backfill, runtime+docs fully account-keyed | code→intent | H | P1 | `billing.ts:41-47`; `CONTEXT.md:281-283`; `architecture.md:580-588` |
| RC-10 | `architecture.md:1648` marks COPPA **"Covered"** — true only for managed-minor path | stuck-old | H | P0 | `architecture.md:66,1648`; `family-access.ts:76-106` |

**Load-bearing note (RC-02):** the proxy guard is the sharpest *authorization* drift. It was built for the
two-party owner-parent / non-owner-child world; under the role model a credentialed Mentor or a second
Owner has `isOwner=false` and would be wrongly blocked from writes. This guard is also what blocks
child-self-study today (see learn-1) — it sits at the intersection of the roles cut and the COPPA cut.

### 2.4 Consent / COPPA  *(DEEP — load-bearing, extra scrutiny)*

**Staleness:** internally coherent and correct for the *old* world (managed minor, parent-owns-account,
`isOwner` as the single consent gate); the new world's credentialed minor is absent from code and every
doc. **Direction: stuck-old; three P0s.**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| CC-01 | Consent stack has **zero** awareness of credentialed minor / `clerk_user_id` | stuck-old | H | P0 | `services/consent.ts` (0 hits `clerkUserId`); `middleware/consent.ts`; `routes/consent.ts`; `PRD.md:172` |
| CC-02 | Consent authority hard-wired to `isOwner` + `family_links` (incl. revocation Inngest job) | stuck-old | H | P0 | `routes/consent.ts:491,529,573`; `services/consent.ts:1134-1154`; `consent-revocation.ts:120-145` |
| CC-03 | Flow #5 (GDPR 7(3) self-revoke) is **parent-only**; no data-subject self-revoke path | stuck-old | M | P0 | `routes/consent.ts:523-565`; `family-access.ts:76-106`; `ux-spec:2136-2142` |
| CC-04 | `COPPA` is a vestigial enum — never written; dashboard carries BUG-465/466 GDPR-only filters | stuck-old | M | P1 | `consent.ts:268-283,943-950`; `dashboard.ts:837-839,1075-1076` |
| CC-05 | `requestConsent` guard **semantically wrong** for a minor's own account | stuck-old | H | P0 | `routes/consent.ts:237-246,217-235`; `PRD.md:393-427` |
| CC-06 | Credential-eligibility age (~13) **exists nowhere in code**; only consent age (≤16) is coded | stuck-old | M | P1 | `consent.ts:260-283`; **`MINIMUM_AGE=11` is in `services/consent.ts`, not `age.ts`** (verifier-corrected) |
| CC-07 | Revocation job resolves authority via `getFamilyOwnerProfileId` (`isOwner`+`family_links`) | stuck-old | H | P1 | `services/consent.ts:1134-1154`; `consent-revocation.ts:120-145` |
| CC-08 | `architecture.md:373` records "Clerk orgs wrong abstraction" as current policy; intent builds Neon org | 3-way | M | P1 | `architecture.md:373`; `profiles.ts:135-144,80-85` |
| CC-09 | `architecture.md:138` claims "enforced at repository layer" — false for un-RLS'd `memberships` | 3-way | M | P1 | `architecture.md:138`; `profiles.ts:140-144` |
| CC-10 | `getConsentStatus` latest-row-wins, unfiltered by type; safe only while COPPA unwritten | stuck-old | L | P2 | `consent.ts:1021-1030`; `middleware/consent.ts:163-199`; `dashboard.ts:837-845,1075-1083` |
| CC-11 | Web consent page is consent-type-agnostic (resolves by token) — wrong legal copy if COPPA activates | stuck-old | L | P2 | `schemas/consent.ts:15-35`; `consent-web.ts:347`; `consent.ts:817-909` |

**The load-bearing chain (CC-01/02/05):** today a minor's consent is requested by an account *owner* whose
account email must differ from the parent email (`consent.ts:237-246`), and `assertCanRequestConsentForChild`
verifies the child profile shares the caller's `accountId`. For a credentialed minor on their *own* Clerk
account, both checks are nonsensical — the ownership check fails first, and the email guard presupposes the
caller is the parent. There is no design for *who consents, how own-login signup is age-gated, whether
graduation re-triggers consent, or cross-org consent*. This is the gate on the whole re-platform.

### 2.5 Billing / subscriptions / quota / seats  *(DEEP)*

**Staleness:** uniformly account-anchored across lookup, metering, seats, webhooks, family ops, quota.
`organization_id` is inert dead weight. **Direction: stuck-old; three 3-way gaps with no resolution
in any layer.**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| BL-01 | Every subscription path keys on `accountId`; `organization_id` has no reader/writer | stuck-old | H | P0 | `billing.ts:37-47`; `subscription-core.ts:428-455`; `stripe-webhook-handler.ts:447-533` |
| BL-02 | Family = same-`accountId` profiles; cross-account transfer hard-blocked (no invite/claim) | stuck-old | H | P0 | `billing/family.ts:62-107,480-487`; `profiles.ts:168-200` |
| BL-03 | `profileQuotaUsage.role` DB CHECK = `'owner'|'child'`; Mentor has **no** billing mapping | stuck-old | H | P1 | `billing.ts:143,163-165`; `quota-provision.ts:15,67-87` ⚠cite-unverified (count) |
| BL-04 | Cancellation cascade is account-reassignment, not org-membership removal; `usageEvents` orphaned | stuck-old | H | P0 | `billing/family.ts:586-646,480-487`; `billing.ts:185-213`; `PRD.md:458-473` |
| BL-05 | Quota pool hangs off `subscriptionId→accountId`; KV key profile-scoped; "org-of-one FREE" unenforced | stuck-old | H | P1 | `subscription.ts:43-119`; `metering.ts:140-155`; `architecture.md:775` |
| BL-06 | **Multi-org subscription routing: gap in all three layers** | 3-way | H | P0 | `metering.ts:140-155`; `profiles.ts:168-200`; PRD/arch silent |
| BL-07 | No `ensureOrgOfOne` at signup; "every person ≥1 org at signup" (D1) unwired | 3-way | H | P1 | `subscription-core.ts:428-455`; `architecture.md:1612`; `PRD.md:1478-1491` |
| BL-08 | 4+ billing write paths gate on `isOwner`; `memberships.roles` unread | stuck-old | M | P1 | `billing/family.ts:324,527,604`; `quota-provision.ts:80-86` (family.ts:324 is in `getUsageBreakdownForProfile`, not `listFamilyMembers` — verifier) |
| BL-09 | Seat = profile-count by `accountId`, not membership-count by org; per-seat vs flat-tier unspecified | stuck-old | M | P1 | `billing/family.ts:62-107`; `PRD.md:1480-1481,1590` |
| BL-10 | `billing.ts:41-44` "becomes the billing key in T4" comment is a dead incremental-path artifact | 3-way | L | P2 | `billing.ts:41-44`; `2026-05-31-billing-recovery-learner-capacity.md:80-81` |

### 2.6 Auth / credentials / sessions / graduation  *(DEEP)*

**Staleness:** auth resolves Clerk→`accounts`→`profiles` with **zero** dual-model branching; the
`accounts` table is a permanent load-bearing join. **Direction: stuck-old; the clean cut is a total
middleware rewrite with no current modeled path.**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| ACG-01 | `profiles.clerk_user_id` on disk + backfilled, **zero** live readers; auth is `accounts`-centric | code→intent | H | P0 | `profiles.ts:54,80-85`; `0106_…sql:105-113`; `middleware/account.ts:79-86` |
| ACG-02 | **Graduation flow (managed→credentialed) fully absent** in code and docs | stuck-old | H | P0 | `billing/family.ts:437-485`; archive `…t2-auth.md:1-21`; `PRD.md:966-980` |
| ACG-03 | "One person, multiple logins" = multiple OAuth in one Clerk user → UNIQUE `clerk_user_id` is **correct** | aligned | L | P2 | `profiles.ts:80-85` ⚠cite-unverified (re-read :80-90) |
| ACG-04 | Authz uses `isOwner`, not `memberships.roles`; both models co-present in schema | stuck-old | H | P1 | `family-access.ts:137,154`; `profiles.ts:91,44-48,135-144`; `routes/account.ts:59` |
| ACG-05 | Account-security = password-change only; 2FA removed; email-change absent; plan classification-pending | 3-way | M | P2 | `account-security.tsx:16-19,49`; `routes/account.ts:1-154`; `services/account.ts:92-149` |
| ACG-06 | No dual-resolution branching anywhere; dropping `accounts` (T7) = total middleware rewrite | stuck-old | H | P1 | `middleware/account.ts:79-86`; `profile-scope.ts:185`; `services/profile.ts:557-563` |
| ACG-07 | Credentialed-minor consent path entirely absent (mirrors CC-01; the COPPA load-bearer) | stuck-old | H | P0 | `profiles.ts:313-376`; `architecture.md:138`; `PRD.md:393-426` |

**Resolved unknown (ACG-03):** the schema comment at `profiles.ts:83-84` says *"Multiple emails/OAuth
providers live inside one Clerk user, so a single id per person suffices."* So "multiple logins per person"
means multiple OAuth providers within one Clerk user — the UNIQUE scalar is *consistent* with intent, not a
limitation. This resolves a doc-vs-intent apparent conflict. (Single-source claim — re-read before relying.)

### 2.7 Light clusters

**Notifications / progress / nudges** — *Direction: stuck-old.*
- `notif-progress-1` (M/P1): weekly progress **rows** for a linked child are only written by the
  parent-notification cron; if the parent disables both weekly channels the child's own Progress tab is
  **empty forever** and the child cannot unblock it. Generation is coupled to the owner's delivery prefs —
  the exact opposite of intent flow #7. `weekly-progress-push.ts:289-309,714-722`; `solo-progress-reports.ts:53-84`; gap-audit:681-703.
- `notif-owner-coupling` (H/P2): recipient resolution is `isOwner` + `family_links` across child-cap,
  struggle, weekly, monthly paths; `memberships` unread. `child-cap-notifications.ts:68-87`;
  `notifications.ts:619-621`.
- `notif-plan-identity-triage` (L/P2): the nudges plan is correctly re-triage-tagged; T1/T2 are
  identity-independent, T4 (child→parent nudge auth) depends on the cut. `nudges.ts:12-38`.

**Onboarding / profile-setup / personalization** — *Direction: stuck-old + docs-stale.*
- `ob-1` (M/P1): first-run personalization chain is **broken** — `create-profile.tsx` exits to home and
  never visits `onboarding/*`; pronouns/tutor-language/interests are unreachable on first run though all
  three endpoints exist. `create-profile.tsx:174-176,375-381`; `onboarding/index.tsx:10`.
- `ob-2` (L/P2): UX spec's three-persona auto-detection (teen/adult/parent + per-persona themes) is **not
  implemented** (two-audience chooser, no age-derived theme; persona themes removed in Epic 12).
  `ux-spec:650-653,377-391`; `WelcomeIntro.tsx:17`.
- `ob-3` (H/P0): credentialed-minor consent gap, mobile face of CC-01/ACG-07. `services/profile.ts` GRANTED-vs-PENDING
  logic at :399-415 (JSDoc at :326-332 — verifier); `create-profile.tsx:344-346`.
- `ob-4` (M/P1): profile-setup plan is identity-coupled (T3/T4 build on `isOwner`/`assertOwnerProfile`).
  `onboarding.ts:62-67,95`; plan:83-88,159-168.

**Curriculum / learning-sessions / library scoping** — *Direction: well-engineered for old model; auth-coupled.*
- `learn-1-proxy-guard-blocks-child-study` (H/P0): the proxy guard blocks **every** learning write for
  non-owner profiles — the documented child-study persona (P3) cannot start a session, send a message, or
  create a subject. The full core loop is dead-ended for the one persona the mobile contract fully exposes.
  `proxy-guard.ts:58`; `routes/subjects.ts:67,81,97,116,142,171`; `navigation-contract.ts:297` (string
  assignment at :298 — verifier); gap-audit:44-70.
- `learn-2-mentor-org-write-absent` (M/P1): Mentor org-wide write (intent learn-2) has **no
  implementation surface**; only `clone-from-child` exists (copies into mentor's own curriculum).
  `proxy-guard.ts:57-63`; gap-audit:491-514.
- `learn-3-subject-delete-unimplemented` (L/P2): no subject DELETE; a complete plan exists, scoped by
  `profileId` (not org), plausibly landable pre-cut. `routes/subjects.ts:47-184`; plan:1-239 (file is 239
  lines, not 240 — verifier).
- `topic-connections-no-profileid-rls` (L/P3): `topic_connections` has no `profileId`/RLS; isolation is
  transitive via parent-chain pre-filter only — a latent leak if a future mentor-read path skips it.
  `subjects.ts:254-300`.

---

## 3. Cross-cutting threads

**T-1. The four parallel role/ownership systems.** `isOwner` (boolean) · `profileQuotaUsage.role`
(`owner|child`) · `AgeGateRole` (`owner|child|impersonated-child`) · inert `membershipRoleEnum`
(`owner|mentor|student`). The clean-cut design must **collapse the first three into one membership-role
resolution**, not merely replace `isOwner`. Citations: `profiles.ts:91`; `billing.ts:143`;
`CONTEXT.md:368`; `profiles.ts:44-48`.

**T-2. Consent/COPPA under own-logins (the P0 gate).** Consolidates PPA-R07, CC-01/02/03/05, ACG-07, ob-3,
and gap-audit `consent-1/2/3/4/7`. Needs a dedicated functional consent spec + legal check *before* any
code on graduation, credentialed signup, or cross-org membership. The DeepSec MUST-2 and MUST-6 sit inside
this thread (see §4).

**T-3. T1 inertness & the revert.** The `0106` additions are committed + applied to shared DBs but wired to
nothing. The schema/comment debris still narrates the dead incremental path ("becomes the billing key in
T4" — `billing.ts:41-44`; "that is T2-T6" — `profiles.ts:137`). Per README guardrail-4, do **not** delete
`0106` in isolation; sequence a forward-only drop (or fold into the clean re-baseline) at Phase F. Open:
does backfill data need explicit clearing, or does `DROP … CASCADE` suffice?

**T-4. RLS person_id scanner blind spot (security-structural, not just deferred).** `rls-coverage.test.ts`
keys on `profile_id`; `memberships`/`organizations` use `person_id`, so they escape the scanner **without**
an `RLS_EXCEPTIONS` entry, and `0106` contains zero `ENABLE ROW LEVEL SECURITY` statements. The green
coverage test is a false negative. If the clean-cut model reintroduces a `person_id`-scoped table, it needs
RLS *and* a coverage guard from day one. `rls-coverage.test.ts:54-85`; `0106_…sql:4-9`.

---

## 4. Audit re-triage — DeepSec-R2 (folded in)

Of the DeepSec-R2 MUSTs, **only two are identity-coupled**; the rest are safe to fix now on the current
model. The two coupled ones nonetheless have a *live attack surface* — the verifier's recommended pattern
is **stop-gap on the current model now, canonical fix in the rewrite** (note: "stop-gap" isn't one of the
three enum verdicts, so both are tagged `fold-into-rewrite` but should get a minimal patch immediately).

| MUST | What | Verdict | Note |
|------|------|---------|------|
| P0-1 | Logfire `sk-lf-` secret in `settings.local.json` | **do-now** | Rotate + history scrub; time-sensitive; orthogonal to identity. `consolidated-triage.md:219-221,409` |
| MUST-2 | Consent request can target arbitrary same-account profiles; public deny cascade-deletes it | **fold** (+stop-gap now) | Add server check: target has `PARENTAL_CONSENT_PENDING` + requestor is owner. `…911b3664da.md:23` |
| MUST-6 | Profile deletion non-atomic vs consent restoration | **fold** (+stop-gap now) | Wrap archive-cleanup check+delete in a transaction. `…a46e5673e1.md:23` |
| MUST-1 | Proxy-write gap in 3 library-filing routes | **do-now** | Add `assertNotProxyMode` (already on 17 siblings). `…336e2bca03.md:23` |
| MUST-3 | Any `@claude` comment invokes secret-backed CI agent | **do-now** | CI trust gate. `_r2-catalogue.tsv:3` |
| MUST-4 | Same-day same-mode dictations overwrite (silent data loss) | **do-now** | Per-completion idempotency key. `…e0853d1c31.md:23` |
| MUST-5 | Trial-expiry cron downgrades just-converted payer | **do-now** | One-line `status='trial'` guard. `…4ebbd964c7.md:23` |
| MUST-7 | Dormant web ChatShell voice controls bound to stale handlers | **do-now** | Extend `isWebDormant` guard. `…063502d673.md:23` |
| MUST-8 | Top-up credits stranded after tier upgrade | **do-now** | Migrate null-profileId rows / broaden read. `…e9ddd7be3e.md:23` |
| MUST-12-14 | quick-check / homework-summary LLM calls unmetered | **do-now** | Add quota enforcement. `consolidated-triage.md:282-294` |

> The two coupled MUSTs land inside thread T-2 — they are evidence that the current consent model already
> has exploitable edges, which strengthens the case for the consent spec being a Phase-B/D priority, not a
> post-cut afterthought.

---

## 5. Sibling-plan provisional re-triage (folded in)

All 7 `2026-05-31` plans are now tagged in `docs/plans/` (provisional note, 2026-06-01). The workflow
validated the ROADMAP preliminary verdicts against intent + code; **one diverges**. This stays provisional —
the real couple-vs-independent split happens after the domain model (Phase D).

| Plan | Coupling | Verdict | vs. ROADMAP |
|------|----------|---------|-------------|
| `resumable-practice-state` | none | **proceed now** | confirmed — `profileId`-scoped AsyncStorage, no identity contact |
| `learning-library-cleanup` | low | **proceed now** | **DIVERGES** — plan already excised `learn-2`; ROADMAP's `learn-2` caution is moot (plan:52) |
| `notification-reachability-nudges` | partial | **split** | confirmed — T1/T2 independent; T3/T4/T5 family-link/membership-coupled |
| `profile-setup-personalization-corrections` | coupled | **fold** | confirmed — onboarding = who-creates-whom + roles + consent (T3/T4 on `isOwner`) |
| `billing-recovery-learner-capacity` | coupled | **fold** | confirmed — T3/T4/T5 **hard-blocked on `learn-1`**; per-profile quota conflicts with org-pool intent |
| `account-security-self-service` | heavy | **fold** | confirmed — entire premise rests on `clerk_user_id`-unique / one-login-per-account, the exact constraint the cut replaces |
| `product-continuity-low-hanging-fruit` | none | **evaluate standalone** | confirmed — pure UX polish, no identity contact |

**Execution-ordering risk the critic flagged:** `account-security-self-service`'s CRITICAL-1 email-sync
writes to the same `clerk_user_id`/`accounts.email` surface T2 remodels (`account-security.md:99`) — even
though the plan scopes itself "out of identity." Don't let it ship an email-sync against `accounts` that the
cut then discards.

---

## 6. Canonical-doc staleness → PRD-refresh backlog

| Doc | Priority | Why |
|-----|----------|-----|
| `docs/PRD.md` | **P0** | 2025-12-11, original 11–15 parent-managed model. No Organization/Membership; consent is managed-minor only; billing per-account; `:424` self-marks COPPA section MISSING; audience-drift unresolved. |
| `docs/architecture.md` | **P1** | 2026-05-23, predates `0106`. Schema map (`:580,1128`) omits `organizations`/`memberships`; `:373` cites removed `parent/teen/learner` types; `:1648` marks COPPA "Covered" (managed-only); names `family_links` as forward-compatible (`:1941-1947`). |
| `CONTEXT.md` | **P1** | 2026-05-29. `:320` "each Profile is Owner or Child"; `:368` "prefer isOwner" — actively steers agents to the retiring model; no Person/Org/Membership/Credentialed concepts. |
| `docs/ux-design-specification.md` | **P1** | Three-persona themes (Epic-12-removed); managed-minor consent only; **no** invite/claim (flow #1) or graduation (flow #2) UX; uses non-existent `accountOwnerId` field (`:2126`). |
| `docs/audience-matrix.md` | **P2** | Accurate snapshot of the *old* `isOwner`/role/birthYear gating — precisely what must change; needs full replacement when roles land. Also references non-existent `accountOwnerId`. |
| `docs/project_context.md` | **P3** | Mostly identity-neutral (scoped-repo patterns survive); only minor schema-list staleness. |

**Doc fossil to note (not delete):** `accountOwnerId` appears in `ux-design-specification.md:2126` and is
referenced via `audience-matrix.md`, but **does not exist** in `profiles.ts` or `@eduagent/schemas` — a
speculative/old-model field; as-built child detection uses `family_links`.

---

## 7. Coverage boundary — five areas the main run did not reach  *(now swept — see §7A)*

The completeness critic surfaced five identity-adjacent areas no main-run cluster analyzed. **All five were
subsequently swept** by a focused 8-agent verified addendum (run `wf_b9dcc01e-849`) — findings in **§7A**.
The list below is retained as the boundary record; each item is now ✅ closed:

1. **Self-registered minor (P2) persona** — the proto-credentialed-minor. `consent-1`/`consent-2` (HIGH):
   the consenting parent is a bare email with no account, no `family_link` is created, so the revoke path is
   structurally unreachable (`consent.ts:1232-1239`). No cluster modeled this lifecycle.
2. **Non-owner minor's GDPR data-subject-rights cluster** — `auth-1`, `consent-3/4/7`, `family-4/5`: a
   non-owner minor cannot self-export, self-erase, leave-with-data, or survive owner deletion. Load-bearing,
   because the membership model is *supposed* to make these exercisable without account-ownership.
3. **Navigation spec + plan (`2026-05-19-…-FULL.md`, plan + spec)** — the largest, most recently authored
   specs; both bake `isOwner && family_links` as the implementation target with zero `memberships`
   reference (plan:476,500,505; spec:34,484-505). High identity-coupling, unreviewed.
4. **`docs/flows/*` and store-compliance docs** — `mentor-flow-access-inventory.md` (Mentor = "adult owner
   + family links"), `flow-master-directory.md`, `ACCOUNT-30.md` (proxy = `!isOwner`), and the App
   Store/Play **legal-facing** `app-privacy-data-safety-worksheet.md` / `store-compliance-checklist.md`
   (consent = `MINIMUM_AGE=11` + parental gating, data via `family_links`). The store docs gate any launch
   of a credentialed-minor path.
5. **`docs/audits/2026-05-31-logical-gap-audit.md`** — the 36-gap audit is high-signal, well-cited, and was
   **not** cited by any cluster though it directly verifies many findings here. Treat it as ready-to-use
   evidence and a coverage cross-check for Phase B.

---

## 7A. Addendum — coverage-boundary sweep (closes §7)

A focused 8-agent Sonnet sweep (6 area readers + 2 split adversarial verifiers, run `wf_b9dcc01e-849`,
~646K tokens, ~11 min) closed all five §7 areas. **Verification: 166 citation checks, 4 `partial`
(precision nits), zero `misquoted`/`not-found`.** Net effect: the consent thread T-2 is *larger* than the
main map captured, one new authority-resolution bug surfaced, the navigation migration seam is identified,
and the 36-gap audit is now a cited evidence index. Same legend as §2.

### 7A.1 Self-registered minor (P2) — the proto-credentialed-minor  *(P0)*

A minor who self-registers becomes `isOwner=true` on their own account; the consenting parent is a **bare
email with no account and no `family_link`**. This is the live preview of the credentialed-minor design
problem — and it is broken today in ways that are independently regulatory failures.

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| PM-CONS-01 | GDPR 7(3) revoke **structurally unreachable** (3 independent blocks); consent page makes an unfulfillable written promise | stuck-old | H | P0 | `consent.ts:1226-1240`; `routes/consent.ts:523-532`; `consent-web.ts:207` ("withdraw any time from the parent dashboard") |
| PM-CONS-02 | Approval forms **no durable parent-child linkage**; oversight surfaces gated on a `family_link` that never exists | stuck-old | H | P0 | `consent.ts:890-908,1191-1204`; `profile.ts:369` (isOwner write; :465 is the derived flag — verifier) |
| PM-CONS-03 | **No pre-signup age gate** on Clerk account creation; consent check runs only post-profile-create | stuck-old | H | P0 | `consent.ts:196-283`; `profile.ts:398-416`; `profiles.ts:50-69` |
| PM-CONS-04 | Graduation consent carry-over absent (no graduation flow → no answer) | stuck-old | M | P0 | `profiles.ts:80-85,313-376`; ties to ACG-02 |
| PM-CONS-05 | **NEW BUG:** `getFamilyOwnerProfileId` falls back to the **minor's own profileId** as consent authority | stuck-old | M | P1 | `consent.ts:1134-1154` (`:1143-1144` fallback) |

**PM-CONS-05 is a genuine correctness bug, not just drift:** for a P2 minor the consent-authority resolver
silently returns the minor as their own authority — the opposite of the regulatory requirement, undetected,
no comment flagging it. Extends main-map CC-07. *Open: should it throw rather than fall back?*

### 7A.2 Non-owner minor's GDPR data-subject rights  *(P0)*

Every account-lifecycle gate is `assertOwnerProfile`-bound; the only per-profile delete primitive is
Inngest-only; graduation is impossible because the one migration path never grants the moved profile owner
rights. Maps to flows #3/#4/#6 and gaps `auth-1`/`consent-3/4/7`/`family-4/5`/`identity-3/4`.

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| dsrights-1 | Non-owner has **no self-export**; sole export route is account-scoped + owner-gated | stuck-old | H | P0 | `routes/account.ts:144-153`; `export.ts:186-202`; `navigation-contract.ts:365` |
| dsrights-2 | Non-owner has **no self-erasure / leave-with-data**; no `DELETE /profiles`; delete primitive Inngest-only | stuck-old | H | P0 | `routes/account.ts:53-64`; `deletion.ts:279-286`; `family.ts:496-537` |
| dsrights-3 | Owner deletion destroys **all** profiles; no member-preservation / claim path | stuck-old | H | P0 | `routes/account.ts:67-80`; `account-deletion.ts:61-64`; `delete-account.tsx:312-326` |
| dsrights-4 | **Graduation impossible** — `downgradeAllFamilyProfiles` moves account but never sets `isOwner=true` | stuck-old | H | P0 | `profile.ts:369`; `family.ts:603-626` (`.set({accountId,updatedAt})` only); `family-access.ts:145-156` |
| dsrights-5 | T1 org/membership additions are inert — provide no relief for any of these rights | code→intent | M | P1 | `profiles.ts:135-143,145-200`; zero route readers |

### 7A.3 Navigation spec + plan  *(P0 — the priority; migration seam identified)*

The 2026-05-19 nav spec/plan are the most recent, most adversarially-reviewed specs in the repo and contain
**zero** `memberships`/`organizations` references — a true 3-way divergence. `resolveNavigationContract` is
already shipped against `isOwner` + `hasFamilyLinks`. **The good news: that function IS the single,
sufficient migration seam.**

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| NAV-01 | Family-capability predicate built entirely on `isOwner` + `hasFamilyLinks` — the root coupling | stuck-old | H | P0 | `navigation-contract.ts:190-218`; spec:110; plan:476,500,505; `age.ts:53-64` |
| NAV-02 | All 8 `gates.*` UI affordances resolve through `ownerRole` (`role==='owner'` from `isOwner`) | stuck-old | H | P0 | `navigation-contract.ts:359-376,241-243`; `use-active-profile-role.ts:60-62` |
| NAV-03 | `getLinkedChildIds` = `profiles.filter(!isOwner)` — a proxy for org membership that breaks under multi-org | stuck-old | M | P1 | `navigation-contract.ts:190-198`; `legacy-navigation-contract.ts:54-60` |
| NAV-04 | Spec records "bind capability to `family_links`" as a hardened CRITICAL-3 resolution, **no transitional marker** | docs-stale | M | P1 | spec:737-738,75-76,762-763 |
| NAV-05 | **`resolveNavigationContract` is the clean migration seam** — `ProfileContext` is the boundary; all consumers funnel through it | code→intent | L | P2 | `navigation-contract.ts:72-80,245-510`; `use-navigation-contract.ts:61-122` |
| NAV-06 | **V0 bug:** legacy `FAMILY_MODE_TABS` omits `recaps` (spec:48 known-gap); moot if V0 deleted at cut | stuck-old | L | P3 | `legacy-navigation-contract.ts:25-29`; `navigation-contract.ts:152-157` |
| NAV-07 | `useActiveProfileRole` derives role from `isOwner`; the type mixes role (`child`) and proxy-state (`impersonated-child`) | stuck-old | H | P1 | `use-active-profile-role.ts:60-62`; `navigation-contract.ts:8,77` |
| NAV-08 | Both nav docs: **zero** membership/org reference; 6 test suites embed `isOwner`/`hasFamilyLinks` fixtures | 3-way | H | P0 | spec/plan grep (0 hits); `profiles.ts:135-144` |

**Migration seam (NAV-05) — the actionable finding for Phase D/E:** swap at four points — (1)
`ProfileContext.role` ← the active org's `membership.roles` set; (2) replace `hasFamilyLinks` with an
"org-member-with-student-role" predicate; (3) drop `getLinkedChildIds`'s `!isOwner` filter; (4) replace
`useActiveProfileRole`'s `isOwner` derivation. **Forward warning:** the six nav-contract test suites
(`acceptance/guard/property/totality/snapshot/plain`) all embed old-model fixtures and **break together** on
the cut — budget for it.

### 7A.4 `docs/flows/*`  *(P1–P3, accurate-to-code but blind-to-intent)*

| ID | Doc | Dir | Blast | PRD | Note |
|----|-----|-----|-------|-----|------|
| FLOW-D1 | `mentor-flow-access-inventory.md` | stuck-old | H | P1 | Mentor = "adult owner + server-sourced family links" (`:39-43,102,112`) |
| FLOW-D2 | `flow-master-directory.md` | stuck-old | M | P2 | Names CLAUDE.md `isOwner` as authoritative; "intentional" V0/V1 split note doesn't cover V2-identity (`:19,30-33`) |
| FLOW-D3 | `master-directory/account/ACCOUNT-30.md` | stuck-old | L | P3 | `parentProfile` via `profiles.find(isOwner)` (`use-parent-proxy.ts:26`); proxy already "compatibility only" |
| FLOW-D4 | `student-flow-access-inventory.md` | docs-stale | L | P3 | Billing by "owner profile" — doesn't translate to org-scoped subscription (`:62-63,128-129`) |
| FLOW-D5 | `mobile-app-flow-inventory.md` | 3-way | H | P0 | Consent flows `ACCOUNT-19..27` silent on the credentialed minor (`:128-136`; `0106_…sql:24`) |

### 7A.5 Store-compliance / legal launch gates  *(P0)*

App Store / Play submission artifacts encode `family_links` + managed-child-only consent. **Each is a launch
gate for the credentialed-minor path** — they must be revised before that flow ships.

| ID | Drift | Dir | Blast | PRD | Key citation |
|----|-------|-----|-------|-----|--------------|
| LLG-01 | Privacy worksheet discloses `family_links` as the parent/child data category — wrong schema + semantics post-cut | stuck-old | H | P0 | `app-privacy-data-safety-worksheet.md:41`; `profiles.ts:284-307` |
| LLG-02 | Consent threshold docs are managed-child-only; credentialed-minor path absent. **Confirms CC-06:** `MINIMUM_AGE=11` is in `consent.ts:197`, `age.ts` has none | 3-way | H | P0 | `consent.ts:197,249,280`; `age.ts:1-64` (no constant); `store-compliance-checklist.md:113-114` |
| LLG-03 | **Compliance defect:** store description claims "COPPA/GDPR compliant" — the project's own checklist forbids it without legal sign-off; "under-16s" mis-states the ≤16-inclusive threshold | docs-stale | M | P1 | `store description.md:19`; `store-compliance-checklist.md:93`; `consent.ts:249` |
| LLG-04 | Export schema + disclosure list `family_links`; org-membership export undefined | stuck-old | M | P2 | `app-privacy-data-safety-worksheet.md:26,41`; `schemas/account.ts:123` |

### 7A.6 36-gap audit — evidence index (now cited)

The `docs/audits/2026-05-31-logical-gap-audit.md` (36 gaps, well-cited, adversarially verified) was uncited
by the main run. Cross-referenced against this map: **17 covered, 7 partial, 6 new-uncovered, 4 non-identity**
(of 34 classified — 2 low-severity `practice-*` not re-emitted). **28 of 36 gaps are identity-coupled.**

**Six new-uncovered gaps Phase B must absorb:**

| Gap | What | Coupling | Disposition |
|-----|------|----------|-------------|
| `billing-2` | Remove child from family plan archives profile permanently — no re-add/restore | identity | fold |
| `identity-1` | Free/Plus owner can't remove an added child — tier-gated removal dead-ends | identity | fold |
| `notif-1` | Guardian who never does a personal session never gets OS push permission requested — consent warnings go silent | identity | fold |
| `onboard-3` | Birth date permanently immutable — wrong entry silently mis-gates age bracket + **credential threshold** | identity | fold |
| `billing-3` | Payment failure is silent — no proactive notice; user loses paid access at grace end | **non-identity** | **do now** |
| `onboard-2` | No post-onboarding tutor/conversation-language change — cs/fr/it locales permanently unreachable | **non-identity** | **do now** |

The other 8 non-identity-coupled gaps (`auth-2`, `auth-4`, `notif-2`, `practice-1/2/4`, plus the two above)
are safe to address on the current model without waiting for the cut.

---

## 8. Open questions for the Phase-B vision-lock

Mapped to reconstructed-PRD §11; every one is a real fork the drift exposes:

1. **Target user** — ratify or reject the quiet broadening to tutors / co-parents / credentialed teens
   (audience-drift, PPA-R03, ob-2). The whole role model depends on this.
2. **Role-capability matrix** — produce the Owner/Mentor/Student × action matrix that exists nowhere
   (RC-07). Until it does, new routes will keep inventing `isOwner` patterns.
3. **Consent under own-logins** *(legally load-bearing — thread T-2)* — who consents for a credentialed
   minor; own-login age-gating; graduation re-consent; cross-org consent; minor-first-no-adult. Needs a
   functional spec + legal check (CC-01/02/05, ACG-07).
4. **One-owner-per-org** — rule or soft convention; switchable ownership? (PPA-R05, ORG-09, ACG-04). A DB
   UNIQUE on the owner role complicates transfer.
5. **Multi-org** — whose subscription, quota, consent, visibility when a person is in two orgs (ORG-02/04,
   BL-06, CC-01). Schema already permits it; nothing models it.
6. **Credential threshold (~13)** — product default or legal determination? (CC-06, RC-05). Note it does
   not exist in code today at all.
7. **Success criteria** — define "done" at the product level beyond "36 gaps closed."
8. **Transition strategy** — clean cut is decided in README/ROADMAP; the PRD still carries §10 as open
   `[CONFLICT]`. Confirm and propagate (then sequence the T1 revert as the first implementation step).

---

## Appendix A — Provenance

- **Main run:** `wf_4e6887e0-80e`, 34 agents, ~2.42M Sonnet tokens, 1685 tool calls, ~35 min.
- **Addendum run (§7A):** `wf_b9dcc01e-849`, 8 agents, ~646K Sonnet tokens, 343 tool calls, ~11 min.
  166 citation checks, 4 `partial`, zero `misquoted`/`not-found`. Nits (all substance-intact): `profile.ts:465`
  is the derived `isFirstProfile` flag not the `isOwner=true` write (that is `:369`); `age.ts:53-64`
  `isAdultOwner` checks `role!=='owner'` OR `isOwner!==true`; `use-active-profile-role` role is passed at
  `use-navigation-contract.ts:80` (`:78` is `isParentProxy`); `mobile-app-flow-inventory.md` consent flows
  are `:128-136` (`:137` is ACCOUNT-28).
- **Citation health (main run):** ~342 independent re-checks; **zero `not-found`**; ~17 `partial` (citation range
  pointed at the JSDoc/comment describing the code, or off-by-a-line — substance intact); **2 `misquoted`**,
  both corrected in this map:
  - **CC-06:** `MINIMUM_AGE=11` is in `apps/api/src/services/consent.ts`, **not** `packages/schemas/src/age.ts`.
  - **ob-4 / §10:** reconstructed-PRD §10 heading is literally `[CONFLICT]` (unresolved *in the PRD*); the
    clean-cut resolution is recorded in `README.md` / `ROADMAP.md`, not the PRD.

## Appendix B — Citations to confirm before relying (verifier + critic watchlist)

These specific claims were flagged as not independently re-verified or as quantitative-without-reproduction:
- `profileQuotaUsage.role` exact lines `billing.ts:143` / `quota-provision.ts:73-86` (BL-03) — re-grep.
- "**203** isOwner call-site lines in routes" (RC-01/07) — no reproducible count; `rg -c 'isOwner|assertOwnerProfile' apps/api/src/routes/`.
- `profiles.ts:83-84` multi-login comment (ACG-03) — sole source for a real intent resolution; re-read `:80-90`.
- `family.ts:324` is in `getUsageBreakdownForProfile`, not `listFamilyMembers` (BL-08) — substance (billing gates on `isOwner`) holds; label wrong.
