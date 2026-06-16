# Mentor-Is-The-App (V2 shell) — Implementation Plan Set

**Date:** 2026-06-10 · **Status:** draft (8 phase plans + 2 references) · synced to the 2026-06-10 spec amendment and the 2026-06-13 no-surprises proposal fold-in
**Spec:** [`docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`](../../specs/2026-06-09-mentor-is-the-app-shell-redesign.md) (incl. Annexes B/C/D — the adversarial + end-user review amendments **and** the 2026-06-10 cold-start/motivation/interaction-law fold-in: §2 P5/P6/P7, §2.1 noticing loop, §3.1 learner cold-start, §3.2 supporter cold-start, §4.2 cross-scope pointer, §13.7 assertiveness dial, §15.14–19, Annex D — plus the 2026-06-13 no-surprises fold-in: post-auth handoff, V2 homework round-trip, first-session wrap-up, and the 2026-06-14 no-cohort ruling below)
**Planner:** `.claude/skills/writing-plans/SKILL.md`

This folder decomposes the mentor-is-the-app shell redesign into **per-phase implementation plans** (spec §11 requires one plan per strangle phase before build). It is a *strangle, not a rewrite*: every phase ships behind `MODE_NAV_V2_ENABLED` alongside the existing V0/V1 nav, and no currently shipped flag state may regress until the §13.1 retirement ruling (see S6): production V0-on/V1-off mode shells, the flags-off legacy 5-tab fallback, and V1 preview/staging.

> These are **plans, not code.** S0 backend primitives have since landed in code; the user-facing V2 surfaces below do not exist yet. The plans are forward-compatible with autonomous execution (numbered `T<n>` tasks, checkboxes, `done when:` verification), grounded in verified `file:line` anchors.

> **Verified audit amendments (2026-06-13, amended 2026-06-14).** These notes override stale text below where they conflict: S0's source of truth is the landed code + `MMT-ADR-0022`, not the draft S0 plan; `cards` means max 3 (`cards[0..2]`), not four slots; and ledger ownership is decided by WI-678 (landed 2026-06-12, `287e99c9b`): the identity-foundation cutover's M-REPOINT owns the existing `mentor_activity_ledger.profile_id` FK re-point to `person(id)` and does **not** rename the column; S4 owns only the later additive nullable `edge_id` FK to `supportership(id)`. Any stale ADR/architecture/schema-comment lines that still say S4 owns the re-point are doc drift outside this plan.
>
> **No-cohort product ruling (2026-06-14).** There will be no S2/S3 observed-cohort evidence data before S4. The former S2->S3 evidence gate is removed as an execution blocker for S3/S4/S5. S4/S5 are still blocked on the identity-foundation flip + convergence and their own acceptance criteria. S6 remains deferred/irreversible and requires explicit human confirmation plus its non-cohort gates (P3 eval coverage, replacement parity, and the §13.1 V0/V1-retirement ruling).

---

## The plan set

| File | Phase | Profile | Identity-coupled? | Gate | One-line goal |
|---|---|---|---|---|---|
| [`01-codebase-anchors.md`](01-codebase-anchors.md) | — | reference | — | — | The current-code anchor map (file:line) every plan cites; V2 flag-wiring recipe; shared-component inventory; screen-collapse ledger |
| [`02-flow-map.md`](02-flow-map.md) | — | reference | — | — | The mobile-flow trigger map: who/when/why/how each current inventory row is preserved, re-homed, replaced, or retired by V2 |
| [`2026-06-10-s0-backend-primitives.md`](2026-06-10-s0-backend-primitives.md) | **S0** | code | No | **Done in code** | `mentor_activity_ledger` (`profileId`-keyed) + `writeActivityMoment()` + deterministic no-LLM `GET /now` (reads `retention_cards` as-is) |
| [`2026-06-10-s0r-retention-gate.md`](2026-06-10-s0r-retention-gate.md) | **S0-R** | change | No | parallel; must NOT block S1/S2 | `applyRetentionUpdate()` core-SRS chokepoint over 10 writers / 7 files; behavior-preserving; break-tests + rollback |
| [`2026-06-10-s1-mentor-home.md`](2026-06-10-s1-mentor-home.md) | **S1** | ui | No | — | New Mentor home (≤3 card feed + overflow + ever-present bar + camera + Homework chip) behind the V2 flag as "screen #89" |
| [`2026-06-10-s2-subject-hub.md`](2026-06-10-s2-subject-hub.md) | **S2** | ui | No | — | One Subject hub (shelf + progress merge; Next-up + chapter sections + topic sheet; subject-scoped notes); also linkable from current nav |
| — | **NO-COHORT RULING** | — | — | **Recorded 2026-06-14** | The former S2->S3 observed-cohort evidence gate is removed as an execution blocker; continuing is an explicit product-risk choice, not a measured pass |
| [`2026-06-10-s3-journal-and-avatar.md`](2026-06-10-s3-journal-and-avatar.md) | **S3** | ui | No | product-risk waiver; no observed-cohort blocker | Journal tab (recaps + browsable cross-subject archive + mentor memory, Me-scope) + avatar admin sheet + **park-and-return P3 evals** |
| [`2026-06-10-s4-scope-chip-support-hub.md`](2026-06-10-s4-scope-chip-support-hub.md) | **S4** | code | **Yes** | post-IF-flip + convergence | Scope chip, Support hub with scope-preserving Mentor/Subjects/Journal variants, person scopes, server-enforced structural mask; consumes M-REPOINT's already-complete `profile_id` FK re-point and owns only additive `edge_id`; mode/proxy/tab-matrix retire |
| [`2026-06-10-s5-visibility-contract.md`](2026-06-10-s5-visibility-contract.md) | **S5** | code | **Yes** | post-IF-flip + convergence + S4 | The trust layer: linking ceremony, sealed non-reportable class, render-equivalence, appeal affordance, managed/credentialized tiers, graduation, kid-initiated revocation |
| [`2026-06-10-s6-cutover-deletions.md`](2026-06-10-s6-cutover-deletions.md) | **S6** | change | — | gated on S3 evals + replacement parity + §13.1 ruling + explicit human confirmation | Cutover & deletions; exit funnel dissolves; old tabs retire; V0-constraint retirement ruling executed; the ~25-screen end state |

---

## Three execution tiers

**Tier 1 — buildable now (identity-independent, today's `profiles` model):** `S0-R`, `S1`, `S2` (with `S0` already present in code).
These are the validation bet. They cite no `person`/`edge`/`membership` table; the §9 contract guarantees it (if any deliverable is found to need an edge read, it is misclassified → moves to S4). S0 is the foundation and is already available; S0-R runs in parallel off the critical path; S1+S2 are the cheapest test of the whole direction.

**Tier 2 — identity-independent, product-risk-waived:** `S3`.
The original plan gated S3 on observed-cohort evidence from S1/S2. Product ruled on 2026-06-14 that no such evidence data will exist, so that gate is removed rather than treated as passed. S3 proceeds as a product-risk choice and produces the **park-and-return eval coverage** that S6's exit-funnel deletion is contractually blocked on.

**Tier 3 — identity-blocked (cannot start until the identity cutover flips):** `S4`, `S5`, then `S6`.
These consume the person/edge model (`docs/canon/identity/`). The W1/W2 schema now **exists as committed migrations** (merged via `main`) but is **not live until the IF flip** (the identity-foundation cutover + convergence). They are written as real implementation plans, each opening with a hard **"## Blocked-by"** section. The blocker chain is **`WI-530` (Harness-Hygiene gate) → identity Phase P → baseline reset (`MMT-ADR-0012`) → W1 (schema) → W2 (consent/proxy/deletion) → IF flip + convergence**. S4/S5 gate on the **flip**, not merely on the migrations existing. Ledger ownership is decided: S4 must not author/schedule/generate the existing `profile_id` FK re-point, because M-REPOINT owns it and the column name remains `profile_id`; S4 adds only the separate post-cutover `edge_id` column. No code in S4/S5 may stub `person`/`edge` against today's `profiles`/`family_links`.

---

## Dependency graph & critical path

```
S0 (ledger + /now) ───────────────┬─► S1 (Mentor home) ──┐
   │                              ├─► S2 (Subject hub) ───┴─► [NO-COHORT PRODUCT RULING] ─► S3 (Journal + P3 evals)
S0-R (retention gate, parallel) ──┘                                                               │
                                                                                                  ▼
   identity: WI-530 ─► Phase P ─► baseline reset ─► W1 (schema) ─► W2 (consent/proxy) ─► IF flip + convergence ──┐
                                                                                                                       ├─► S4 (chip/mask) ─► S5 (trust) ─► S6 (cutover)
                                                                                                                   ▲
                                                              S3 park-and-return evals ───────────────────────────┘ (gates S6 exit-funnel deletion)
```

- **Build-now critical path:** `S1/S2`, because S0 is already built. S0-R is parallel and explicitly sequenced *not* to block (the feed reads `retention_cards` as-is until the gate hardens it).
- **Identity critical path** (the long pole for S4–S6): the identity-foundation runway, which is itself blocked on `WI-530`. S4/S5 inherit that timeline; the mentor work neither blocks it nor is blocked by it for S0–S3 (spec §9).
- **S6** needs all three: S3 eval coverage exists · replacement parity is live · §13.1 V0-retirement ruling made by product, plus the explicit irreversible-execution confirmation below.
- ⛔ **S6 is DEFERRED and IRREVERSIBLE — requires explicit human confirmation.** Through S5, reverting to V1/V0 is a build-time flag flip (or OTA). S6 *deletes* the V0/V1 shells (`legacy-navigation-contract.ts` + flag plumbing), so **after S6 there is no flag-flip way back to V1 or V0**. No agent may start S6 autonomously; before any destructive step an agent must obtain explicit human confirmation and must state that S6 means there is no way back to V1/V0 (rollback = git revert). See the S6 plan's confirmation protocol.

---

## Frozen shared contracts (source of truth = landed S0 code + `MMT-ADR-0022`; the S0 plan is historical unless updated)

Every downstream plan cites these verbatim — do not introduce parallel names.

- **Feature flag:** `MODE_NAV_V2_ENABLED` ← env `EXPO_PUBLIC_ENABLE_MODE_NAV_V2`. Read in `feature-flags.ts` (after the V0/V1 lines); dev/preview + CI-OTA only, **not** production. (A second flag, `MANAGED_TIER_ACTIVE` ← `EXPO_PUBLIC_ENABLE_MANAGED_TIER`, is introduced by **S5** to gate managed-tier activation per §13.5 — default OFF.)
- **Mount seam:** an additive branch in `useNavigationShellContract` (`use-navigation-contract.ts:142`). **`resolveNavigationContract` and `legacy-navigation-contract.ts` are pinned no-edit** — that is what guarantees §7 V0/V1 no-regress.
- **Ledger:** table `mentor_activity_ledger` (`profileId`-keyed at S0; created by `apps/api/drizzle/0111_zippy_gateway.sql`; RLS enabled by `apps/api/drizzle/0112_rls_mentor_activity_ledger.sql`; writer `writeActivityMoment()` and `markMomentSurfaced()` in `apps/api/src/services/activity-ledger.ts`). Post-IF ownership is decided by WI-678: M-REPOINT re-points the existing `profile_id` FK to `person(id)` without renaming the column; S4 must treat that as assumed-complete after the flip and must only add the separate nullable `edge_id` FK to `supportership(id)`. `LedgerKind` = `session_filed | topic_mastered | retention_due | needs_deepening_added | recap_ready | snapshot_ready` (**S5 additively extends this with `graduation`** — see coordination note 2).
- **Feed:** `GET /now?scope=self` → `{ scope, cards, overflowCount, generatedAt }` where `cards: NowCard[]` is max 3 (`packages/schemas/src/now-feed.ts`). Overflow via `GET /now/overflow`. `NowCard.kind` = `unfinished_session | retention_due | parked_item | needs_deepening | challenge_ready | ledger_moment`. `deepLink` = `{ route, params, chain }` resolved through the **closed route catalog** (keys in landed S0 code: `session.resume`, `subject.hub`, `subject.topic`, `retention.review`, `challenge.start`). Backend service `buildNowFeed()/buildNowOverflow()` plus exported pure `rankCandidates()`; mobile hooks `useNowFeed()/useNowOverflow()` must profile-scope their query keys. P3 backstop windows: `PARKED_AGING_WINDOW_DAYS = 7`, `DEEPENING_SURFACE_LEAD_DAYS = 2` (aged `needs_deepening` outranks aged `parked_item` in the shared P1.5 band; `needs_deepening` reconciles with the existing `pendingExpiresAt`, no competing clock).

---

## ADR obligations (spec §12 — owed in lockstep with the canon change BEFORE the phase merges)

Latest ADRs on disk: `MMT-ADR-0021` (freeform filing threshold) and `MMT-ADR-0022` (activity ledger narration substrate). This set reserves the next three for the remaining plan obligations (the `decision-adr-link` CI guard fails a spec decision block with no linked ADR):

| ADR | Subject | Spec obligation | Owned by | Status |
|---|---|---|---|---|
| `MMT-ADR-0021` | Freeform filing threshold (5 exchanges; no freeform Challenge or notes) | — | S0 adjacent | **Exists** (`docs/adr/MMT-ADR-0021-freeform-library-filing-threshold.md`) |
| `MMT-ADR-0022` | Activity ledger as narration/moments substrate (template-first; load-bearing for GDPR timers) | #4 | S0 (T10) | **Exists** (`docs/adr/MMT-ADR-0022-activity-ledger-narration-substrate.md`) |
| `MMT-ADR-0023` | One-shell / scope-chip model supersedes the mode/proxy/tab-shape matrix | #1 | S4 (T13) | Planned |
| `MMT-ADR-0024` | Supporter visibility contract (non-reportable class, render-equivalence, appeal, artifact wall, safety exception) | #2 | S5 (T12) | Planned |
| `MMT-ADR-0025` | Managed/credentialized as visibility-tier carrier + graduation (reconcile with identity canon, don't duplicate) | #3 | S5 (T12) | Planned |

*(Renumber history: 0020/0021 were the original branch allocations; renumbered to 0021/0022 on 2026-06-12 when merging new-llm → the collision with main's `MMT-ADR-0019` (OS-agnostic) resolved and 0020 yielded to the identity-foundation cutover-plan consent-request ADR. Downstream planned ADRs shift: scope-chip 0021→0023, supporter-visibility 0022→0024, managed-tier 0023→0025.)*

---

## Cross-plan coordination notes (resolve at build, not blockers)

1. **`/now` pure ranker seam (S0 ↔ S3).** S0's `buildNowFeed(db, profileId, scope)` reads the DB; S3's deterministic P3 eval (`eval-llm/flows/park-and-return-ranking.ts`) must drive the *pure* ranking over hand-built candidate sets. S0's T6 unit test already exercises the ranker with hand-built candidates — so S0 should expose the pure `rankCandidates()` separate from the DB-reading `buildNowFeed()`. S3 names a thin-seam fallback if S0 hasn't split it.
2. **`graduation` LedgerKind (S0 ↔ S5).** S5's `graduation-narration.ts` writes `writeActivityMoment({ kind: 'graduation', visibility: 'both', … })`; S0's `ledgerKindSchema` does not include `graduation`. S5 **additively extends** the enum — expected, not a conflict.
3. **S2 Next-up source.** S2 reads `useLearningResumeTarget` (the resume-target read) for the Next-up block rather than `useNowFeed`. This is the spec §5.1 "same source as the `/now` card" — S2 renders the same continuation source without re-ranking; it does not fork `/now`.
4. **S2 hub reuse by S4.** The `<SubjectHub>` component is built *permission-mask-ready* (data-driven, no `isOwner`/`role`/persona read; a grep-guard test enforces it). S4 reuses the same component server-masked to structural columns for supporter person-scopes — a pure data-shape change, no client ownership branch. The Support hub's own Subjects tab is separate: cross-person rows grouped by child/person, with explicit deep links into the person-scope `<SubjectHub>`.
5. **S4 reconciliation gaps vs the identity canon** (recorded as S4 OPEN ITEMs with defaults, flagged to the identity-foundation owner — not invented silently):
   - `edgeId` has no canon column (canon has separate `supportership.id`/`guardianship.id`, no polymorphic edge). **Ruled (WI-678):** `edge_id` is a nullable FK to `supportership.id`, added by **S4's own additive migration** (NOT M-REPOINT — M-REPOINT only re-points the existing `profile_id` FK and adds no columns); the typed `edge_id` + `edge_kind` discriminator alternative was considered and not adopted.
   - Whether a managed charge's *guardian* also gets a chip scope (vs supportership-derived scopes only) — deferred to S5; S4 surfaces supportership-derived scopes only (launch tier = credentialized).
6. **§4.2 cross-scope pointer module (S4 ↔ S1).** S4 emits a single compact "1 thing needs you in the Support hub" pointer card into the **Me-scope** feed that S1 renders — it *points* into the hub, never *duplicates* a family-attention item (the hub/Me separation holds while the dual-role adult's signal can't be starved). It rides under the standard P6 ≤3 budget on the S1 home; S1 renders whatever `/now?scope=self` returns, so the pointer is a server-emitted `NowCard`, not a new S1 component.
7. **Earned motivation spans S0-R + S1/S2/S3/S6 (spec §2.1 / §2.2 / §15.17).** The original plan said XP was "killed, not wired"; the 2026-06-13 product amendment supersedes that. XP/practice points, the 1.5x reflection bonus, quiz scores/personal bests, mastery counts, weekly deltas, and forgiving rhythm/momentum are retained as **earned private learning receipts**. What dies is coercive presentation: leaderboards, guilt/loss streaks, random reward schedules, public comparison, and rewards as the main Mentor-feed object. Consequences the plans honor: (a) S0-R may decouple reward bookkeeping from fragile retention side effects, but it must not delete XP/reward persistence; (b) S1 renders compact reward receipts and light-practice discovery without turning the feed into a scoreboard; (c) S2/S3 preserve browsable structure, concrete progress, and reward history in Subject/Journal contexts; (d) S6 may delete legacy reward-hosting screens only after the V2 heirs preserve the learning value: learner-written reflection + bonus, quiz rewards, and quantified progress.
8. **No-surprises dossier proposals are now canonical (2026-06-13; evidence gate superseded 2026-06-14).** The three script-breaking prototype frames are no longer free-floating: post-auth/consent handoff (S1), V2 homework camera round-trip (S1), and first-session wrap-up (S1/S6) are spec requirements and S1/S6 acceptance criteria. The original observed-cohort evidence gate is now superseded by the 2026-06-14 no-cohort product ruling: lack of cohort data does not block S3/S4/S5 execution, but it also does not authorize S6 deletions.
9. **V2 mentor app-understanding must be testable PRE-S6 (enabler slice — do-now, no-regress).** The V2 mentor's "tool use + understanding of the app" is three closed, server-owned surfaces, and two of them are **already testable today, shell-agnostic**: (a) the **envelope signal vocabulary** (`packages/schemas/src/llm-envelope.ts`, parsed by `parseEnvelope()` — deterministic tests + the `emitsEnvelope` eval metric); (b) the **closed route catalog / `/now` deep links** (`now-feed.ts` `ROUTE_CATALOG`, `now-feed.test.ts`) — its keys (`session.resume`, `subject.hub`, `subject.topic`, `retention.review`, `challenge.start`) are content destinations that resolve in *either* shell, so **no V2 extension is needed** (the closed `nowDeepLinkRouteSchema` enum is already complete). The S1 **local bar intent-matcher** (`bar-intent-match.ts`, §2 P5) is deterministic/zero-LLM and tested without the LLM. The only surface that is V0-specific is (c) **`apps/api/src/services/app-help-map.ts`** — the mentor's app-navigation answers, served whenever `isAppHelpQuery()` is true (`exchanges.ts:1334`), not flag-aware, today emitting V0 labels (`Home > My Notes > Notes`, `More > Profile`, `Library > …`, `Open Progress`). To test V2 mentor app-understanding before the irreversible S6 cutover **without regressing prod V0**, build this bounded enabler slice (Tier-1, identity-independent, additive):
   - **API:** add `APP_HELP_MAP_V2` (Mentor/Subjects/Journal/avatar-sheet destinations) alongside the V0 map; parametrize `buildAppHelpPromptBlock(shell)` and `buildAppHelpDirectReply(text, shell)` to select by shell, **defaulting to V0** so every existing caller (and prod) is byte-identical.
   - **Exchange wiring:** thread the requesting client's shell into the two `exchanges.ts` app-help call sites (1334, 1486) so a V2 client gets V2 answers. For headless/eval testing this defaults are enough; for on-device QA add an optional `navShell` field to the exchange request schema and have mobile send `MODE_NAV_V2_ENABLED ? 'v2' : 'v0'` (one send-site).
   - **Eval + unit:** add an `app-help-v2` eval flow (Tier-1 snapshot + `pnpm eval:llm --live` Tier-2 schema-validated) asserting V2 routing (notes/sessions/bookmarks/memory → Journal; subjects/books/topics → Subjects; account/billing/security/language/privacy/notifications/add-child → avatar sheet; getting-started → Mentor cold-start); add V2-label cases to `app-help-map.test.ts` against the current `en.json`. **This is what makes "test V2 mentor logic before S6" real** — runnable via `pnpm eval:llm --live` (and on a dev/preview V2 build once mobile sends the shell). At S6, **T13 deletes the V0 variant + selector**, leaving the (already-validated) V2 map as the sole map. Owner/placement TBD — a focused API+eval plan, not an edit to the delivered S0/S1 plans.

---

## Open decisions (spec §13 — block the affected phase, not the set)

| # | Decision | Owner | Blocks |
|---|---|---|---|
| §13.1 | V0-preservation-constraint retirement threshold | product (Zuzana) | S6 |
| §13.2 | Identity-foundation sequencing confirmation (runway tolerates this consumer) | product / identity | S4 |
| §13.3 | Managed-tier reporting richness over credentialized | product | S5 build detail |
| §13.4 | "Journal" vs "Notebook" name — kid-tested **with** the trust copy | product | S3 (name only) |
| §13.5 | Managed-tier launch activation (launch floor is 13+) | product | managed *activation*, not the S5 build |
| §13.6 | Observed-cohort evidence-gate pass/fail (S2 → S3) | product | **Superseded 2026-06-14** — no cohort data will exist; no longer blocks S3/S4/S5 |
| §13.7 | Assertiveness dial — mentor proposal tone + who moves it (recommendation on the table: calm default, two-position conversational dial, never age-inferred) | product (Zuzana) | S1 copy templates only (not the S1 build) |

---

## How to use this set

1. **Start with `02-flow-map.md` + `S1/S2`** — use the flow map as the coverage denominator; S0 is already built, so do not duplicate it. Every phase plan should cite the exact flow IDs it preserves, re-homes, replaces, or retires.
2. **Do not wait for observed-cohort evidence.** Product ruled on 2026-06-14 that no S2/S3 cohort evidence data will exist; treat the old evidence gate as removed, not passed.
3. **S4–S6 wait on the identity cutover flip** — track `WI-530` → Phase P → baseline reset → W1/W2 → **IF flip + convergence** before scheduling S4/S5 (the W1/W2 migrations exist in code, but S4/S5 gate on the flip making them live).
4. Each plan's `done when:` lines are the executable contract; the `## Scope` "out of scope" lists are the guardrails against scope bleed between phases.
