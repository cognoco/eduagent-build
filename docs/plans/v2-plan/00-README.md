# Mentor-Is-The-App (V2 shell) — Implementation Plan Set

**Date:** 2026-06-10 · **Status:** draft (8 phase plans + 2 references) · synced to the 2026-06-10 spec amendment (cold-start / motivation / interaction-law rulings)
**Spec:** [`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`](../../specs/2026-06-09-mentor-is-the-app-shell-redesign.md) (incl. Annexes B/C/D — the adversarial + end-user review amendments **and** the 2026-06-10 cold-start/motivation/interaction-law fold-in: §2 P5/P6/P7, §2.1 noticing loop, §3.1 learner cold-start, §3.2 supporter cold-start, §4.2 cross-scope pointer, §13.7 assertiveness dial, §15.14–19, Annex D — these plans are written against all of it)
**Planner:** `.claude/skills/writing-plans/SKILL.md`

This folder decomposes the mentor-is-the-app shell redesign into **per-phase implementation plans** (spec §11 requires one plan per strangle phase before build). It is a *strangle, not a rewrite*: every phase ships behind `MODE_NAV_V2_ENABLED` alongside the existing V0/V1 nav, and nothing in the shipped V0 5-tab shape may regress until the §13.1 retirement ruling (see S6).

> These are **plans, not code.** None of the surfaces below exists yet. The plans are forward-compatible with autonomous execution (numbered `T<n>` tasks, checkboxes, `done when:` verification), grounded in verified `file:line` anchors.

---

## The plan set

| File | Phase | Profile | Identity-coupled? | Gate | One-line goal |
|---|---|---|---|---|---|
| [`01-codebase-anchors.md`](01-codebase-anchors.md) | — | reference | — | — | The current-code anchor map (file:line) every plan cites; V2 flag-wiring recipe; shared-component inventory; screen-collapse ledger |
| [`02-flow-map.md`](02-flow-map.md) | — | reference | — | — | The mobile-flow trigger map: who/when/why/how each current inventory row is preserved, re-homed, replaced, or retired by V2 |
| [`2026-06-10-s0-backend-primitives.md`](2026-06-10-s0-backend-primitives.md) | **S0** | code | No | — | `mentor_activity_ledger` (`profileId`-keyed) + `writeActivityMoment()` + deterministic no-LLM `GET /now` (reads `retention_cards` as-is) |
| [`2026-06-10-s0r-retention-gate.md`](2026-06-10-s0r-retention-gate.md) | **S0-R** | change | No | parallel; must NOT block S1/S2 | `applyRetentionUpdate()` core-SRS chokepoint over 10 writers / 7 files; behavior-preserving; break-tests + rollback |
| [`2026-06-10-s1-mentor-home.md`](2026-06-10-s1-mentor-home.md) | **S1** | ui | No | — | New Mentor home (≤3 card feed + overflow + ever-present bar + camera + Homework chip) behind the V2 flag as "screen #89" |
| [`2026-06-10-s2-subject-hub.md`](2026-06-10-s2-subject-hub.md) | **S2** | ui | No | — | One Subject hub (shelf + progress merge; Next-up + chapter sections + topic sheet; subject-scoped notes); also linkable from current nav |
| — | **EVIDENCE GATE** | — | — | **S2 → S3 (§11/§13.6)** | S1+S2 ship-and-measure behind the flag; S3–S6 proceed only on discovery evidence vs the V1 baseline |
| [`2026-06-10-s3-journal-and-avatar.md`](2026-06-10-s3-journal-and-avatar.md) | **S3** | ui | No | gated on the evidence gate | Journal tab (recaps + browsable cross-subject archive + mentor memory, Me-scope) + avatar admin sheet + **park-and-return P3 evals** |
| [`2026-06-10-s4-scope-chip-support-hub.md`](2026-06-10-s4-scope-chip-support-hub.md) | **S4** | code | **Yes** | blocked-on identity W1 | Scope chip, Support hub, person scopes, server-enforced structural mask; ledger `profileId→personId` + `edgeId` repoint; mode/proxy/tab-matrix retire |
| [`2026-06-10-s5-visibility-contract.md`](2026-06-10-s5-visibility-contract.md) | **S5** | code | **Yes** | blocked-on identity W1+W2 + S4 | The trust layer: linking ceremony, sealed non-reportable class, render-equivalence, appeal affordance, managed/credentialized tiers, graduation, kid-initiated revocation |
| [`2026-06-10-s6-cutover-deletions.md`](2026-06-10-s6-cutover-deletions.md) | **S6** | change | — | gated on S3 evals + evidence gate + §13.1 ruling | Cutover & deletions; exit funnel dissolves; old tabs retire; V0-constraint retirement ruling executed; the ~25-screen end state |

---

## Three execution tiers

**Tier 1 — buildable now (identity-independent, today's `profiles` model):** `S0`, `S0-R`, `S1`, `S2`.
These are the validation bet. They cite no `person`/`edge`/`membership` table; the §9 contract guarantees it (if any deliverable is found to need an edge read, it is misclassified → moves to S4). S0 is the foundation; S0-R runs in parallel off the critical path; S1+S2 are the cheapest test of the whole direction.

**Tier 2 — evidence-gated (still identity-independent):** `S3`.
Authored and ready, but execution is gated on the **S2 → S3 evidence gate** (§11/§13.6): discovery/engagement must actually move against the V1 baseline. If it doesn't, the redesign validly stops at a measured S2. S3 also produces the **park-and-return eval coverage** that S6's exit-funnel deletion is contractually blocked on.

**Tier 3 — identity-blocked (cannot start until the identity runway lands):** `S4`, `S5`, then `S6`.
These consume the ratified-but-unbuilt person/edge model (`docs/canon/identity/`). They are written as real implementation plans, each opening with a hard **"## Blocked-by"** section. The blocker chain is **`WI-530` (Harness-Hygiene gate) → identity Phase P → baseline reset (`MMT-ADR-0012`) → identity W1 (schema) → W2 (consent/proxy/deletion)**. No code in S4/S5 may stub `person`/`edge` against today's `profiles`/`family_links`.

---

## Dependency graph & critical path

```
S0 (ledger + /now) ───────────────┬─► S1 (Mentor home) ──┐
   │                              ├─► S2 (Subject hub) ───┴─► [EVIDENCE GATE] ─► S3 (Journal + P3 evals)
S0-R (retention gate, parallel) ──┘                                                     │
                                                                                        ▼
   identity: WI-530 ─► Phase P ─► baseline reset ─► W1 (schema) ─► W2 (consent/proxy) ──► S4 (chip/mask) ─► S5 (trust) ─► S6 (cutover)
                                                                                                                   ▲
                                                              S3 park-and-return evals ───────────────────────────┘ (gates S6 exit-funnel deletion)
```

- **Build-now critical path:** `S0 → S1/S2`. S0-R is parallel and explicitly sequenced *not* to block (the feed reads `retention_cards` as-is until the gate hardens it).
- **Identity critical path** (the long pole for S4–S6): the identity-foundation runway, which is itself blocked on `WI-530`. S4/S5 inherit that timeline; the mentor work neither blocks it nor is blocked by it for S0–S3 (spec §9).
- **S6** needs all three: S3 eval coverage exists · evidence gate cleared · §13.1 V0-retirement ruling made by product.

---

## Frozen shared contracts (single source of truth = the S0 plan)

Every downstream plan cites these verbatim — do not introduce parallel names.

- **Feature flag:** `MODE_NAV_V2_ENABLED` ← env `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`. Read in `feature-flags.ts` (after the V0/V1 lines); dev/preview + CI-OTA only, **not** production. (A second flag, `MANAGED_TIER_ACTIVE` ← `EXPO_PUBLIC_ENABLE_MANAGED_TIER`, is introduced by **S5** to gate managed-tier activation per §13.5 — default OFF.)
- **Mount seam:** an additive branch in `useNavigationShellContract` (`use-navigation-contract.ts:142`). **`resolveNavigationContract` and `legacy-navigation-contract.ts` are pinned no-edit** — that is what guarantees §7 V0/V1 no-regress.
- **Ledger:** table `mentor_activity_ledger` (`profileId`-keyed at S0; S4 repoints → `personId` + adds `edgeId`). Writer `writeActivityMoment()` in `services/activity-ledger.ts` (non-throwing, wraps the existing `safeWrite` at `safe-non-core.ts:111`). `LedgerKind` = `session_filed | topic_mastered | retention_due | needs_deepening_added | recap_ready | snapshot_ready` (**S5 additively extends this with `graduation`** — see coordination note 2).
- **Feed:** `GET /now?scope=self` → `{ scope, cards[0..3], overflowCount, generatedAt }`; overflow via `GET /now/overflow`. `NowCard.kind` = `unfinished_session | retention_due | parked_item | needs_deepening | challenge_ready | ledger_moment`. `deepLink` = `{ route, params, chain }` resolved through the **closed route catalog** (keys: `session.resume`, `subject.hub`, `subject.topic`, `retention.review`, `challenge.start`). Backend service `buildNowFeed()/buildNowOverflow()`; mobile hooks `useNowFeed()/useNowOverflow()`; component `NowCardStack`/`NowCard`/`LedgerMomentCard`. P3 backstop windows: `PARKED_AGING_WINDOW_DAYS = 7`, `DEEPENING_SURFACE_LEAD_DAYS = 2` (aged `needs_deepening` outranks aged `parked_item` in the shared P1.5 band; `needs_deepening` reconciles with the existing `pendingExpiresAt`, no competing clock).

---

## ADR obligations (spec §12 — owed in lockstep with the canon change BEFORE the phase merges)

Latest ADR on disk is `MMT-ADR-0019`; this set reserves the next four (the `decision-adr-link` CI guard fails a spec decision block with no linked ADR):

| ADR | Subject | Spec obligation | Owned by |
|---|---|---|---|
| `MMT-ADR-0020` | Activity ledger as narration/moments substrate (template-first; load-bearing for GDPR timers) | #4 | S0 (T10) |
| `MMT-ADR-0021` | One-shell / scope-chip model supersedes the mode/proxy/tab-shape matrix | #1 | S4 (T13) |
| `MMT-ADR-0022` | Supporter visibility contract (non-reportable class, render-equivalence, appeal, artifact wall, safety exception) | #2 | S5 (T12) |
| `MMT-ADR-0023` | Managed/credentialized as visibility-tier carrier + graduation (reconcile with identity canon, don't duplicate) | #3 | S5 (T12) |

*(The original S4/S5 drafts both claimed `0021`; reconciled 2026-06-10 to the allocation above.)*

---

## Cross-plan coordination notes (resolve at build, not blockers)

1. **`/now` pure ranker seam (S0 ↔ S3).** S0's `buildNowFeed(db, profileId, scope)` reads the DB; S3's deterministic P3 eval (`eval-llm/flows/park-and-return-ranking.ts`) must drive the *pure* ranking over hand-built candidate sets. S0's T6 unit test already exercises the ranker with hand-built candidates — so S0 should expose the pure `rankCandidates()` separate from the DB-reading `buildNowFeed()`. S3 names a thin-seam fallback if S0 hasn't split it.
2. **`graduation` LedgerKind (S0 ↔ S5).** S5's `graduation-narration.ts` writes `writeActivityMoment({ kind: 'graduation', visibility: 'both', … })`; S0's `ledgerKindSchema` does not include `graduation`. S5 **additively extends** the enum — expected, not a conflict.
3. **S2 Next-up source.** S2 reads `useLearningResumeTarget` (the resume-target read) for the Next-up block rather than `useNowFeed`. This is the spec §5.1 "same source as the `/now` card" — S2 renders the same continuation source without re-ranking; it does not fork `/now`.
4. **S2 hub reuse by S4.** The `<SubjectHub>` component is built *permission-mask-ready* (data-driven, no `isOwner`/`role`/persona read; a grep-guard test enforces it). S4 reuses the same component server-masked to structural columns for supporter person-scopes — a pure data-shape change, no client ownership branch.
5. **S4 reconciliation gaps vs the identity canon** (recorded as S4 OPEN ITEMs with defaults, flagged to the identity-foundation owner — not invented silently):
   - `edgeId` has no canon column (canon has separate `supportership.id`/`guardianship.id`, no polymorphic edge). Default: nullable FK to `supportership.id`; confirm whether a typed `edge_id` + `edge_kind` discriminator is preferred **before the ledger repoint migration lands**.
   - Whether a managed charge's *guardian* also gets a chip scope (vs supportership-derived scopes only) — deferred to S5; S4 surfaces supportership-derived scopes only (launch tier = credentialized).
6. **§4.2 cross-scope pointer module (S4 ↔ S1).** S4 emits a single compact "1 thing needs you in the Support hub" pointer card into the **Me-scope** feed that S1 renders — it *points* into the hub, never *duplicates* a family-attention item (the hub/Me separation holds while the dual-role adult's signal can't be starved). It rides under the standard P6 ≤3 budget on the S1 home; S1 renders whatever `/now?scope=self` returns, so the pointer is a server-emitted `NowCard`, not a new S1 component.
7. **XP kill spans S0-R + the V0 no-regress constraint (spec §2.1 / §15.17).** The spec ruled the XP system "killed, not wired" — but the codebase audit (see `01-codebase-anchors.md` §6 + S0-R T12 findings) found XP is **live end-to-end with shipped UI readers** (Practice-hub `totalXp`, session-summary bonus copy, progress topic list), not "backend-only." Consequences the plans honor: (a) S0-R owns only the **code-only retention-path side-effect strip** (behavior-preserving for SRS); (b) the new V2 shell simply **never wires XP** (S1 renders the calm "on track" badge in place of streak/XP); (c) the shipped V0/V1 XP/streak UI **must not be removed before its host surface retires** (the §7 / §13.1 no-regress constraint). At cutover, S6 surfaces it deletes (e.g. the session-summary screen → F-XP-1) carry their XP readers with them; the XP label on a surface S6 *keeps* (the `practice/` hub → F-XP-2) plus the `xp_ledger`/`xpStatus` schema drop is an **owner-flagged follow-up** (migration after the last reader is gone), not S0-R and not silent. Two motivation systems must not coexist *on the new shell*; the old shell keeps its until it retires.

---

## Open decisions (spec §13 — block the affected phase, not the set)

| # | Decision | Owner | Blocks |
|---|---|---|---|
| §13.1 | V0-preservation-constraint retirement threshold | product (Zuzana) | S6 |
| §13.2 | Identity-foundation sequencing confirmation (runway tolerates this consumer) | product / identity | S4 |
| §13.3 | Managed-tier reporting richness over credentialized | product | S5 build detail |
| §13.4 | "Journal" vs "Notebook" name — kid-tested **with** the trust copy | product | S3 (name only) |
| §13.5 | Managed-tier launch activation (launch floor is 13+) | product | managed *activation*, not the S5 build |
| §13.6 | Evidence-gate metric + bar (S2 → S3) | product | S3 |
| §13.7 | Assertiveness dial — mentor proposal tone + who moves it (recommendation on the table: calm default, two-position conversational dial, never age-inferred) | product (Zuzana) | S1 copy templates only (not the S1 build) |

---

## How to use this set

1. **Start with `02-flow-map.md` + `S0`** — use the flow map as the coverage denominator, then build the smallest dark foundation. Every phase plan should cite the exact flow IDs it preserves, re-homes, replaces, or retires.
2. **Stop at the evidence gate.** Do not author-execute S3+ until S1+S2's measured discovery result clears §13.6.
3. **S4–S6 wait on the identity runway** — track `WI-530` → Phase P → baseline reset → W1/W2 before scheduling them.
4. Each plan's `done when:` lines are the executable contract; the `## Scope` "out of scope" lists are the guardrails against scope bleed between phases.
