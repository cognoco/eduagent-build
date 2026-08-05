# Consent Log — As-Built Specification

**Draft v0.1 · agent-drafted · 2026-07-30 · describes the implementation AS IT EXISTS, not as designed**

**Controller:** ZWIZZLY AS, org.nr 811696072, Oslo, Norway.
**Feeds:** DPO action-register row 4, gap item *"consent log spec"*
([`DPO exchanges/2026-07-26-action-register-tracker.md:24`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)).
**Companion:** [`2026-07-30-purpose-basis-recipient-retention-matrix.md`](2026-07-30-purpose-basis-recipient-retention-matrix.md) ·
[`2026-07-30-legitimate-interest-assessments.md`](2026-07-30-legitimate-interest-assessments.md) ·
[`2026-07-30-consent-screen-inventory.md`](2026-07-30-consent-screen-inventory.md)

> **Method and standard of proof.** Every statement below was read from the source in this repository on
> 2026-07-30 and carries a `file:line`. Where the code contradicts an existing compliance document, the code
> wins and the contradiction is recorded in §7. Where a capability does not exist, this document says so
> rather than describing the design intent — the DPO is being asked to approve a **memory-consent unlock**,
> and an inventory that flatters the implementation would be worse than useless.

---

## 1. Summary for the DPO

MentoMate has **two entirely separate consent mechanisms**, built at different times, with different
properties. Conflating them is the single easiest mistake to make when reading this system, and the existing
compliance documents do conflate them.

| | **Mechanism A — the regulatory consent log** | **Mechanism B — the memory consent flag** |
|---|---|---|
| **Storage** | `consent_grant` table (event rows) + `consent_receipt` (survives person deletion) | One column: `learning_profiles.memory_consent_status` |
| **Shape** | Row per (charge person × purpose × organization × lawful basis), timestamped | Mutable enum on the learner's profile row: `pending` / `granted` / `declined` |
| **Purposes covered** | `platform_use`, `llm_disclosure` | Persistent memory and profiling (**P3 / P4**) |
| **Versioning** | `consent_grant.policy_version` column, stamped at grant time and immutable across withdrawal (WI-2929; was an `audit_fact` key, §2.5) | **None** |
| **History** | Grant rows retained; restore appends new rows | **None — the previous value is overwritten** |
| **Grant timestamp** | `granted_at`, `withdrawn_at` | **None** — only `consent_prompt_dismissed_at` |
| **Guardian vs self distinction** | Yes — encoded in `lawful_basis` | **No** |
| **Survives erasure as evidence** | Yes — re-homed to `consent_receipt` | **No** — deleted with the profile row |
| **Enforced?** | Yes | Yes |

**The consequence, stated plainly: the consent that the DPO's interim condition is about — persistent memory
and profiling — is the one that is NOT recorded in the Art 7(1) consent log.** Mechanism B is a working
*control* (it genuinely gates processing, verifiably, in seven places) but it is not an *evidence record*.
It cannot demonstrate when consent was given, against what wording, by whom, or that it was ever given at
all once it has been changed.

This is the central gap for the P3 unlock and it is recorded in full in §6.

---

## 2. Mechanism A — the regulatory consent log

### 2.1 Storage: `consent_grant`

`packages/database/src/schema/identity.ts:480-536`. Declared in the file header as *"append-only per-purpose
consent event log (inv 12/27)"* (`:15`, `:475-476`) — a description §2.4 shows is only partly accurate.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7, time-ordered |
| `charge_person_id` | uuid NOT NULL | FK → `person.id` **ON DELETE RESTRICT** (`:487-489`) — a person holding active grants cannot be deleted until the grants are re-homed. This is the structural fix for the legacy consent-receipt-destruction defect (`I-C1`). |
| `organization_id` | uuid NOT NULL | FK → `organization.id` **ON DELETE RESTRICT** (`:491-493`) |
| `purpose` | text NOT NULL | `:494` — see §2.2 |
| `lawful_basis` | text NOT NULL | `:495` — see §2.3 |
| `granted` | boolean NOT NULL | `:496` |
| `granted_at` | timestamptz NOT NULL, default now | `:497-499` |
| `withdrawn_at` | timestamptz NULL | `:500` |
| `prior_value` | boolean NULL | `:502` — the consent value before this record; supports direction-aware protection-lowering gating |
| `audit_fact` | jsonb NULL | `:504` — provenance (`source`, `guardianPersonId`) plus the adult paths' versioned terms-**acceptance** fact `{ termsAcceptedAt, termsVersion }`. It was also where the policy version lived until WI-2929 promoted it to the column below; the pre-column copies are retained and still read as a fallback. See §2.5 |
| `policy_version` | text NULL | **WI-2929** (`apps/api/drizzle/0168_wi2929_consent_evidence_durability.sql`) — the consent-policy version in force at grant time, promoted out of `audit_fact` so no withdrawal path can destroy it. Nullable: grants written before the migration carry their version (if any) in `audit_fact`. Mirrored on `consent_receipt`. See §2.5 |
| `assurance_token` | text NULL | `:506` — verifiable-parental-consent pass/fail token, dropped at re-home time |
| `assurance_method` | text NULL | `:507` |
| `snapshot_age_at_grant` | smallint NULL | `:508` — the learner's age **as known at grant time** |
| `snapshot_jurisdiction_at_grant` | text NULL | `:509` — habitual residence as known at grant time |
| `withdrawal_token_id` | uuid NULL | `:519` (WI-2347) — the `cw2` bearer-token id, copied forward on restore so one emailed link survives withdraw/restore cycles; a token whose id no longer matches is superseded and unusable |
| `created_at` | timestamptz NOT NULL | `:520-522` |

Indexes: `(charge_person_id, purpose, organization_id)` as the resolution hot path (`:526-530`),
`granted_at` (`:531`), and a partial index on `withdrawn_at IS NOT NULL` (`:532-534`).

**The at-grant snapshot columns are the strongest part of this design.** Recording the age and jurisdiction
*as known when consent was taken* — rather than re-deriving them later from the current profile — is what
lets the controller prove the consent was valid **under the rules that applied at the time**, which is the
Art 8 question a supervisory authority would actually ask.

### 2.2 Purposes — exactly two

```
CONSENT_PURPOSES = ['platform_use', 'llm_disclosure']
```

`packages/schemas/src/consent.ts:20-22`. The `purpose` column is free `text`, but this constant is the only
writer, and both the withdrawal wire contract (`:145`) and the accountability response (`:125`) mirror it.

`llm_disclosure` being separable from `platform_use` is a genuinely good piece of design: a data subject can
withdraw consent to their content being sent to an LLM provider without withdrawing from the platform.

**There is no `personalization_memory` purpose, and no profiling purpose.** This is the structural fact
behind §6.

### 2.3 Lawful-basis values

Three values are written:

| Value | Written by | Meaning |
|---|---|---|
| `gdpr_parental_consent` | `consentTypeToBasis` (`apps/api/src/services/identity-v2/consent-v2.ts:147-150`) | Art 8 parental authorisation, GDPR regime |
| `coppa_parental_consent` | same, `:149` | COPPA regime (not in the launch perimeter, retained in code) |
| `art6_1_a` | the adult self-consent writers (`:306`, `:626`, `:749`) | Adult data-subject's own Art 6(1)(a) consent |

The `lawful_basis` column therefore doubles as the **who consented** discriminator — guardian-on-behalf-of
versus data-subject-themselves. That is how the child/adult variant distinction is expressed; there is no
separate "consenting actor" column.

### 2.4 Write, withdraw, and restore paths — and where "append-only" is inaccurate

| Operation | Function | Row behaviour |
|---|---|---|
| Parent creates a child, grant recorded directly | `createDirectConsentGrant` (`consent-v2.ts:239`) | INSERT; `audit_fact = { source: 'parent_created_child', guardianPersonId }`. **WI-2929:** also stamps `policy_version` from the server's `CONSENT_POLICY_VERSION`, threaded through `createChildProfileV2` from `routes/profiles.ts`. This path previously recorded **no** terms/policy version at all — the weakest Art 7(1) evidence of any writer. |
| Email-parent approves a consent request | `processConsentResponseV2` (`:1086`) | INSERT one row **per purpose** in `CONSENT_PURPOSES` (`:1144-1162`); `audit_fact = { source: 'consent_response_approved', policyVersion }` (`:1155-1158`) |
| Adult accepts at signup | `acceptAdultSelfConsentV2` (`:676`) | INSERT one `art6_1_a` row per purpose (`:749-757`), terms fact stamped into `audit_fact` |
| Adult self-consent recorded on first use | `recordAdultSelfConsentV2` (`:294`) | INSERT per purpose, `lawfulBasis: 'art6_1_a'` (`:306`) |
| Missing adult record repaired | `repairOrSignalAdultSelfConsentV2` (`:553`) | INSERT derived accountable record (`:626-634`), advisory-locked to prevent duplicates (`:687-694`) |
| Guardian revokes | `revokeConsentV2` (`:1391`) → `stampWithdrawal` (`:1474`) | **UPDATE** — sets `withdrawn_at`, `prior_value = true`, and **replaces `audit_fact`** (`:1513`) |
| Email-parent revokes by bearer link | `withdrawConsentByToken` (`:1423`) → `stampWithdrawal` | Same UPDATE; audit source `email_parent_revocation` |
| Adult withdraws one purpose | `withdrawAdultSelfConsentV2` (`:336`) | **UPDATE**, but **merges** `audit_fact` (`:365-368`, `:379`) |
| Restore after withdrawal | `restoreConsentV2` (`:1553`) → `appendRestoreGrant` (`:1583`) | **INSERT** new grant rows (`:1636`) — genuinely append-only |

**Finding C-1 — "append-only" is true of restore, not of withdrawal.** Withdrawal mutates the existing row
in place. The prior state is not lost in substance (`granted_at` remains, `prior_value` is stamped), so the
sequence of events is still reconstructable. But the table does not behave as its own header comment
(`identity.ts:475`) describes, and the DPO should not be told it is an append-only log without this
qualification.

**Finding C-2 — the guardian withdrawal path destroys the policy version recorded at grant time.**
**FIXED — WI-2929, `apps/api/drizzle/0168_wi2929_consent_evidence_durability.sql`.** The version now lives in
a first-class `consent_grant.policy_version` column (`identity.ts`, the §2.5 recommendation) that no
withdrawal path writes, so the destruction described below is **structurally impossible** rather than
dependent on every writer remembering to merge. `stampWithdrawal` still replaces `audit_fact` — that is the
right content for the JSONB — but the version no longer rides in it. Regression:
`consent-v2.integration.test.ts` → *"[variant 2] a guardian withdrawal preserves the approval-time policy
version"*, which also asserts the accountability endpoint reports it post-withdrawal. **Historical rows are
not recovered**: a parental grant withdrawn before this migration already had its version overwritten and it
is gone. The original finding, retained as the record of what was wrong:

This is the more serious of the two, and it is a straightforward asymmetry:

- The **adult** path deliberately merges, with the reason stated in the code: *"MERGE audit_fact rather than
  overwrite: the durable terms-acceptance fact (termsAcceptedAt/termsVersion) written at signup must SURVIVE
  the withdrawal so getConsentAccountabilityV2 can still prove consent WAS validly obtained (GDPR Art
  5(2)/7(1) outlives the withdrawal)"* (`consent-v2.ts:360-364`, WI-1193 AC1).
- The **parental** path does not. `stampWithdrawal` assigns `audit_fact` wholesale (`:1513`), and
  `revokeConsentV2` passes `{ source: 'guardian_revocation', guardianPersonId }` (`:1402-1405`) — no
  `policyVersion`. The value written at approval time (`:1157`) is therefore **overwritten and lost** the
  moment a guardian revokes.

The result is that ZWIZZLY AS can prove *which version of the consent wording an adult accepted* after they
withdraw, but **cannot prove the same for a child whose parent has withdrawn** — the population where Art 8
makes the proof most important. The reasoning that produced the adult fix applies identically to the
parental path; it appears simply not to have been carried across. ~~**This should be fixed before launch, and
the fix is small: merge instead of replace, exactly as `withdrawAdultSelfConsentV2` does.**~~ — WI-2929 took
the **structural** option in §2.5 instead of the merge, so no future writer can reintroduce the defect.

### 2.5 Versioning — where it lives, and what it is not

**RESOLVED — WI-2929 implemented the recommendation below.** `consent_grant.policy_version` and
`consent_receipt.policy_version` are now first-class columns
(`apps/api/drizzle/0168_wi2929_consent_evidence_durability.sql`), written by every grant writer — all
eight: `createDirectConsentGrant`, `recordAdultSelfConsentV2`, `acceptAdultSelfConsentV2`,
`repairOrSignalAdultSelfConsentV2`, `processConsentResponseV2`,
`attachGuardianConsentForCredentialedLearner` (`guardian-attachment.ts`),
`writeDestinationSelfConsentSet` (`family-join-journey.ts`), and carried forward by
`appendRestoreGrant` — read by `getConsentAccountabilityV2`, and written by **no** withdrawal path. The
`audit_fact` copies are retained — `{ termsAcceptedAt, termsVersion }` is the adult's versioned terms
*acceptance*, a distinct fact per MMT-ADR-0011 — and the accountability read falls back to the JSONB for
rows written before the column existed. The as-was description, retained as the record:

There *was* **no `policy_version` column on `consent_grant`.** The version was carried inside the `audit_fact`
JSONB as `{ termsAcceptedAt, termsVersion }` (adult path) or `{ policyVersion }` (parental path), stamped
from the server-side `CONSENT_POLICY_VERSION` (`consent-v2.ts:672`, parsed back by
`parseVersionedTermsFact`, `:475-497`).

Sibling tables *do* have first-class columns — `consent_request.policy_version`
(`identity.ts:975`) and `country_policy_registry.policy_version` (`:746`) — so the JSONB placement on
`consent_grant` was an inconsistency rather than a considered choice. Practically it meant the version was
un-indexed, un-constrained, and (per Finding C-2) deletable by an unrelated write. **Recommendation: promote
it to a column.** That would also make Finding C-2 structurally impossible rather than dependent on every
future writer remembering to merge.

### 2.6 Retrieval — the accountability endpoint

`GET /consent/self/accountability` (`apps/api/src/routes/consent.ts:726`) returns, in one query, the current
lawful basis, the versioned terms-acceptance fact, the accepted purposes, and any withdrawal
(`packages/schemas/src/consent.ts:122-126`). The full authenticated consent surface is:

| Endpoint | `apps/api/src/routes/consent.ts` |
|---|---|
| `GET /consent/my-status` | `:460` |
| `GET /consent/:childProfileId/status` | `:489` |
| `PUT /consent/:childProfileId/revoke` | `:532` |
| `POST /consent/self/accept` | `:603` |
| `PUT /consent/self/withdraw` | `:684` |
| `GET /consent/self/accountability` | `:726` |
| `PUT /consent/:childProfileId/restore` | `:752` |

Three unauthenticated `POST` handlers (`:201`, `:318`, `:401`) serve the emailed bearer-link parent flow,
rate-limited per IP with a one-hour window (`:97`, `:118`) — in-memory, not persisted across Worker isolate
restarts. Threat posture reviewed and dispositioned at
[`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`](../2026-07-17-consent-withdrawal-bearer-token-threat-posture.md);
one mitigate-before-launch item (server-side revocation + token expiry) tracked as **WI-2347**, partly
landed as the `withdrawal_token_id` column.

### 2.7 Survival of erasure

**WI-2929 moved the receipt write EARLIER.** A `consent_receipt` row is now written **at grant time**, in
the same statement sequence as the grant, keyed to it by the new nullable, partial-unique
`consent_receipt.consent_grant_id` (still no FK — the receipt outlives the grant row). The evidence
therefore exists from the moment consent is taken rather than from whenever a teardown path gets around to
archiving. Withdrawal and re-home then **refresh** that row through the single writer
`syncConsentReceipts` (`apps/api/src/services/identity-v2/consent-receipt-v2.ts`) instead of inserting a
second one, so a deleted person still ends with exactly one receipt per grant. Regression:
`consent-v2.integration.test.ts` → *"[variant 1] writes the durable receipt at GRANT time, and it survives
the person delete"*.

Why that mattered: the three archive sites (`executeDeletionV2`, `rehomeGrantsTx`,
`archiveSourceConsentGrants`) *did* each write a receipt before deleting grants, so no consent history was
being lost today — but only because all three remembered to. The receipt's existence was a convention, not a
constraint, and the next grant-deleting path would have lost it silently. Writing at grant time makes the
evidence unconditional.

On person deletion the live grant is **re-homed** to `consent_receipt`
(`identity.ts:547-572`) inside the same transaction that deletes the person
(`apps/api/src/services/identity-v2/deletion-v2.ts:484-531`). `ON DELETE RESTRICT` on
`consent_grant.charge_person_id` makes the re-home mandatory rather than optional — the delete physically
cannot proceed without it. `consent_receipt` carries no FK to `person` by design (`identity.ts:543-545`).

`consent_receipt.retention_period` (`:566`) is **NULL** — the counsel-owned seam, retention-schedule gap
**G-2** and DPIA launch-blocking condition 7 ([`dpia.md:116`](../dpia.md)).

### 2.8 How Mechanism A evidences Art 7(1)

Art 7(1) requires the controller to be able to demonstrate that the data subject consented. Against that
standard:

| Art 7(1) element | Status |
|---|---|
| That consent was given | **Met** — `granted` + `granted_at` per purpose |
| By whom | **Met** — `charge_person_id` plus `lawful_basis` distinguishing self from guardian; `guardianPersonId` in `audit_fact` at grant time |
| For what purpose | **Met, at the granularity that exists** — two purposes, independently recorded and independently withdrawable |
| Against what wording | **Met** — `consent_grant.policy_version`, written at grant time by every writer and by no withdrawal path (WI-2929). Was *"met for adults; BROKEN for children after a parental withdrawal"* under Finding C-2. Null for pre-migration grants whose version the old withdrawal path already destroyed. |
| Under what age/jurisdiction rules | **Met** — `snapshot_age_at_grant`, `snapshot_jurisdiction_at_grant` |
| That it was as easy to withdraw as to give (Art 7(3)) | **Met in mechanism** — self-service endpoint for adults, one-click emailed link for parents |
| That the proof outlives the data | **Met in structure**, pending the retention value — `consent_receipt`, gap G-2 |

---

## 3. Mechanism B — the memory consent flag (P3 / P4)

### 3.1 Storage

A single column on the learner's profile row:

```
memory_consent_status  text NOT NULL DEFAULT 'pending'   enum: pending | granted | declined
```

`packages/database/src/schema/learning-profiles.ts:36-40`; Zod mirror at
`packages/schemas/src/learning-profiles.ts:58-63,124`. Three adjacent booleans complete the control surface:
`memory_enabled` (default **true**, `:35`), `memory_collection_enabled` (default **false**, `:44-46`),
`memory_injection_enabled` (default **true**, `:47-49`), plus `consent_prompt_dismissed_at` (`:41-43`).

**The defaults deserve a second look.** `memory_enabled` and `memory_injection_enabled` both default to
`true`; only `memory_collection_enabled` defaults to `false`. Read alone, that looks like memory-on-by-
default. It is not, because every enforcement site requires `memory_consent_status === 'granted'`
independently (§3.3), and that defaults to `pending`. The effective default is therefore off — but it is off
because of a *conjunction*, and two of the three booleans in that conjunction are permissive. This is a
fragile shape for a control the DPO is being asked to rely on, and it is worth an engineering note.

### 3.2 Write path

`grantMemoryConsent(db, profileId, accountId, consent)` —
`apps/api/src/services/learner-profile.ts:1709-1732`. It performs one `UPDATE`, setting
`memory_consent_status`, the three booleans, `consent_prompt_dismissed_at`, and bumping `version`.

Two adjacent writers: `toggleMemoryCollection` (`:1647-1676`), which **implicitly upgrades consent to
`'granted'` when collection is switched on** (`:1660-1662`), and `toggleMemoryInjection` (`:1678-1707`),
which refuses to enable injection when consent is not granted (`:1692-1695`, `[F-PV-09]`).

**Finding C-3 — the implicit grant.** `toggleMemoryCollection(enabled = true)` sets
`memoryConsentStatus = 'granted'` as a side effect. Whether that is a valid consent depends entirely on what
the user was shown at the surface that called it. If the surface is a plain settings switch with no consent
wording, this is a consent recorded without an affirmative, informed act — Art 4(11). Resolution depends on
the screen inventory; see [`2026-07-30-consent-screen-inventory.md`](2026-07-30-consent-screen-inventory.md).

### 3.3 Enforcement — this part is genuinely well built

Eight call sites across the write, injection, and backfill paths refuse to process without a granted status
(two of them — the outer and in-transaction regulatory checks — test the `consent_grant` state rather than
the memory flag, which is the point of the two-layer design described below). The gate is not decorative.

| Site | Refuses |
|---|---|
| `apps/api/src/services/learner-profile.ts:1435-1440` | The `applyAnalysis` derived-memory/profiling write |
| `apps/api/src/services/learner-profile.ts:1412-1415` | Outer regulatory check via `isLlmExchangeConsentAllowed` — honours parental **and** adult `art6_1_a` withdrawal (WI-221, WI-2396) |
| `apps/api/src/services/learner-profile.ts:1424-1433` | In-transaction re-check closing the TOCTOU window |
| `apps/api/src/inngest/functions/session-completed.ts:1705-1717` | The post-session memory write |
| `apps/api/src/services/learner-profile.ts:841-844` | Memory injection into the prompt |
| `apps/api/src/services/memory/memory-facts.ts:168` · `apps/api/src/services/curated-memory.ts:199` | Memory-fact read/injection |
| `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts:136` | Filters the embedding backfill to granted profiles |

The two-layer design is deliberate and is explained in the code: `revokeConsent` sets the regulatory status
to WITHDRAWN **without** clearing `memory_consent_status`, *"so the existing memory gate alone is
insufficient"* (`learner-profile.ts:1402-1405`; same comment at `session-completed.ts:1717`). Both layers
are checked, so a regulatory withdrawal does stop memory processing even though the flag still reads
`granted`.

**Correction to an earlier reading of this code — LLM dispatch IS gated.** The comment at
`learner-profile.ts:1406-1411` says the LLM call on the `learner-input.ts` path runs *before*
`applyAnalysis`'s own consent check, so that check protects the memory **write**, not the dispatch. Read in
isolation this looks like an ungated dispatch. It is not: both routes that reach `parseLearnerInput` call
**`assertLlmConsent(db, profileId)` immediately before it** — `apps/api/src/routes/learner-profile.ts:353`
(self) and `:375` (parent-on-behalf-of-child), each with a comment citing WI-2396 canon R5 and stating
explicitly that *"parseLearnerInput unconditionally dispatches the LLM"*. The gate sits one layer up, at the
route. `assertLlmConsent` resolves through `isLlmExchangeConsentAllowed`
(`apps/api/src/services/identity-v2/consent-status-v2.ts:851-874`), which loops **every** member of
`CONSENT_PURPOSES` — including `llm_disclosure` — and denies if any resolves `WITHDRAWN` (`:863-872`).

**Finding C-4 — the consent gate is fail-open by design, and that interacts badly with an unmounted gate.**
`isLlmExchangeConsentAllowed` returns `true` when there is no membership row (`:861`) and, per its own
docstring, uses *"No rows → allowed"* semantics per leg: **only an explicit `WITHDRAWN` status denies**
(`:847-849`). The stated reason is to avoid false-positiving an adult who holds no self-consent grant row.

The consequence is that the gate enforces **withdrawal**, not **the existence of consent**. A user with no
grant row at all passes it. That is defensible only if every user reliably acquires a grant row — which is
exactly what the screen inventory puts in doubt: `AdultSelfConsentGate`, the only explicit adult consent
surface, is **not mounted anywhere in the app** pending WI-2411
([`2026-07-30-consent-screen-inventory.md`](2026-07-30-consent-screen-inventory.md) §2). Adults who consent
at signup through `recordAdultSelfConsentV2` do get a row and are unaffected; the exposure is the repair and
re-acceptance path the gate was built for. **The DPO should treat "fail-open gate" and "unmounted consent
screen" as one issue, not two** — either alone is tolerable, together they permit processing with no
recorded consent. Resolving it is a precondition for relying on this gate in any compliance claim.

### 3.4 Withdrawal, and what it does not do

`grantMemoryConsent(..., 'declined')` sets the status to `declined` and all three booleans to false —
processing stops at every site above. Separately, `deleteAllMemory` (`:1741`) hard-deletes `memory_facts` and
the profile row; a fresh row is then created at `'pending'` (`:1734-1740`).

What withdrawal does **not** do: leave any record that consent was ever granted. The column is overwritten.
There is no `memory_consent_granted_at`, no history table, no event. **After a withdrawal, the controller
cannot demonstrate that P3 consent was ever validly obtained** — the exact failure mode WI-1193 AC1 was
written to prevent for Mechanism A.

`consent_prompt_dismissed_at` is the only timestamp, and it records dismissal of the prompt, not the grant.

---

## 4. What is NOT in either mechanism

Verified absent, with the searches named so the DPO can see the claim is a finding and not an omission.

| Absent | Evidence |
|---|---|
| A `personalization_memory` or profiling purpose in the consent log | `CONSENT_PURPOSES` has exactly two members (`packages/schemas/src/consent.ts:20`) |
| Any `consent_grant` row written by the memory-consent path | `grantMemoryConsent` (`learner-profile.ts:1709-1732`) touches only `learning_profiles` |
| ~~A first-class `policy_version` column on `consent_grant`~~ — **now present (WI-2929)**, on `consent_grant` and `consent_receipt` | Was: schema read in full, `identity.ts:480-536`; sibling tables have one (`:975`, `:746`). Added by `0168_wi2929_consent_evidence_durability.sql`. |
| Any versioning at all on memory consent | `learning-profiles.ts:35-49` — no version, no timestamp of grant |
| A guardian/child variant for memory consent | No `lawful_basis` equivalent on the flag; nothing distinguishes who set it |
| A global server-side switch disabling memory | `apps/api/src/config.ts` sweep found only architecture-phase flags (`MEMORY_FACTS_READ_ENABLED`, `MEMORY_FACTS_RELEVANCE_RETRIEVAL`, `MEMORY_FACTS_DEDUP_ENABLED`, `:125-128`) |
| Memory-consent evidence surviving erasure | `consent_receipt` is populated only from `consent_grant` (`deletion-v2.ts:484-531`); the profile row is cascade-deleted |

---

## 5. Consent-related background jobs

`consent-revocation.ts` implements the revocation → grace → delete pipeline (retention-schedule §3.3), and is
cited in `docs/runbooks/deletion-irreversible-boundary.md` §5 as the reference implementation of the
`safeSend` dead-letter pattern that the deletion path still lacks (gap G-8). Restore is possible during a
7-day grace period; afterwards profiles aged 13 or under are deleted and older child profiles may be archived
for 30 days per the account owner's preference
([`privacy-policy.html:36`](../privacy-policy.html)).

---

## 6. Gaps for the P3 unlock

Ordered by how hard each one blocks. These are the concrete engineering preconditions for consent-based
persistent memory; none is large, and together they are the difference between a control and a record.

| # | Gap | Why it blocks P3 | Severity |
|---|---|---|---|
| **P3-G1** | **Memory consent is not in the consent log.** It is a mutable column, with no grant timestamp, no version, no history, and no survival past erasure. | Art 7(1) requires the controller to *demonstrate* consent. A field that can be overwritten with no trace cannot demonstrate anything. If P3 launches on this mechanism, ZWIZZLY AS has a working control and no evidence. | **Blocking** |
| **P3-G2** | **No `personalization_memory` purpose exists** in `CONSENT_PURPOSES`. | P3 consent has nowhere to live in Mechanism A. Adding the purpose is the natural fix and would inherit versioning, the at-grant snapshots, withdrawal, receipt survival, and the accountability endpoint for free. | **Blocking** |
| **P3-G3** | **No guardian/child variant for memory consent.** Mechanism A encodes this in `lawful_basis`; Mechanism B has no equivalent. | For a learner below the self-consent age, P3 consent must come from the guardian, and the record must show it did. Today nothing distinguishes a 13-year-old tapping the prompt from a parent doing so. | **Blocking for minors** |
| **P3-G4** | ~~**Finding C-2** — the guardian withdrawal path overwrites `audit_fact`, destroying the grant-time policy version.~~ **CLOSED — WI-2929.** `policy_version` is a first-class `consent_grant` column that no withdrawal path writes (§2.5), so a P3 purpose moving into Mechanism A no longer inherits the defect. | Was: pre-existing defect in Mechanism A that P3-G2 would inherit. Now: nothing to fix first — the structural guarantee is in place. Historical rows already stripped of their version are not recovered. | ~~High~~ **Closed** |
| **P3-G5** | **Finding C-3** — `toggleMemoryCollection` implicitly grants consent as a side effect of a settings toggle. | Consent must be an affirmative, informed act. A settings switch that silently records consent is not obviously that. Depends on the surface wording — see the screen inventory. | **High, pending screen evidence** |
| **P3-G6** | **The three memory booleans default permissive** (`memory_enabled` and `memory_injection_enabled` both default `true`); off-by-default holds only because the status flag is checked separately everywhere. | The DPO is being asked to rely on a default. It should be robust, not emergent from a conjunction. | **Medium** |
| **P3-G7** | **No enforcement of the interim parking condition** — no server-side switch prevents a grant being accepted today. | If the DPO requires the condition enforced rather than defaulted, this must be built before launch. | **Medium — DPO ruling needed** |
| **P3-G8** | **Finding C-1** — "append-only" is accurate for restore, not withdrawal. | Documentation accuracy, not a defect. The DPO should not be told the log is append-only without the qualification. | **Low** |

### 6.1 Recommended shape (proposal, not a decision)

Move P3 consent into Mechanism A: add `personalization_memory` to `CONSENT_PURPOSES`, keep
`memory_consent_status` as the fast-path enforcement cache it already effectively is, and derive it from the
consent log rather than letting it be the source of truth. That single change closes P3-G1, P3-G2, and
P3-G3 together, because the consent log already has versioning, at-grant age and jurisdiction snapshots,
guardian-versus-self encoding via `lawful_basis`, purpose-granular withdrawal, and receipt survival.
~~Fix P3-G4 first so the new purpose does not inherit a defect.~~ **That prerequisite is satisfied** —
P3-G4 was closed by WI-2929 (§2.5), so a `personalization_memory` purpose entering Mechanism A inherits
the structural guarantee rather than the defect. The sequencing reason is recorded here because it is why
the order mattered, not because anything remains to do first.

---

## 7. Contradictions with existing compliance documents

| # | Document says | Code says | Resolution |
|---|---|---|---|
| **CL-X1** | [`edpb_dpia_filled_2026_v1.md:190`](../edpb_dpia_filled_2026_v1.md): *"no `lawful_basis`/`legalBasis`/`termsAccepted` field recorded for adult self-processing anywhere in the live schema"* and *"only one purpose value is ever written (`'app_usage'`)"* | `art6_1_a` grants exist and are written by four separate paths; `CONSENT_PURPOSES` has two members and neither is `'app_usage'`; the terms fact is stamped and merge-protected | **The EDPB fill is stale.** [`dpia.md:126`](../dpia.md) already flags it as carrying v0.1 framing and owing a sync. The DPO must not read it as current on this point. |
| **CL-X2** | `identity.ts:475` describes `consent_grant` as an append-only event log | Withdrawal is an in-place UPDATE (`consent-v2.ts:1513`, `:374-388`) | Finding C-1. Accurate for restore only. |
| **CL-X3** | [`dpia.md:62`](../dpia.md): the versioned terms-acceptance fact *"survives a withdrawal, satisfying Art 5(2)/7(1)"* | **RESOLVED — WI-2929.** Was true for the adult path only; `stampWithdrawal` replaced `audit_fact` on the parental path. The grant-time version now lives in `consent_grant.policy_version`, which no withdrawal path writes, so the DPIA's claim holds on both paths going forward. | Finding C-2, closed by fixing the code (the answer this row recommended). The DPIA claim needs **no** qualification for grants written after the migration; it remains false for parental grants already withdrawn before it. |
| **CL-X4** | [`ropa.md:39`](../ropa.md) describes `consent_grant.lawful_basis` as covering *"a minor's learning data / profiling"* | The consent log covers `platform_use` and `llm_disclosure`. **Profiling consent lives entirely outside it**, on `learning_profiles.memory_consent_status` | The ROPA overstates the log's coverage. P3-G1/G2. |
| **CL-X5** | [`dpia.md:62`](../dpia.md): downstream enforcement gating processing on a withdrawn purpose *"is tracked separately as WI-2372 and blocks the launch gate"* | Enforcement **exists on both legs**. The memory/profiling write path is gated at eight call sites (§3.3). The **LLM dispatch** is gated too, at the route level: `assertLlmConsent` runs before `parseLearnerInput` at `apps/api/src/routes/learner-profile.ts:353,375` (WI-2396), resolving through `isLlmExchangeConsentAllowed`, which denies on a withdrawn `llm_disclosure` purpose (`consent-status-v2.ts:863-872`) | **WI-2372 appears substantially closed by WI-2396** and should be re-read against the code rather than assumed open. The residual issue is not a missing gate but a **fail-open** one — Finding C-4. |

---

## 8. Open items

| ID | Open item | Owner |
|---|---|---|
| ~~CL-O1~~ | ~~Fix Finding C-2 — merge `audit_fact` in `stampWithdrawal` as the adult path does~~ **DONE — WI-2929**, via the structural option (CL-O2) rather than the merge | Engineering — closed |
| ~~CL-O2~~ | ~~Promote `policy_version` to a first-class `consent_grant` column~~ **DONE — WI-2929** (`consent_grant` + `consent_receipt`, read by `getConsentAccountabilityV2`) | Engineering — closed |
| CL-O3 | Decide the P3 consent shape — §6.1 proposes moving it into the consent log | DPO + engineering |
| CL-O4 | Resolve Finding C-3 — is the collection toggle's implicit grant backed by consent wording? | Depends on the screen inventory |
| CL-O5 | Sync or retire the stale EDPB template fill (CL-X1) | Zuzana |
| CL-O6 | Re-scope WI-2372 against the enforcement that exists — it appears substantially closed by WI-2396 (CL-X5) | Engineering |
| CL-O8 | **Finding C-4 — fail-open gate plus unmounted adult consent screen (WI-2411). Launch-blocking; treat as one issue.** | **Engineering** |
| CL-O7 | `consent_receipt.retention_period` value (gap G-2, DPIA condition 7) | Counsel |

---

**Prepared:** 2026-07-30, agent-drafted by direct source reading. Every claim carries a `file:line` or names
the search that established an absence. This document describes the implementation **as built**; it does not
propose that the current state is adequate, and §6 states where it is not.
