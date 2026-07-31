---
title: "S2-06A — Disposition ledger for the MVP-relevant census MUST decisions"
date: 2026-07-30
status: "Authored. All eight in-scope census rows disposed. Every authored ADR is Status: Proposed and requires human Architecture sign-off before it is canon (MMT-ADR-0000 §II.6 rule 3)."
scope: >
  Census rows 3, 9, 12, 13, 15, 19, 53, 57 ONLY, from
  `_wip/umbrella-program/2026-07-14-s2-01-decision-census.md`. Rows 1, 2, 4, 5, 8, 10,
  18, 29, 40, 41, 44, 54, 58 are the sibling slice's scope and were not touched, read
  for disposition, or altered here.
sealed-quarantine: >
  `docs/_archive/parallel-adr-audit-2026-06-03/` was NOT opened, read, grepped, or
  seeded from at any point in this slice. It remains sealed until S2-15.
---

# S2-06A — Disposition ledger

## 1 · What this slice did

Executed the eight MVP-relevant MUST decisions from the S2-01 census as ADR reconstruction. Each authored ADR records a decision **already made**, recovered from the artifacts cited below and stamped `reconstructed 2026-07-30`. No decision was originated here; where the reasoning was recoverable it is recorded, and no rationale was invented.

**ADR numbers allocated: `MMT-ADR-0038` … `MMT-ADR-0045`** (eight, contiguous). Prior maximum in the tree was `MMT-ADR-0037`. `MMT-ADR-0003` is a pre-existing gap in the sequence and was deliberately **not** filled — reusing a withdrawn number would make every historical reference to it ambiguous.

**Every authored ADR is `Status: Proposed`, `Deciders: pending Architecture sign-off`.** None asserts sign-off. `MMT-ADR-0000` §II.6 rule 3 reserves `Accepted` for a human representing Architecture and names agent self-promotion as the anti-pattern.

## 1a · The D5 precondition — verified satisfied in fact, not assumed

The ratified sequencing rule (D5) is that ADR-governance amendments land **before** bulk ADR backfill. That precondition was checked against the tree rather than taken on trust, because a backfill this size is exactly what it exists to gate.

- **The substance is present.** `docs/adr/MMT-ADR-0000` §II.6 carries all five amendment rules — reconstruct-vs-launder, L3-in-passing-only, `Accepted` requires human Architecture sign-off, dedicated change-set, and the provenance stamp. All five were applied in this slice.
- **How it landed:** commit `22122c94adef3b2eba50ef96b51ac8fb3a0f8990` — *"docs(adr): MMT-ADR-0000 provenance discipline; fold amendments \[WI-752]"*.
- **Why the amendment work items read as unfinished but are not.** They closed as *Superseded* / *Duplicate* because their content was folded into that single change rather than landing separately. Nothing was dropped; the closure reason describes the consolidation, not an abandonment.
- **Independent corroboration:** the rule is not merely written but *mechanised* — `scripts/check-adr-provenance.ts` fails any newly-added `Accepted` ADR lacking human Architecture sign-off. A governance rule with a working CI guard is stronger evidence of "landed" than prose alone.

## 2 · The eight-row disposition

| Row | Decision | Disposition | Path | Convergence owner | Source evidence |
|---|---|---|---|---|---|
| 3 | `private_sources`/`sourceAudit` envelope contract; general-knowledge confidence gate; source-bound vs. general-knowledge turn taxonomy | **New ADR** — one envelope-contract ADR with the `0.88` floor recorded as a **parameter inside it**, per the D2 ruling of 2026-07-15 (which overrode the earlier draft recommendation of a separate companion ADR for the threshold) | `docs/adr/MMT-ADR-0038-private-source-provenance-envelope-and-confidence-gated-general-knowledge.md` | — | `.claude/memory/project_llm_source_provenance.md`; `packages/schemas/src/llm-envelope.ts` (envelope shape); `apps/api/src/services/exchange-types.ts` (`GENERAL_KNOWLEDGE_CONFIDENCE_FLOOR = 0.88`, single named constant); `apps/api/src/services/exchanges.ts`; `apps/api/src/services/exchange-prompts.ts` |
| 9 | Session lifecycle: wall-clock shown to all, active time internal-only, hard caps removed, model-adaptive silence, gap-cap active-time algorithm | **New ADR** | `docs/adr/MMT-ADR-0039-wall-clock-is-the-session-duration-and-sessions-end-on-intent-not-a-cap.md` | — | `.claude/memory/project_session_lifecycle_decisions.md`; `apps/api/src/services/session/session-context-builders.ts` (`computeActiveSeconds`); `apps/api/src/services/session/session-crud.ts`; `apps/mobile/src/components/session/use-session-streaming.ts` (adaptive silence, shipped); `hard_cap` — **zero occurrences repo-wide**, removal confirmed |
| 12 | No screen may force "add a child" as the only path | **New ADR** — converged with `WI-2532`, not duplicated; see §3a for the in-flight caveat | `docs/adr/MMT-ADR-0040-no-screen-state-may-require-adding-a-dependent-to-proceed.md` | **WI-2532** (*Add the Me-or-someone-else fork to family-intent onboarding*) — owns the concrete onboarding surface; the ADR records the standing rule and cites the implementing component as a consumer, never as authority (§II.6 rule 2) | `.claude/memory/feedback_never_force_add_child.md`; **PR #2696 diff read in full** — `FamilyIntentOnboardingGate.tsx`, `create-profile.tsx`, `link/initiate.tsx` |
| 13 | UX philosophy: confident inference + reversible defaults over both surveillance and friction | **New ADR** — narrowed to the invariant and the recorded alternative-rejection | `docs/adr/MMT-ADR-0041-confident-inference-and-reversible-defaults.md` | — | `.claude/memory/feedback_quiet_defaults_over_friction.md` (last_confirmed 2026-06-11) |
| 15 | Free-tier quota shape and quota-counting invariants | **New ADR + canon correction** — reconciled against **live quota configuration first**, per the AC | `docs/adr/MMT-ADR-0042-free-tier-dual-cap-and-quota-counting-invariants.md`; canon corrected at `docs/PRD.md` (3 lines) | — | **Live config read:** `apps/api/src/services/subscription.ts:43-59` — `free: { monthlyQuota: 100, dailyLimit: 10 }`, static, unconditional. `apps/api/src/middleware/metering.ts`; `.claude/memory/pricing_dual_cap.md` |
| 19 | Source-audit gate exemptions must key on turn identity, never a reply-content regex | **New ADR** — stated at the durable level (a gate exemption keys on the identity of the gated unit, never on a classifier over its output) | `docs/adr/MMT-ADR-0043-gate-exemptions-key-on-turn-identity-not-output-classification.md` | — | `.claude/memory/project_enduser_gate_carveout_turn_allowlist.md`; commit `a006c40c2` (unusually complete recoverable *why*, incl. the falsifying adversarial inputs); `scripts/enduser-quality-patterns.ts` (`sourceAuditGateFires`); `scripts/enduser-session-pass.ts` (`exemptSourceAudit`) |
| 53 | Crisis-disclosure → learner resources + operator telemetry, **no guardian notification** | **New ADR** — see §4; the one row carrying irreversible safety weight | `docs/adr/MMT-ADR-0044-crisis-disclosure-routes-to-the-learner-and-operator-never-to-a-guardian.md` | — | Four independent non-ADR sources, all verified live — see §4 |
| 57 | Account-detachment ruling: 13+ detachment floor, supporter ceiling, proxy dormancy | **New ADR (narrowed) + convergence** — see §5; authored only what survives convergence | `docs/adr/MMT-ADR-0045-detachment-entitlement-floor-and-derived-management-capability.md` | **`MMT-ADR-0027`** (supporter ceiling / artifact wall) and **`MMT-ADR-0028`** cl. 4 & 6 (supportership lapse at the consent crossing; detachment ≠ graduation) — converged with, explicitly **not** restated. Identity-canon vocabulary work: **WS-32** identity lane | `_wip/identity-foundation/2026-06-09-account-detachment-decision-capture.md`; `MMT-ADR-0008`/`0010`/`0027`/`0028` read in full |

No row is silent, and no decision is recorded twice: rows 3 and 19 are adjacent but distinct (the source-discipline *contract* vs. the *exemption mechanism* for the gate that enforces it), and rows 12 and 13 are kept separate because 12 is a hard product invariant with a live implementing surface while 13 is a design posture.

## 3a · Rows 12/13 — convergence with WI-2532, which is in flight

`WI-2532`'s implementation is **PR #2696, OPEN and MERGEABLE, not merged** at the time of drafting. The convergence was therefore performed against the actual diff (`gh pr diff 2696`), not against the census's description of intended work. Files read: `FamilyIntentOnboardingGate.tsx` (new), `create-profile.tsx`, `link/initiate.tsx`, `family-intent-onboarding-state.ts`, and `v2-family-intent-onboarding.spec.ts`.

**Verified agreement, clause by clause** — `MMT-ADR-0040` and #2696 concur, and neither was adjusted to fit the other:

| ADR-0040 clause | What #2696 implements |
|---|---|
| cl. 2 — ask rather than infer where the target is ambiguous | A `learner-target` step offering *Me* / *Someone else* replaces the unconditional redirect |
| cl. 4 — the solo path creates no relationship state | *Me* queues the mentor ceremony, clears the pending state, and completes; no family, guardianship, or supportership write |
| cl. 1 / Consequences — an unavailable branch is explicitly gated, never silently selected | A `managed-unavailable` step that states the branch is unavailable and returns to the live choice, rather than defaulting into it |
| cl. 1 — no dead ends | The removed code path is the one that sent the adult to an add-a-child screen; its replacement comment states the fork "must not silently select the managed-child path or create any relationship state" |

**No conflict was found, so nothing was silently reconciled.** One wording refinement was made to the ADR for precision, not to resolve a disagreement: the rejected alternative about escape affordances now distinguishes *leaving the flow entirely* (rejected) from *returning to a live choice* (acceptable), so it cannot be misread as prohibiting the `managed-unavailable` back action.

**In-flight caveat.** `MMT-ADR-0040` and `MMT-ADR-0041` state standing rules and do **not** depend on #2696's final shape — no clause would need rewriting if the PR's UI, copy, or step names changed before merge. Nothing from the unmerged PR is asserted as settled canon; the only reference to it in the ADR is a file pointer identifying a consumer of the rule. If #2696 lands materially changed on the *invariant* (rather than the surface), that is an ADR amendment, not a silent drift.

## 3 · Row 15 — the live-configuration reconciliation

The AC required row 15 be reconciled against live quota configuration **before** any decision text was written. It was, and the two sides disagreed.

- **Live config** (`apps/api/src/services/subscription.ts:43-59`): `free: { monthlyQuota: 100, dailyLimit: 10 }` — a static tier property with no date, tenure, or trial-state condition.
- **Product doc** (`docs/PRD.md`, three places): "100 questions/month with **first-week boost (10/day for days 1-7)**".

**Falsification performed:** a repo-wide search across `apps/`, `packages/`, and `scripts/` for any signup-date-relative, tenure-relative, or day-bounded daily cap returned **nothing**. The only consumers of the free tier's `dailyLimit` read it unconditionally from the static config — including `apps/api/src/inngest/functions/trial-expiry.ts:267-275`, which applies it as-is when a trial ends.

**Conclusion:** the first-week-boost framing describes behaviour that was never built. The permanent dual cap is both the implemented and the intended shape. `docs/PRD.md` corrected in the same change-set (the §II.2 lockstep half for `MMT-ADR-0042`).

**Correction applied at review (PR #2707, Codex finding).** The ADR's first draft said flatly that *paid tiers carry a monthly cap only*. That is true for a paid **owner** and for the shared-pool tiers, and **false for a child profile on Plus**, which carries a live 10/day cap. Caps are resolved per profile by `getProfileQuotaLimits(tier, role)` — nothing for shared-pool tiers, owner-or-child fields by role for per-profile tiers — then written onto the profile's quota row at provisioning and enforced by the metering middleware. The finding was verified against live code and the clause was rewritten rather than waived: an ADR asserting that paid tiers have no daily cap would, once treated as canon, supply the justification for deleting a dependent learner's daily protection as contradicting canon. That is precisely the doc-drift-weakens-a-safeguard failure this drain exists to prevent, and the badge severity was not the deciding factor. The corrected clause states the role-resolved rule and says explicitly that nothing in the ADR authorises removing the child-side cap. **No code or quota configuration was changed — the code was right and the document was wrong.**

**Deliberately excluded from the ADR:** the 2026-07-15 cap-communication product ruling (quiet warning ahead of the cap; an unadvertised goodwill question before pausing) is recorded by its own source as *not yet implementation canon*. Writing it into a Decision section would launder an undecided thing into architecture. It is noted in the ADR's Consequences as excluded and becomes canon through its own change when built.

## 4 · Row 53 — the irreversible-safety row

Drafted to completion with full rigour. Two findings the reviewer needs.

**Finding A — the source count is four, but the census understated it.** The census tagged row 53 `single-canon`, citing one document at two lines. That was a sweep artifact: `docs/registers/safety-guards/` was not in the census's enumerated sweep list. Four independent, mutually-consistent non-ADR sources exist and were each read:

1. `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md:109,164` — the 2026-07-10 ruling; the conflicting guardian-notification wording struck as superseded.
2. `docs/registers/safety-guards/master.md:41` (register row 5) — the guard, its enforcement point, and its code sites.
3. `docs/compliance/edpb_dpia_filled_2026_v1.md:271` — the DPIA entry for abuse/crisis-disclosure handling.
4. Implementation: `apps/api/src/services/exchanges.ts` (`emitCrisisRedirectEvent`) and `apps/api/src/services/exchange-prompts.ts` (SAFETY block, incl. the mandatory signal-binding rule).

**Finding B — one dispatch attribute belongs to a different row.** "All four self-flag as ADR-candidates" is a property of census **row 54** (age-floor / launch-posture), whose four sources each explicitly say they should become an ADR. Row 53's four sources do not self-flag. The irreversibility characterisation, however, holds for row 53 on its own merits and independently of row 54: guardian notification cannot be recalled, the disclosure cannot be un-shared, and there is no compensating control. That asymmetry — not the source count — is the spine of `MMT-ADR-0044`.

Per §II.6 rule 2, the L3 plan document that records the ruling is cited in Links as *where it was recorded*, never as why it holds. The ADR's reasoning is the safety argument itself.

## 5 · Row 57 — convergence, and the deferred canon half

The census judged `MMT-ADR-0008`/`0010` the closest near-misses. Reading the full ADR register found two closer ones, both post-dating the 2026-06-09 capture, which already own part of the ruling:

- `MMT-ADR-0027` cl. 1 & 4 — the supporter reportability allow-list and the artifact wall. This **is** the supporter ceiling (§1.5 of the capture).
- `MMT-ADR-0028` cl. 4 — guardian-granted supporterships re-confirmed or lapsed at the consent-capability crossing; cl. 6 — attaching a Login is not by itself graduation.

`MMT-ADR-0045` therefore authors only what genuinely survives convergence: the 13 child-claimable detachment floor, guardian management as a **derived** `manage`/`operate` capability rather than a stored grant (with the consequence that detachment suppresses those surfaces structurally, no per-screen flag), one-directionality, and proxy-mechanics-retained-with-no-entry-point.

**Deferred canon deltas — off this slice's file surface, sequencing requested.** The capture's §4 vocabulary work lands in files owned by other executors in this lane right now and was **not** touched:

| Delta | Target file | Status |
|---|---|---|
| Rename the login transition to *account detachment*; reserve *graduation* for the consent-capability crossing | `docs/canon/identity/ontology.md` | **Deferred — off-surface** |
| Record 13 as the child-claimable detachment floor (the open credential-eligibility decision) | `docs/canon/identity/ontology.md` | **Deferred — off-surface** |
| Split the affected canon requirement into its detachment and graduation halves | `docs/canon/identity/prd.md` | **Deferred — off-surface** |
| Supporter-ceiling / notes-wall / proxy-no-entry as settled product rulings | `docs/canon/identity/prd.md` Part 10 | **Deferred — off-surface** |

Lockstep (§II.2) binds at **acceptance**, and `MMT-ADR-0045` lands `Proposed`. A deliberately-deferred canon half is therefore a sequencing request, not a §II.2 breach — but the ADR must not be promoted to `Accepted` while the canon it renames still says otherwise. Recorded in the ADR's Consequences as well as here.

## 6 · Findings for follow-up (not fixed here — out of file surface)

1. **Shipped drift against `MMT-ADR-0039` clause 3.** `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx:316-321` resolves a session's displayed duration as `session.durationSeconds ?? session.wallClockSeconds` — **preferring internal active time over wall-clock** on a parent-facing surface, which inverts the decision. The sibling surface `apps/mobile/src/app/(app)/my-notes/[kind].tsx:137` has the correct precedence (`wallClockSeconds ?? durationSeconds`), though the ADR's stated fallback for an unavailable wall-clock is to present no duration rather than to substitute active time. Mobile is outside this slice's file surface; no code was changed. Worth a small correcting item.
2. **Census drift-class tag for row 53 understates its sources** — see §4, Finding A. The census's `single-canon` tag reflects a sweep that did not include `docs/registers/`. Not corrected in the census file (it is the sibling slice's artifact and a shared surface); recorded here instead.
3. **Extract-before-cleanup (AC 5) — no source was reduced, relocated, or archived by this slice.** One transient scare worth recording so a reviewer does not re-derive it: `.claude/memory/project_enduser_gate_carveout_turn_allowlist.md` (row 19's cited source) appeared absent at first read. Cause was a stale worktree — the checkout was 124 commits behind `origin/main`, where both that file and `MMT-ADR-0037` already existed. Fast-forwarded to `origin/main` before any drafting; the file is present and was read in full. No deletion occurred, by this slice or any other.

## 7 · Verification

Run on Node v22.16.0 / pnpm 10.19.0 (the versions `package.json` pins; the host default of Node v24 is a mismatch and was overridden session-scoped).

```
$ pnpm run check:adr-provenance -- --base origin/main --head HEAD
adr-provenance: clean (8 added ADRs checked)

$ pnpm exec jest --config scripts/jest.config.cjs scripts/check-adr-provenance.test.ts --runInBand --no-coverage
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total

$ pnpm run check:decision-adr-link
decision-adr-link: clean (3 grandfathered, 0 new)

$ bash scripts/check-migration-rollback.sh
✓ All destructive plans have Rollback (0 of 18 plans contain DROP)
✓ All destructive SQL migrations have a rollback.md (36 of 163 migrations are destructive)
✓ Latest journal entry (idx 0162) has a snapshot

$ pnpm run check:flow-inventory-cite-rot
flow-inventory-cite-rot: clean (451 citations, 288 row IDs, row-id links, flag tokens,
legacy tags, and nav-shell-matrix tab shapes all resolve).

$ BASE_REF=main bash scripts/check-change-class.sh --branch
No change classes matched (11 file(s) checked).
Pre-commit hooks (lint, tsc, surgical tests) cover these files.
```

`adr-provenance` is the mechanised form of MMT-ADR-0000 §II.6 rule 3: it fails a newly-added ADR whose status is `Accepted` without a human Architecture sign-off on the Deciders line. All eight are `Proposed`, so all eight pass by construction rather than by exemption. Every ADR cross-link in the eight new files and the ledger was separately confirmed to resolve to an existing path.

**A note on `--branch` and stale bases.** Run without `BASE_REF`, the change-class router resolves its base as `git merge-base HEAD main` — the *local* `main` ref, which in this worktree was 124 commits behind `origin/main`. It reported **821 files and eight change classes** (`llm-prompts`, `shared-schemas`, `mobile-src`, …), none of which this change touches: the surplus is other lanes' landed work attributed here by an advancing base. Re-run against `origin/main` it reports the truth — 11 files, no classes matched. Git is the authority for what this change contains:

```
$ git show --numstat --format="" <commit>
113  0  _wip/umbrella-program/2026-07-30-s2-06a-disposition-ledger.md
  3  3  docs/PRD.md
 52  0  docs/adr/MMT-ADR-0038-…  48 0  …0039-…  40 0  …0040-…  45 0  …0041-…
 49  0  docs/adr/MMT-ADR-0042-…  47 0  …0043-…  57 0  …0044-…  55 0  …0045-…
  1  0  docs/adr/README.md
                                          11 files changed, 510 insertions(+), 3 deletions(-)
```

Additive throughout except `docs/PRD.md`, whose 3 deletions are exactly the three replaced free-tier lines of §3's lockstep correction. No other deletions, and no inverted-sign entries.
