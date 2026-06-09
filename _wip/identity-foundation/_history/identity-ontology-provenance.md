# `identity-ontology.md` — extracted provenance (Phase J0 scrub, 2026-06-08)

Ratification history, grill agenda, deferred-decision queue, current-code crosswalk, and carried
flags lifted out of `identity-ontology.md` when it was scrubbed for graduation to
`docs/canon/identity/ontology.md`. **Not canon.** Systems of record: the ADRs (`docs/adr/`,
`MMT-ADR-0001/0002/0007–0012`), the ROADMAP (open threads / counsel register), and the graduated canon
(`§1`–`§5`). Terminology note: this file preserves the **original** terms (`mentor`(human) /
`mentorship` / `mentee`, AI rebrand "Mate") as a historical record; the live rename is
`mentor`(human)→`supporter`, `mentorship`→`supportership`, `mentee`→`supportee`, and the AI keeps the
name `mentor` (the planned AI→"Mate" copy sweep was cancelled). See the inventory rename table.

---

## Preamble status / amendments / decision-legend (removed)

> **Status:** RATIFIED v1 — Grill #1 complete, 2026-06-01. All nine conflicts (C1–C9), the
> role/edge/capacity model, and the §4 invariants ratified (trail in §R; agenda in §0). CONTEXT.md
> identity glossary extracted in lockstep. **v1.1 amendment (2026-06-02):** Payer *capacity* is
> store-delegated for store-mediated payment (inv 17/10, §2.4, §3.2; MMT-ADR-0002), rectifying the
> 2026-06-01 "payer-eligibility = same age ladder" framing.

Current truth: the vocabulary + invariants live in the graduated `ontology.md` (§1–§5); the *why*
lives in the ADRs.

---

## §R — Ratification log (Grill #1) — condensed; ADRs are the system of record

The full Grill-#1 ratification trail (newest-first) is preserved here for trace. Every ruling below
is now backed by an ADR or codified in the graduated invariants; nothing here gates current work.

- **`inv 17` rephrase — store-delegation sharpened to payment mechanics only (2026-06-04).** Counsel
  ruled inv 17 v1.1's "no age gate of ours" overreached on four axes (COPPA/GDPR consent gate; minor
  contractual incapacity; supplier-side withdrawal/conformity/unfair-terms; paywall copy to a minor).
  Rephrased: payer *mechanics* are store-delegated, but store delegation does **not** discharge the
  four obligations that remain ours; the gate fires on the **LLM-disclosure trigger, not the payment
  trigger**. Companion: MMT-ADR-0002 amendment — merchant of record is Apple/Google alone; RevenueCat
  is our Art 28 processor. → graduated as inv 17.
- **Phase E — data-model realization (8 rulings + MMT-ADR-0011/0012, 2026-06-04).** Locked the 8
  tables + the `person_retain` structural set; create-from-empty baseline; append-only thereafter.
  D1 squash→ADR-0012; D2 nullable `login_id`; D3 access-inert `payer_person_id`; D4 roles
  `{admin, learner}`, `is_owner` dissolved; D5 two edges (`guardianship`, `mentorship`); D6
  append-only `consent_grant`; D7 unified daily sweep; D8 retention seam → structural set. Detail
  now lives in `data-model.md` + the ADRs.
- **Phase D — domain model ratified (4 rulings + MMT-ADR-0007/0008/0009/0010, 2026-06-03).** Core
  entity/role model→ADR-0007; Guardianship Option A (global edge, derived operation)→ADR-0008 (also
  ruled the consent/visibility half of multi-org governance); unified daily scheduler→ADR-0009;
  family-join invite-flow + single home org→ADR-0010. Carried forward (named, not gating):
  separated-parents v1 build scope (product+legal); recorded-Payer under Family Sharing (now a column);
  co-guardian one-of/all-of (counsel); VPC vendor (procurement).
- **Payer capacity → store-delegated (ontology v1.1, 2026-06-02).** Superseded the payer-rung framing:
  payment capacity for store-mediated payment is delegated to the store as merchant of record; a flat
  ≥18 default governs only a future non-store rail. Safe because Payer is access-inert + consent-
  orthogonal. Bodies updated: inv 10/17, §2.4, §3.2; MMT-ADR-0002.
- **Fold #2 — `age-consent-spike.md` folded in (2026-06-01).** C7 strike on the spike's "Clerk Orgs
  for access"; kept "own consent receipts/audit in Neon, Clerk carries resolved decision as JWT
  claims" (§3.2). Added invariants 26–30 (age-gate precedes collection; per-purpose consent;
  consent≠contract; worst-case default; proportionate assurance). Reframed the age floor as a
  per-jurisdiction policy value; added the counsel register (REQ-2) + DPIA gate (REQ-3).
- **Fold #1 — `domain-model-options.md` folded in (2026-06-01).** Harvested residual commitments:
  §3.4 `residence_jurisdiction` (time-versioned); §3.5 v1 authz posture (RBAC + ABAC + edges, no
  engine); invariants 22–25 (three-way separation; separable guardianship capabilities; durable
  scheduler; append-only named transitions).
- **Mentorship authorization & capacity independence (2026-06-01).** Guardianship and Mentorship are
  independent capacities; a Mentorship is authorized by the mentee if consent-capable else by the
  guardian; graduation re-confirms guardian-granted mentorships. → graduated as inv 14–16.
- **Age tiers are flag-combinations, not entities (2026-06-01).** One `resolveConsentRequirement`
  emits capability flags; the three tiers are combinations. Numeric cohort labels banished. → inv 10.
- **Mentor & guardian = capacities, role set → `{admin, learner}` (2026-06-01).** Role = self-
  contained standing; edge = tie to a named Person. mentor/guardian fail the role test → capacities.
  → inv 5/6.
- **C2/C3/C4 cluster (2026-06-01).** Owner dissolved (→ admin / Payer / Guardianship); role SET
  `{admin, learner}`; `student`→`learner`; Guardianship is a relationship not a role; far-end =
  `charge`; the two-layer model (Layer 1 consent authority / Layer 2 supervisory access). **Note:**
  this entry's "AI rebranded 'Mate'" line (CLEANUP-2) is **reversed** by the 2026-06-08 rename — the
  AI keeps `mentor`; `supporter` is the new human-capacity term.
- **C1/C6/C8 — three core nouns (2026-06-01).** `Person` (RBAC-human / ABAC-Subject), `Organization`
  (thin tenant), `Login` (auth binding, 0..1). `Credential` rejected (=auth factor); `account` retired.
- **C7 — tenancy graph ownership (2026-06-01) → MMT-ADR-0001.** We own the Person/Organization/
  Membership/Guardianship graph in Neon; Clerk = authentication only, never the tenancy SoR.

---

## §0 — The hot conflicts (grill agenda) — resolved

The C1–C9 conflict agenda is fully resolved; every outcome is codified in the graduated §1–§5 bodies
and the §R trail above. The agenda table itself served only Grill #1 navigation and is not retained.

---

## §6 — Deferred decisions (live items tracked in ROADMAP)

Parked so the ontology could land; each re-enters at the named phase. **Live tracking is in
`ROADMAP.md`** (open threads + counsel register) — this list is the original capture.

- **Multi-org governance** — RULED Phase D, split by axis: consent/visibility→MMT-ADR-0008; billing/
  quota→MMT-ADR-0010 (v1 single home org; federation stays deferred, named).
- **Transition events** — time-trigger rail RULED→MMT-ADR-0009; managed→credentialed/join mechanism→
  MMT-ADR-0010; remaining product/UX detail → PRD.
- **Consent mechanism / VPC vendor** — KWS vs k-ID (substitutes, pick one); selection criteria =
  counterparty durability, EU method coverage, per-event-at-onboarding cost shape. Receipts = ISO/IEC
  27560 in Neon. → Phase D/E procurement.
- **Platform age-signals & store compliance** — iOS `DeclaredAgeRange` global; Android Play Age
  Signals null in NO/EU/UK, so Europe's gate is in-app + vendor; managed-charge-on-parent's-device
  has no platform signal on either OS. Play Families is a hard Android ship-gate. → Phase D/E + PRD.
- **Separated parents — one Person or two; shared-custody in v1 scope?** Architectural reachability
  already satisfied (Person ≠ Login + global consent edge + multi-org Membership). Decision → product
  + legal (PM).
- **Guardianship D1 — global vs org-scoped placement** — RULED Phase D, Option A, MMT-ADR-0008
  (whole edge global; operate/manage/view derived).
- **T6 — de-credential (credentialed → managed reversion)** — probably disallowed; product choice,
  not built speculatively. → PRD.
- **Entry-point asymmetry & self-registered-minor consent** — minor-self-registers-first (own Login,
  no guardian yet → who consents?) is a known gap. → PRD journeys.
- **Open IdP items** (no impact on MMT-ADR-0001) — Clerk migration/lock-in cost; whether any OSS/
  self-host IdP models a credential-less member; Auth0/Stytch per-MAU pricing. Revisit on demand.
- **Where this ontology ultimately lives** — RESOLVED by J0: graduates to `docs/canon/identity/`;
  CONTEXT.md extracts its glossary from it.

---

## §7 — Current-code crosswalk (drift map, for the Phase-F clean cut)

`file:line` cites are pre-cut and will rot; kept here as the migration drift-map, not canon.

| Ontology concept | Today's code | Cite | Note |
|---|---|---|---|
| Person | `profiles` | `profiles.ts:71` | rename surface; fused to a login today |
| Login | `accounts.clerk_user_id`, `profiles.clerk_user_id` | `profiles.ts:54,85` | decouple from Person |
| Organization | `accounts` (fused) → `organizations` (inert) | `profiles.ts:50,145` | thin grouping; wire the inert table |
| Membership + roles | `family_links`+`isOwner` (live) → `memberships.roles[]` (inert) | `profiles.ts:91,168,284` | live authz is the `isOwner` bool |
| `admin` (was owner) | `isOwner` boolean; enum `'owner'` | `profiles.ts:44,91` | split three ways (admin/Payer/guardianship) |
| Guardianship + Consent | `family_links` + `consent_states` | `profiles.ts:284,313` | promote to first-class edge |
| Supportership (was Mentorship) | `family_links` (mentor backfilled) | — | no route reads the role today |
| Consent requirement | flat `age<=16`, `MINIMUM_AGE=11` | `consent.ts:197` | replace with `resolveConsentRequirement` |
| Payer | implicit account holder | `billing.ts:37` | make explicit `payer_person_id` |
| Proxy (act-for runtime) | `isParentProxy` / `X-Proxy-Mode` | CONTEXT.md:34 | mechanism for guardian act-for; decide keep/retire |

> The current CONTEXT.md identity glossary (Profile/Owner/Child Profile, "guardian" retired,
> student/learner avoided) encodes the **old fused model** — overwritten by the graduated ontology,
> not extended.

---

## §8 — Carried requirements & cleanup flags (do-not-lose; live items in ROADMAP / PRD compliance)

- **REQ-1 — Consent-scope disclosure for supporter/helper data-sharing. `[LEGAL REVIEW]`** A guardian's
  consent only covers a third-party helper seeing the child's learning data if the consent flow
  explicitly discloses that the guardian may grant such access. COPPA-2025's per-purpose model makes
  this sharper — every purpose and every helper-access grant must be enumerated. The existing parental
  consent email appeared not to disclose this. → consent compliance + PRD; counsel confirms before paid
  launch.
- **CLEANUP-1 — CONTEXT.md legacy examples** (e.g. old `_Avoid_: learner` reasoning) obsolete now that
  `learner` is a positive role. Sweep when the role cluster lands.
- **CLEANUP-2 — AI naming. `[REVERSED by 2026-06-08 rename]`** Grill #1 decided AI→"Mate", `mentor`→
  human capacity. The 2026-06-08 product rename **reverses** this: the AI keeps `mentor`; the human
  capacity becomes `supporter`. The planned ~70-string AI→"Mate" copy sweep is **cancelled**. "Mate"
  survives only as a product synonym noted in CONTEXT.md.
- **FLAG-2 — the hard "11" age floor vs any-age-charge intent. `[PRODUCT DECISION]`** Floor is not a
  single number: 13 is a legal line (NO/UK/COPPA) and a product default, EU digital-consent age runs
  13–16 (DE/NL/IE/PL=16). Any-age charge is lawful with VPC. Real floor = product/app-store-rating
  scoping call on the worst-case-16 table, gated on the VPC solution + app-store rating.
- **CLEANUP-3 — banish numeric cohort labels** ("under-13", "11-17"). Use consent-gated / charge /
  minor / adult. Rule locked; copy sweep deferred to PRD rebaseline, gated on FLAG-2.
- **REQ-2 — consent legal-review register. `[LEGAL REVIEW]`** Six questions counsel must close before
  paid launch: (1) contract basis for a minor's core processing; (2) cross-org consent; (3) graduation
  consent survival; (4) COPPA AI-training separate consent; (5) EU AI-Act high-risk trigger; (6) Ofcom
  child-AI-chatbot regs. Owner: counsel. → ROADMAP counsel register.
- **REQ-3 — DPIA effectively mandatory; gate launch. `[COMPLIANCE]`** Children + AI + learning
  profiles ⇒ DPIA required (UK Children's Code + UK/EU GDPR Art 35). Launch-checklist / PRD task.
- **FLAG-3 — managed consent-capable adult (no Login). `[RESOLVED]`** Supported, no new machinery: an
  admin-created `learner` with no guardianship and no consent gate, operated by the admin. Graduates to
  own Login if wanted; inv 21 covers her. → folded into UC-1.

---

## §9 — Supported use cases (carried to PRD personas)

- **UC-1 — Managed shared-device profile (the "grandparent / Netflix" case).** A family **admin**
  creates a profile for a **consent-capable** Person (adult or capable teen) who will not hold their own
  Login — e.g. a grandparent on the shared family tablet. Shape: a managed Person + `learner`
  membership, no guardianship, no consent gate (above consent age), operated by the admin. Graduates to
  own Login later (same `person_id`, inv 20). Differs from a charge only in the absence of
  guardianship/consent edges. → PRD personas/journeys.
