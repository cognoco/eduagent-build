# BID-14 "Identity cutover" — Formation Refinement

Batch page: `3a08bce9-1f7c-8156-ab1e-c10eb6bc28fd` (HELD). Members: WI-1989, WI-2006, WI-2055, WI-2056 — all `Stage=Backlog`, all `Execution Path=Assisted`.

All four members share the **same systematic gap**: `Kind` (select) is empty (`null`) on all four — confirmed by contrast against reference items WI-1848/WI-1196, which both carry `Kind=Atom`. DoR common requirement #2 (`Kind=Atom` + legal Altitude) is a hard Ready-gate. `Altitude=Item` is set correctly on all four, but `Kind` alone being unset blocks Ready on every member. This reads as a batch-creation miss, not a per-item judgment call — flag to whoever forms/captures this cohort.

---

## DoR gaps per member

### WI-1989 — Close X-Profile-Id owner-gate IDOR on 7 un-swept owner routes (Bug, P1, security)

Hard-floor gaps (block Ready):
- **Kind empty** (see above).
- **Effort empty.** Source plan (`_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans/003-owner-gate-caller-identity-sweep.md`) states `Effort: M` explicitly — trivial backfill, no judgment needed.
- **Risk/Impact empty**, and this item is P1 → DoR lists Risk as part of the **mechanical HARD floor** for P0/P1 ("Description, AC present, Execution Path set, Effort set, Risk for P0/P1 ... structural and HARD for both bars"), not a soft nice-to-have. Plan doc states `Risk: LOW` — backfill from source.

Checklist-tier (Assisted framing bar, not a hard blocker, but refiner should confirm before promoting):
- AC says "All 7 routes verify caller identity/ownership" without naming them in the Notion AC body. DoR's security/Bug variant-enumeration rule is satisfied in substance — the plan doc (linked via `Found In`) enumerates all 7 files and the exact 3 call-sites in `consent.ts` (manage/revoke/restore) — but the enumeration lives in the linked doc, not the AC property itself. Reasonable to accept given Assisted tier, but worth a refiner note confirming the Found In doc is treated as AC-equivalent.

Everything else is strong: scope is exact (7 named files, one mechanical pattern — add `assertCallerIsAccountOwner` after every existing `assertOwnerProfile` call), STOP conditions and a mandatory red-green-revert break test are fully specified. **Repo-verified zero drift**: `git diff --stat 8c049b93f..HEAD` on all 7 target files + `family-access.ts` is empty, and live `assertOwnerProfile` call counts match the plan exactly (consent.ts×3, settings.ts×3, recaps.ts×2, curriculum.ts×2, notifications.ts×2, dashboard.ts×2, onboarding.ts×1 = 15 call sites / 7 files, none yet paired with `assertCallerIsAccountOwner`). This item could execute today once Kind/Effort/Risk are backfilled.

### WI-2006 — Spike: define and apply read-side profile-authority check (Spike, P2, security)

Hard-floor gaps:
- **Kind empty.**
- **Effort empty.** Plan `010-read-side-profile-authority-spike.md` states `Effort: L`.
- Risk/Impact empty but **P2 — not hard-required** by DoR (only P0/P1 are). Plan states `Risk: MED`; fine to backfill for completeness but not a Ready blocker.

Framing is solid for a spike (Assisted): 4 concrete investigation questions, a named findings-doc deliverable (`010-findings.md`) gating any handler change, explicit STOP conditions if the guardian-edge lookup can't distinguish legitimate reads. Repo-verified zero drift on `profile-scope.ts`, `proxy-guard.ts`, `notes.ts`, `family-access.ts`; `010-findings.md` does not yet exist (spike hasn't started, consistent with Backlog).

### WI-2055 — Amend identity canon: forward-repair is the person_id recovery path (Documentation, P1)

Hard-floor gaps:
- **Kind empty.**
- **Effort empty**, and unlike 1989/2006 there is **no source t-shirt size to copy** — the one-way-door drain plan (`docs/plans/2026-07-12-one-way-door-risk-drain.md`, task T2) doesn't size in XS–XL terms. Refiner has to size this fresh (a canon-wording pass with an operator gate in the loop — probably `S`/`M`).
- **Risk/Impact empty, P1 → hard-required.** No direct LOW/MED/HIGH label in the source, but the risk register rates the underlying risk "near-irreversible," "high confidence," and explicitly launch-blocking (STRICT docs-bar, "drift is launch-blocking") — points toward `HIGH`, operator/refiner should confirm.

Should-be-set gaps (not hard, but concrete and actionable):
- **No Related Items / Blocked-by to WI-2056**, despite both items' ACs requiring a mutual link (2055 AC: "links the PITR/snapshot runbook"; 2056 AC: "linked from the identity canon amendment"). Recommend setting a Notion relation between them.
- **No Related Items / Blocked-by to WI-2057** ("Build person merge / reparent / alias forward-repair primitives," Backlog) — 2055's own AC requires it "names merge/reparent/alias primitives and links their follow-up WI." **WI-2057 already exists** (checked via Notion search), so the AC is satisfiable — this is a link-hygiene gap, not an unsatisfiable-AC problem. Recommend linking WI-2057.

No ADR conflict found: grepped MMT-ADR-0007/0008/0011/0015/0020 for rollback/merge/reparent/alias/PITR/recovery language — none exists. The canon amendment is genuinely greenfield territory, not contested ground, which removes one risk from WI-2055's own STOP condition ("do NOT draft a new identity ADR unless the amendment conflicts...").

### WI-2056 — Write Neon PITR/snapshot recovery runbook (Documentation, P1)

Hard-floor gaps: same pattern as 2055 — **Kind empty**, **Effort empty** (no source size; plan doesn't t-shirt-size this task either), **Risk/Impact empty and P1 → hard-required** (source doesn't label it, but the underlying risk-register row is "high confidence" and this doc is a compliance dependency of a STRICT-tier item; suggest `MED`, lower than 2055 since 2056 itself is "directional tier" per its own text).

Should-be-set: same missing Related/Blocked-by link back to WI-2055 as above.

Framing is otherwise clean — AC is concrete (PITR window, snapshot cadence, restore procedure, explicit Clerk/RevenueCat non-recovery scope, a verification drill) and self-contained; no cross-doc dependency needed to *write* the runbook itself (only 2055 depends on 2056 existing, not the reverse — see Sequencing below).

---

## Sequencing verdict — corrects the provisional plan on two points

The provisional plan was: **1989 first (canon-independent, parallelizable) → 2055 (canon) → 2006 (spike, applies ruled authority model) → 2056 (runbook, last)**. Item content + repo/README evidence contradicts the middle two links. Actual structure is **two independent lanes**, not one chain:

**Lane A — profile-authority / owner-gate (security, code):** WI-1989 → WI-2006.
This is confirmed three ways: WI-2006's own Notion description ("Depends on the owner-gate IDOR item landing first — reuses its org-admin/guardian primitives"), the source plan's `Status` block ("Depends on: 003"), and the advisor-plans README itself ("010 after 003 ... Do 003 first so 010 reuses the established org-admin/guardian primitives"). **WI-2006 has no dependency on WI-2055 anywhere in its content.** The provisional plan's "2055 (canon) → 2006" link conflates two different uses of "authority" — WI-2006 is about *who may read which profile via `X-Profile-Id`*, an access-control concern; WI-2055 is about *how a corrupted `person_id` gets recovered*, a data-recovery concern. Different code, different docs, no shared surface.

**Lane B — identity canon / person_id recovery (docs):** WI-2056 and WI-2055 are a cross-linked companion pair, not a strict chain, and if anything the natural document order is the **reverse** of the provisional ("2056 last"). WI-2055's own AC requires "links the PITR/snapshot runbook" — that AC can't be honestly satisfied by linking to a doc that doesn't exist yet (and this repo's planning discipline explicitly bans placeholder/TBD content). WI-2056 has no reverse dependency — it can be written standalone. So: **write WI-2056 first or together with WI-2055**, not after. Treat as a pair authored in the same pass rather than imposing a dogmatic order either direction.

**No cross-lane dependency found.** Lane A touches `apps/api/src/routes/*.ts` + `family-access.ts`; Lane B touches `docs/canon/identity/*.md` + a new runbook doc. No shared files, no textual cross-reference between the two thread's WIs. They can run fully in parallel.

Minor cross-batch note (not blocking, doesn't gate this batch): WI-1989's plan lists a **soft** dependency on "plan 002" (`_wip/.../002-change-class-router-service-integration-gap.md`, almost certainly WI-1992, "CI change-class router — sequence FIRST" per the umbrella item) — only affects whether the break test is auto-enforced in CI routing; "the fix is valid without it" per the plan's own words. Not a blocker for BID-14.

---

## Canon-pass agenda (operator questions for WI-2055)

Genuine policy/wording calls that go beyond what an Assisted executor should decide unilaterally on STRICT-tier compliance canon — this is the batch's human gate:

1. **Is "legacy rollback retired" absolute or conditional?** Does the canon state permanently that legacy rollback is no longer a recovery path (full stop), or conditionally ("retired for now — PITR is the interim path until forward-repair primitives ship")? Wording differs materially; the source plan allows either ("Canon may honestly state: recovery = PITR now, primitives = tracked follow-up").

2. **Should the canon affirmatively prohibit ad hoc manual `person_id` data-surgery** until the WI-2057 primitives ship? The risk register's own escape-hatch text ("Add explicit merge/reparent/alias primitives *before* ad hoc duplicate-person workarounds") implies ad hoc workarounds are a live temptation today. Does the amendment need to explicitly forbid them, or is naming the sanctioned path (PITR) sufficient by omission?

3. ~~Do the merge/reparent/alias primitives need a tracked follow-up WI?~~ **Resolved during this refinement** — WI-2057 ("Build person merge / reparent / alias forward-repair primitives," Backlog) already exists. Remaining question is narrower: do merge/reparent/alias need real behavioral one-liners in the canon now, or is naming them + linking WI-2057 sufficient?

4. **Scope boundary vs. account/person deletion recovery.** The same risk-register pass that produced WI-2055/2056 (T2) also produced a sibling task T3 ("harden account/person deletion recovery and audit proof" — grace/export/Clerk-erasure/dead-letter procedure) that is **not** one of this batch's four members and doesn't appear to have a Cosmo WI yet. Confirm T3 is intentionally out of scope for WI-2055/2056 (person_id *mistakes*, not person *deletion*) so the executor doesn't scope-creep into it or leave an adjacent doc gap unflagged.

5. **Landing location** (lower stakes, but STRICT docs-bar makes it worth a one-line steer): `docs/canon/identity/data-model.md` is where `person_id`/schema mechanics currently live (confirmed by grep — no existing rollback/recovery language anywhere in canon yet, this is genuinely new content); `prd.md`/`domain-model.md`/`ontology.md` are the other candidates. WI-2055's text just says "docs/canon/identity/" generically.

---

## Rename-tracker result: **NONE FOUND** (PM should mint)

WI-1196 (the bounced compliance memo item, Stage=Ready) says RLS Phase 3 / person_id GUC work is "deferred to the profiles→person rename follow-on, inheriting that work package's ruled delivery date" — implying a Work Package should already exist and track this. WI-1848 (cited as that tracker) does **not** do this job: it scopes RLS *policies* on 5 tables from migrations 0120/0121 that are **already** person-keyed (`supporter_encouragement_chips`, `supporter_feed_surface_state`, `support_visibility_contracts`, `support_visibility_notices`, `support_visibility_audit_events`), blocked on a separate operator ruling (OPQ-30). Different tables, different problem (RLS policy activation, not naming).

Searched the WI data source (title/description contains: rename, profile_id, person_id, profiles→person, person-keyed, physical rename) and repo docs. Findings:

- The **table-level** identity rename (`profiles` table → `person` table) has **landed** — closed WPs WI-570/585/586 ("WP-TAIL-drop-legacy," "WP-TAIL-reseed," "W1-schema"). Confirmed current: `packages/database/src/schema/identity.ts` defines `person`, not `profiles`; no `profiles` pgTable exists anywhere in the schema.
- The **column-level** rename does **not** appear finished. `packages/database/src/schema/*.ts` currently has **24 files** with FK columns still physically named `profile_id` (e.g. `activation-events.ts`, `billing.ts` — both confirmed `.references(() => person.id, ...)`, i.e. the column name says "profile" but the referenced table is `person`). MMT-ADR-0007 explicitly scoped this as in-bounds: *"Rename surface is large (profiles → person, every profileId, CONTEXT.md, audience-matrix). This is accepted ... Physical execution is Phase E."* — the full surface, not just the core table, was always meant to be Phase E's job.
- No Cosmo WI or WP currently tracks finishing that column-level sweep across the 24 files. The nearest historical items (WI-781, WI-1288 — both Closed) were narrow, per-table FK-repoint efforts for `concepts`/`concept_mastery` specifically during the cutover, not a general sweep.
- Caveat per advisor review: I found no ruling stating whether the 24 residual `profile_id` columns are unfinished work or a deliberate keep (e.g., cost/risk of a mass rename post-launch could argue for leaving them). Present as current-state fact, not as a confirmed defect — that call is the operator's, not mine.

**Recommendation:** PM mints a new WI for the column-level `profile_id`→`person_id` rename sweep (or explicitly rules it deliberately deferred/accepted, mirroring the WI-1196 pattern), and WI-1196's text should be corrected to point at the real tracker instead of WI-1848 once one exists.

---

## Seam map

- **WI-2119** (Clerk security-service timeout blocking web sign-up, Executing) — **no file overlap** with any BID-14 member. It's a frontend Clerk-hosted sign-up component mount-timing/CAPTCHA bug in the web sign-up screen. Adjacency to BID-14 is thematic only (Clerk is the auth layer underlying `callerPersonId` resolution used by WI-1989's fix), not code-level. Team lead flagged this as stop-and-ask elsewhere — nothing here changes that, just confirming it's not a hidden BID-14 collision.

- **WI-1193** (adult lawful-basis + consent-purpose split, **Executing right now**) — **real, active seam with WI-1989.** `apps/api/src/routes/consent.ts` (WI-1989's edit target, 3 of its 7 route files) imports `getChildConsentForParentV2` from `apps/api/src/services/identity-v2/family-v2.ts`. WI-1193's description names `consent-status-v2.ts`, `consent-v2.ts`, `profile-v2.ts`, `family-v2.ts` (all in the same `services/identity-v2/` directory) as its edit targets for the purpose-split work. Not a hard blocker — WI-1989 only adds one gate call in `consent.ts` itself and doesn't touch `family-v2.ts` — but both land in the same consent domain concurrently. Recommend: whoever executes WI-1989 re-runs `consent.ts`/`consent.test.ts` after checking WI-1193's current state, since a purpose-split change to consent-shape could shift fixtures the break test builds on.

- **WI-2064** (consent-withdrawal bearer-token threat posture, In Review) — **no file overlap.** Operates on the public unauthenticated bearer-token consent-withdrawal link (`consent-withdrawal-token.ts`, the public consent-web route) — a structurally different authority mechanism from WI-1989's authenticated `X-Profile-Id` owner-gate. Thematically adjacent (both are "who can act on child consent") but no shared code.

---

## Open flags

1. **Systematic Kind-empty gap** across all four members — likely a batch-formation artifact, worth checking whether other batches from the same capture pass have the same miss.
2. **T3 (deletion recovery/audit proof)** — sibling task to WI-2055/2056's T2 in the same one-way-door drain plan, doesn't appear to have a Cosmo WI. Not in this batch's scope, but adjacent enough that it's worth a deliberate "not now" ruling rather than silent absence, especially since WI-1193 (Executing, seam above) already covers a different T8 fold-in from the same drain plan — the drain plan's items are being picked up piecemeal across multiple batches.
3. **Rename-tracker gap (above)** — feeds WI-1196 directly; PM action needed regardless of BID-14's own dispatch readiness.
4. **WI-1193 is Executing concurrently** with BID-14's prospective dispatch window — real-time collision risk in `services/identity-v2/`, not just a documentation cross-reference.
