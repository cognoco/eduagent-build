# 06 — Fable Independent Audit: identity-v2 cutover × app-shell-v2 × their seam

**Anchor:** `origin/main` = `145e74d5e` (verified still tip at 2026-07-02T12:11Z — no re-anchor needed).
**Method:** read at the `origin/main` ref, not the working tree (local `main` = `d843bf7bd`, diverged; the
prep flagged this working-tree-vs-ref trap and it is real — see Q1-F15). Prep packs treated as
verified *leads*: archived-artifact claims (DB matrices, RLS, CI-schema) accepted with sanity checks;
summary-only and decision-carrying claims re-verified against primary source. §1 exclusion honored —
the WI-779 strip-proposal + critique were not read; WI-779/WI-1128 used as raw Cosmo records only.

**Framing correction (adopted from operator, supersedes the prep's charter framing).** The prep framed
this as two binary verdicts ("cutover done?", "V2 shippable?"). The real problem is a **matrix-collapse**:
identity-code generation, DB-schema generation, and shell generation were each advanced independently by
two uncoordinated initiatives (Identity Foundation/Cutover and the front-end V0/V1/V2 work), and no
environment runs a verified target triple. So the synthesis below is a **sequenced convergence plan with
go-gates**, inside which "cutover-go" and "V2-ship" are milestones — not standalone rulings. Operating
principle ratified with the operator: **preserve old versions as tagged releases, not as live code**;
collapse the shell flag-ladder to two owned arms (V2 default + V1 fallback on the same v2 backend); do
**not** split into separate apps (measured: shells share 86% of screens — 83 of 97 route files — and the
entire non-UI stack; a split duplicates or re-packages the wrong 86% and doubles every pipeline while
making rollback *worse*).

---

## Part 1 — Adversarial verification of SBF-001..010

Verdict codes: **CONFIRMED** (re-verified at anchor against primary source) · **CONFIRMED+REFRAMED**
(true but the framing/severity changes) · **ACCEPTED** (archived evidence sound, sanity-checked not redone).

### SBF-001 — Orphaned dead legacy subtree — **CONFIRMED**
Re-verified the claim by attacking the sweep's *method*, not repeating it. Three access paths the
import-based sweep can't see, all clean at anchor:
- Drizzle relational queries (`db.query.profiles` etc.) on legacy tables in non-test `apps/api/src`: **zero**.
- Raw-SQL verbs (`FROM/JOIN/INTO/UPDATE/DELETE`) on the 5 legacy tables: only `services/deletion.ts`
  (dead — zero live importers, Q1-F15) and `services/billing/trial.ts::resetExpiredQuotaCycles` (dead).
- Aliased legacy imports (`profiles as legacyProfiles`) repo-wide: only 3 files —
  `test-seed.ts`, `identity-graph.ts:423`, `subscription-core-v2.ts:423`. **All three are
  catalog-gated** (`if (await tableExists(db,'subscriptions'))`/`legacyAccountsPresent`) — they write the
  legacy row *only when the table still exists* and self-inert post-DROP. These are deliberate
  reseed/FK-bridge shims, not live legacy readers.

`decrementQuota`'s fail-open default (`identityV2 = false`, `metering.ts:259`) confirmed: both live callers
(`metering.ts:776`, `session-completed.ts:1896`) pass `true`; the legacy join is reachable only if a future
caller omits the arg. **Net: zero live legacy readers holds at anchor with no untraced exception.** The dead
subtree (`services/profile.ts` 12/15 exports, `billing/family|tier|quota-*|revenuecat|subscription-core`,
`consent.ts` DB fns, `solo-progress-reports.ts`, `deletion.ts`, legacy webhook handlers) is large,
precisely enumerated, and imports tables that are **already dropped in prod** — so it is prod-500-on-
resurrection, and Q1-F15 (WI-1255) proves resurrection happened once, live, five commits before the anchor.

### SBF-002 — CI DB matches no deployed env — **ACCEPTED** (archived evidence sound)
CI builds its test DB from `drizzle-kit migrate` on the committed journal (`ci.yml:131`, `:496`); the
terminal cutover SQL is out-of-journal in `_freeze-only/`, so CI retains legacy `subscriptions` + legacy
FKs. CI therefore tests a schema **no deployed env runs**. Confirmed the mechanism from the WI-1128 record:
the out-of-band prod drop broke even the *committed* journal tail (0124/0128 referenced dropped `profiles`)
— fixed by editing two immutability-allowlisted migrations (slice `56b9ded15`). Decision deferred to Part 4.

### SBF-003 — Three envs, three cutover stages — **ACCEPTED**
prd (cleanest: legacy `subscriptions` dropped, v2 parents empty) > stg (orphan `subscriptions`, 42 rows,
0 inbound FK) > dev (full legacy schema + data + legacy FKs). Live catalog artifacts persisted and internally
consistent. prd-ahead-of-stg is real and inverts the usual order — a consequence of per-env hand-application
of the freeze-only migrations (Q3-F3), not a rollout policy.

### SBF-004 — Shell/identity coupling; spec phase-gating falsified — **CONFIRMED+REFRAMED**
Spec §9/§S0 claims `person`/`membership`/`guardianship` "do not yet exist in code" and that S0–S3 are
identity-independent. At anchor they exist, are live, and `routes/profiles.ts` wires them **unconditionally**
(no flag) via identity-v2 adapters — hit by **both** the prod V0 shell and the V2 channels. **Reframe:** this
is not "a stale spec sentence." It is the structural core of the whole mess — the shell was never decoupled
from identity; it consumes a **legacy-shaped profile DTO synthesized from identity-v2 tables**
(`listProfilesV2`/`getPersonScope`/`loadProfileRowByIdV2`), and that synthesis layer is the *only* place the
two systems touch. Every materialized incident (Q4-F7: WI-1255 deletion-500, WI-1161 export-500, WI-1138
consent leak) happened there. The "S4 coupling review" the spec deferred was never done because the coupling
had already shipped underneath it. **This DTO seam is the audit's center of gravity.**

### SBF-005 — One-org-one-household invariant — **CONFIRMED (holds by construction, not by constraint)**
Exhaustive write-side trace: repo-wide there are exactly 2 `membership` INSERTs, 1 `guardianship` INSERT,
2 `person` INSERTs — all in `services/identity-v2/`, all attaching to a **server-derived** org (fresh org for
owner bootstrap; `c.get('account').id` for child-create, never client-supplied). No "attach existing person
to an org" path; no production `UPDATE membership SET organization_id`. Supporters use a **separate**
`supportership` table (not `membership`), so they never surface in `listProfilesV2`; `membership.roles` is a
closed `{admin,learner}` CHECK — **"supporter" is not a membership role.** So the mobile `!isOwner` filter is
safe today. **Residual risk (real, not current):** the invariant is enforced by convention +
`identity-resolve.ts:70-77` (refuses login if a person has ≠1 membership), **not** by a DB constraint.
`membership_person_org_unique` is on `(person_id, org_id)` — it blocks a duplicate row in the *same* org, not
a second membership in a *different* org. A future cross-org/invite path could arm a leak. **Convergence-plan
item:** add a DB-level one-membership-per-person guard before any invite/claim/multi-credential flow ships.

### SBF-006 — No RLS backstop + fail-open isOwner — **CONFIRMED+REFRAMED (sharpest finding; upgraded)**
The RLS half is accepted (17/18 identity-v2 tables RLS-off, matches legacy baseline, not a regression). But
the app-guard walk found the load-bearing app layer uses the **wrong key**, and this is bigger than the prep's
"verify the guards" framing:

- **`isOwner` is derived from the client-supplied `X-Profile-Id` header, not the caller.** `getPersonScope`
  (`profile-v2.ts:380-421`) resolves the header to a person, checks only **org membership**, and sets
  `isOwner = found.roles.includes('admin')` — the roles of the *selected target*, not the authenticated
  caller. The owner gates on every `/account/*` (export, **delete**, email, security) and `/billing/*`
  endpoint call `assertOwnerProfile`, which trusts this header-derived `isOwner`. **The codebase's own canon
  says this is wrong** (`ownership-v2.ts:8-19`: "an org-membership check is the WRONG guard for a write… the
  IDOR this guard exists to deny"). The hardened caller-bound guard `verifyPersonOwnershipV2(callerPersonId)`
  exists but is wired into only 2 consumers (settings + learner-profile self-writes), **not** billing or
  account.
  - **B-1 (HIGH, latent-but-armed):** exploit shape — a non-owner authenticated member reads the owner's
    `person.id` from the un-gated `GET /profiles`, then sends `X-Profile-Id: <owner_id>` to `/account/export`
    or `/account/delete`; `assertOwnerProfile` passes. **Not exploitable today** because no login-bearing
    non-owner can exist in a shared org (only `createIdentityGraph` mints logins, always into a fresh
    single-admin org; children have `login_id NULL`; invite/claim is unimplemented). It becomes a live IDOR
    the instant *any* of {family invite, adult-sibling login, child credential} ships.
  - **B-2 (MEDIUM, live-but-bounded):** the `OWNER_ELEVATION_REQUIRED` reverification (MMT-ADR-0025 — fresh
    Clerk factor before a non-owner-context session touches billing/security/export) is enforced **only inside
    the `/profiles/switch` handler** (`profiles.ts:421`, env-gated `OWNER_ELEVATION_GATE_ENABLED`). Any caller
    holding the owner's authenticated session in a child-active context can skip `/switch` and send
    `X-Profile-Id: <owner_id>` straight to the owner endpoints, bypassing reverification. Bounded (needs
    physical access to an authenticated device; the child-active "mode" is client-shell state the API doesn't
    see) — but it makes a shipped ADR control defense-in-depth-only.
- **Fail-open direction, corrected:** malformed/empty `roles` fails *closed* (isOwner=false → blocked), which
  is good. The real fail-open is **"a caller selects the owner's shape,"** not "empty roles leak." The guards
  are **not independent of the mobile shell's shape gating** — the API trusts the shape the client picks.

### SBF-007 — AC/canon vs Cosmo drift; supporter gap — **CONFIRMED (drift real; gap is CLOSED)** — see Part 2.
### SBF-008 — Cutover workstream open — **CONFIRMED** (WS-18: WI-1239 Ready, WI-1254 Ready, WI-1128 Ready-blocked-on-779, WI-779 open) — see Part 2/4.
### SBF-009 — Inert policy-engine tables — **ACCEPTED** (regimes/policy_*/allowed_models: zero service consumers at anchor; `judge-dispatch.ts` imports no policy table). Designed-but-unwired; does not affect "identity-v2 complete" for the MVP — it's future-capability surface. Note for post-ship.
### SBF-010 — hasPremiumLlm hardcoded false — **ACCEPTED** (contained, no live consumer). Post-ship cleanup.

---

## Part 2 — Charter answers (Q1–Q6)

**Q1 — Cutover completeness (live code): COMPLETE.** Zero live legacy readers/writers at anchor, verified
via four independent method-attacks (SBF-001). The cutover at the *live-code* level is done. Caveat: it is a
**hardcoded source-level** cutover (no `IDENTITY_V2_ENABLED` runtime flag — deleted, WI-868), so correctness
rides entirely on the sweep being exhaustive; a large dead subtree still imports dropped tables and would
prod-500 on resurrection.

**Q2 — Schema/DB convergence: NOT MET.** Three envs at three stages (SBF-003). "v2-only target met" is false
today: prd yes, stg orphan-`subscriptions`, dev fully legacy. Every divergence is a tracked-open Cosmo item
(Q6-F3) — managed backlog, not silent corruption.

**Q3 — Migration integrity: reproducibility gap CONFIRMED, consequence is real.** Terminal cutover
(0117/0118/0119) is intentionally out-of-journal in `_freeze-only/`, guard-enforced, hand-applied per env.
`drizzle-kit migrate` reproduces none of prod/stg. CI is journal-built → tests a schema no env runs (SBF-002).
The out-of-band drop already broke the committed journal tail once (Q3-F7, a ~13h deploy blocker). This is a
**process/CI-fidelity** hazard, not a live-data hazard.

**Q4 — identity↔shell seam (OPERATOR PRIORITY): the seam is an *accidental* interface and it is fragile.**
The shell consumes a legacy-shaped profile DTO synthesized from identity-v2 (SBF-004); it was never designed
as a contract; three prod incidents materialized there (Q4-F7); the sharpest live-adjacent risk is the
authority-key error (SBF-006 B-1/B-2). Integration-test coverage of the real adapter is **staging-Playwright
only** — no mobile unit test exercises the real `profile-v2` adapter (all use hand-built fixtures), and the
dedicated seam-registry smoke is opt-in, not PR-gated (Q4 §seam-gap). A drift in the adapter would not be
caught by either system's unit suite.

**Q5 — AC/canon/shipped coherence: docs lag code (benign), and the pivotal supporter-gap question resolves
FAVORABLY.** WI-1170 (support hub) and WI-1171 (visibility ceremony) **shipped to their own Cosmo Acceptance
Criteria** — verified: `components/support/**` (SupportHubMentorTab/JournalTab/SubjectsTab, PersonScope*,
use-shared-record), `components/visibility/**` (ContractCard, SharedRecordView, AppealButton, Revocation/
Graduation cards), API `routes/visibility.ts`+`scopes.ts`, `services/supporter-structural-mask.ts`, and the
`app/(app)/link/*` ceremony screens (new/[contractId], with wired revoke mutation) all exist at anchor; the
delivering commit `bad3821df` is an ancestor of `origin/main`. **The prep's own earlier "silent scope-
narrowing" flag was retracted as a citation error** (the "co-learning/nudge" language was the *plan's* T3
prose, not WI-1170's AC) — I confirm the retraction is evidence-based: WI-1170's actual AC has no such
language and is met. **What is NOT met** is the canonical plan's *self-consistency*: the plan's T3/T4/T7
checkboxes are unticked though the WIs are Closed (doc lag), and WS-28's full 17-item roster ≠ the plan's
8-item checklist. Three genuinely-open WS-28 items (WI-1207 Practice-access regression, WI-1124 test-hygiene,
WI-1120 animation polish) are open, none blocks the 7 publish-critical task prompts. WI-1118 (topicless-vs-
topic-scoped notes) is a scope-ruling gate, not missing code. **Net: the supporter gap is closed; the
"critical publish gap" language in the plan's Current Ruling is stale.**

**Q6 — Process/state integrity: Cosmo is largely accurate but ages fast on the active workstream.** Every DB
divergence maps to an open Cosmo item; captures lag git by hours on WS-18 (WI-1128/WI-367/WI-1207 landed after
capture). WS-18 (cutover) and WS-28 (finalization) are both **open** — "cutover complete" is not defensible at
the process level even though it is true at the live-code level. One data-hygiene blank (WI-1249).

**Open leads — dispositions:**
1. *Supporter gaps shipped to done-conditions?* → **YES** (Q5 above).
2. *prd pre-drop PITR marker for 0119?* → **CONFIRMED — marker exists and is intact** (via authenticated
   `neonctl`, project `lingering-violet-30592106`). A Neon branch **`pre-subscriptions-drop-20260618`**
   (`br-shy-star-ag6qb0xe`) forks the **production** branch (`br-green-pond-agpzmrwx`) at LSN `0/69834C0` /
   `parent_timestamp 2026-06-18T21:35:17Z` — ~43s **before** the 0119 drop (21:36Z) — and is in state
   **`ready`** (not archived, not GC'd). It's a copy-on-write snapshot pinning prod's pre-drop storage state,
   so the 0119 rollback window is **open**, not closed. The operator took a disciplined marker family before
   every destructive step (prod-pre-0117 / pre-rehearsal-drop / prod-pre-drop / pre-drop-1737 /
   pre-subscriptions-drop); the two June-18 markers are still `ready`, the June-17 ones archived (restorable,
   not deleted). *Caveat:* this is a **metadata-level** confirmation — the snapshot branches have no compute
   (`cpu_used_sec:0`), so a data-level spot-check (confirm `subscriptions` + rowcount inside the branch)
   requires spinning up a throwaway compute endpoint on it; not done here (infra-create). The marker's
   existence + correct pre-drop LSN pin is sufficient to close the "was a marker taken" question.
3. *What gates the full WI-1128 promotion?* → **WI-1239** (reader convergence, Ready) must land first, then
   WI-1128 is `blockedBy WI-779` — i.e. HOLD pending the 779-strip plan approval; it is explicitly
   *not* to run standalone (WI-1128 comment 2026-07-01T19:15). The deploy-unblock slice (`56b9ded15`) already
   landed; the *full* freeze-repoint (54 `.references(profiles.id)` across 24 files + catalog-gated forward
   migrations + test-seed conversion) is a single atomic change-set, ready, gated on the strip decision.
4. *One-org-one-household across child-creation paths?* → **HOLDS by construction** (SBF-005), residual is the
   missing DB constraint.

---

## Part 3 — Risk register

Severity calibrated to **zero production users** (prd v2 parents empty, corroborated): these are
**structural / irreversibility / pre-launch-hardening** risks, not live-user-harm risks. Confidence is in the
*finding*; severity is the *consequence if unaddressed before users arrive*.

| ID | Risk | Sev | Conf | Why it matters | Owner |
|----|------|-----|------|----------------|-------|
| R1 | **Authority binds to client-selected profile shape, not caller identity** (SBF-006 B-1). Owner gates on `/account/*`+`/billing/*` trust header-derived `isOwner`; canon says this is the IDOR they exist to deny. | **High** | High | Armed IDOR — becomes live the moment invite/sibling-login/child-credential ships. No RLS backstop. The single most important thing to fix before multi-credential orgs. | API / identity |
| R2 | **Owner-elevation reverification bypassable** (SBF-006 B-2). MMT-ADR-0025 control enforced only in `/profiles/switch`; direct `X-Profile-Id` to owner endpoints skips it. | Med | High | A shipped security ADR is defense-in-depth-only. Live but bounded (needs authenticated device). | API / identity |
| R3 | **CI tests a schema no env runs** (SBF-002). Journal-built CI keeps legacy FKs + `subscriptions`; can't catch a v2-schema regression. | **High** | High | CI gives false confidence exactly on the cutover surface. Blocks a clean "cutover done." | Platform / DB |
| R4 | **Dead legacy subtree = prod-500-on-resurrection** (SBF-001). Large, imports dropped tables, not flag-isolated. WI-1255 proved it. | Med | High | Latent; one mis-wired route file re-arms a prod incident. Deletion (WI-779 direction) removes the failure mode entirely. | API / identity |
| R5 | **prd `subscriptions` rollback window** (Q3-F5, open lead #2). ~~marker unverified~~ → **CLOSED: marker `pre-subscriptions-drop-20260618` exists, forks prod at 21:35:17Z (pre-drop), state `ready`.** | ~~Med~~ **Low** | High | Rollback window is **open** — pre-drop state recoverable from the Neon branch. Optional: data-level spot-check needs a throwaway compute on the branch. | Operator / Neon |
| R6 | **Seam has no cross-boundary test gate** (Q4). Real `profile-v2` adapter exercised only by staging-Playwright; seam-registry smoke opt-in. | Med | High | The fragile accidental interface (3 prod incidents) has no PR-level regression net. | Mobile + API |
| R7 | **Env divergence blocks clean cutover** (SBF-003). dev fully legacy, stg orphan table. | Med | High | "v2-only target" false; promoting stg/dev is unproven (untested migration path). | DB |
| R8 | **One-org-one-household is convention, not constraint** (SBF-005). | Low→Med | High | Safe today; a future invite path could arm a cross-family leak. Cheap to harden now (DB constraint). | DB / identity |
| R9 | **Flag-combo dead zones** (new — matrix finding). `MODE_NAV_V2_ENABLED` doesn't feed `resolveNavigationContract`; V2 subscription fetch is `enabled: V1_ENABLED`. A V2-on/V1-off build renders V2 tabs over legacy-contract semantics; no test bans unsanctioned combos. | Med | High | Unowned cells of the shell matrix = the "jumbled code" cost, and a real mis-config foot-gun. Cheap ratchet fixes it. | Mobile |
| R10 | **Process state open** (SBF-008). WS-18 + WS-28 not closed. | Low | High | "Complete" not defensible at process level; managed, not corrupt. | Orchestration |
| R11 | **Inert policy-engine + hasPremiumLlm=false** (SBF-009/010). | Low | High | Designed-but-unwired; contained. Post-ship. | API |

---

## Part 4 — Recommendations

### The convergence roadmap (the frame for both decisions)

Target end-state: **two supported configs** — V2 shell on v2 backend (MVP default) + V1 shell on the same
backend (flag-flip fallback). Everything below is the safe order to collapse the matrix to that. Cutover-go
and V2-ship are milestones **M2** and **M5** inside it.

- **M1 — Harden the seam (do first, blocks nothing else).** Fix R1: route owner gates on `/account/*`+
  `/billing/*` through `verifyPersonOwnershipV2(callerPersonId)` instead of header-derived `isOwner`; add the
  R8 DB constraint (one membership per person). Add R9 ratchet: a test that fails on any unsanctioned nav
  flag-combo. *Condition to pass:* red-green break test for the B-1 exploit shape (per repo's CRITICAL-fix
  rule). *Owner:* API/identity. **These are pre-launch hardening — none needs the cutover finished.**
- **M2 — cutover-go (finish the cutover).** Land WI-1239 (reader convergence) → verify WI-1254 exhaustive
  sweep has a completion gate → promote the freeze-only migrations into the journal as catalog-gated forward
  migrations applied to **every** env (dev, CI, stg, prd) → fix R3 (CI now builds the real schema). *Condition:*
  CI DB matches prd; `drizzle-kit migrate` reproduces prod from journal; dev+stg converged. *Owner:* DB/platform.
- **M3 — strip legacy (release-not-code).** Tag the current tree, then delete the dead subtree (R4) + legacy
  schema defs (WI-1139) — the WI-779 direction. *Condition:* M2 green + tag pushed + typecheck/integration green
  on the stripped tree. *Owner:* API/identity. (I derived this independently of the excluded strip-proposal; if
  it agrees, that's convergent evidence, not circular.)
- **M4 — collapse the shell ladder.** Retire flags-off legacy + V0 behind a tag (S6 territory — **DEFERRED +
  IRREVERSIBLE, operator-owned**; I recommend sequencing/preconditions only, never trigger). Leave V1 as the
  single flag fallback. *Condition:* the §13.1 V0-retirement ruling (owner: product/Zuzana) + explicit human
  irreversibility confirmation. This is where "V1 still works on the v2 backend" is locked in — it already
  does (preview/staging run it today), so this is a *decision to keep V1 tested + flag-reachable*, not new build.
- **M5 — V2-ship.** Close the 3 open WS-28 items or explicitly defer with owners; reconcile the canonical plan
  doc; add the R6 seam smoke to the PR gate. *Condition:* M1 done (seam hardened) + the 7 publish-critical task
  prompts green (they are) + a real V2-flag E2E pass.

### Decision (a) — identity-cutover: **CONDITIONAL GO.**
The cutover is *done at the live-code level* (Q1) and the target is coherent, so I do not recommend no-go.
But "complete" is not yet true at the schema/CI/process level. **Go, conditioned on M2** (reader convergence
landed + freeze migrations promoted to a single journaled catalog-gated chain across all envs + CI rebuilt to
match prd). Strip (M3) follows M2 behind a tag. **Blocker to clear first regardless of cutover: M1/R1** — the
authority-key fix should not wait for the cutover, because it's the one finding that converts to a real IDOR
the moment the product grows a second credential per org. *Owners:* DB/platform (M2), API/identity (M1/M3).

### Decision (b) — V2 product: **CONDITIONAL SHIP.**
The supporter gap that the canonical plan calls the "critical publish blocker" is **closed** (Q5, verified),
and all 7 publish-critical task prompts pass. So HOLD is not warranted. Ship, conditioned on: **(1) M1 seam-
hardening done** (R1 is the one thing I would block a public launch on — no RLS backstop + wrong authority key
is not acceptable once real families with multiple people exist); **(2)** the 3 open WS-28 items landed or
formally deferred with owners; **(3)** R6 seam smoke gated in CI. (R5/prd-PITR now closed — marker confirmed.)
Shell-wise, ship V2-default + V1-fallback per M4 — do **not** split into two apps. *Owner:* product (scope
sign-off) + API/identity (M1) + mobile (R6/R9).

**Do-now, independent of everything:** the R9 flag-combo ratchet test (cheap, closes the "jumbled code"
foot-gun) and the R1 authority-key fix (the sharpest correctness risk in the audit). Both can start today
without waiting on the cutover or the ship decision.

---

## Provenance
- Code claims read at `origin/main`=`145e74d5e` via `git show`/`git grep <ref>`; two Explore sub-agents ran
  the guard-walk (SBF-006) and invariant-trace (SBF-005) at the same ref, cited file:line.
- DB/RLS/CI/env claims: accepted from prep's persisted `artifacts/*.txt` (live Doppler stg/prd/dev,
  2026-07-02), sanity-checked not re-run.
- WI-779/WI-1128 raw Cosmo records pulled fresh via Notion REST (`NOTION_TOKEN`), dumped to scratchpad,
  read in full. §1-excluded strip-proposal/critique NOT read; conclusions on strip derived independently.
- prd PITR (open lead #2) **confirmed via authenticated `neonctl`** — pre-drop branch `pre-subscriptions-drop-20260618`
  forks prod at LSN `0/69834C0` (21:35:17Z, pre-0119-drop), state `ready`. Metadata-level (branches have no
  compute; a data-level spot-check would need a throwaway endpoint on the branch).
