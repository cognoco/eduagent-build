---
title: S6 — Cutover & Deletions (exit funnel dissolves · old tabs retire · V0 constraint retirement executed) — Implementation Plan
date: 2026-06-10
profile: change
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: deferred
---

# S6 — Cutover & Deletions — Implementation Plan

> **STATUS (2026-06-27):** TODO — not started. All deletion targets still present (`more/`, `library.tsx`, `ModeSwitcher`, `legacy-navigation-contract.ts`, `child/` proxy routes). Gate (a) P3 park-and-return evals — MET via S3. Gate (b) §13.1 V0-retirement product ruling — NOT made (owner decision pending). Gate (c) S1–S4 heir completeness — BLOCKED on S4 missing cold-start/co-learning surfaces and S5 missing linking-ceremony screens. Requires explicit human confirmation before any destructive step.

> **ADR governance correction (2026-06-30, WI-752):** S6 remains deferred and contradiction-checked against corrected canon. `MMT-ADR-0024` is still Proposed, so any deletion that depends on the scope-chip model requires that ADR to be accepted and promoted first; the existing destructive gates and explicit human irreversibility confirmation still apply. S5 visibility/tier ADRs (`MMT-ADR-0027`/`0028`) stand as amended Architecture decisions, but their missing mobile screens and break-tests still block heir parity.

> ## ⛔ DEFERRED — DO NOT EXECUTE WITHOUT EXPLICIT HUMAN CONFIRMATION
>
> **S6 is the irreversible phase. It is DEFERRED and must never be started by an agent autonomously.**
>
> Up to and including S5, reverting the shell to V1 or V0 is a **build-time flag flip** (`EXPO_PUBLIC_ENABLE_MODE_NAV_V2` off / V1 on), shippable even as an **OTA (~5 min)** — because the V0/V1 code paths (`legacy-navigation-contract.ts`, the V0/V1 flag plumbing, the flags-off short-circuits) are deliberately kept alive.
>
> **S6 DELETES those paths** and flips V2 to the production default. **Once S6 runs there is NO flag-flip way back to V1 or V0** — rollback becomes a git-revert of the deletions plus a rebuild. (And the identity data cutover under S4/S5 is separately not reversible by flag at all.)
>
> **Confirmation protocol (MANDATORY).** Before executing ANY destructive step in this plan, an agent MUST stop and obtain explicit human confirmation. When asking, the agent MUST state plainly, in these terms:
> > *"S6 deletes the V0 and V1 navigation shells. After this there is no way back to V1 or V0 by flag — rollback would require a git revert and rebuild. Confirm you want to proceed irreversibly."*
>
> Proceed only on an unambiguous human "yes" that acknowledges the irreversibility. **This human confirmation is in addition to gates (a)–(d) below; gates being green does NOT substitute for it.**

> Synced to spec amendment 2026-06-10 (§2.1/§15.17 motivation end-state, §3.1/§3.2 cold-start in end state) and amended 2026-06-13 for lost-flow preservation before deletion.

**Goal:** Realize the ~90 → ~25-screen end state by *deleting* the strangled legacy surfaces that S1–S5 have already replaced behind `MODE_NAV_V2_ENABLED` — the 3-screen session exit funnel, the ModeSwitcher + proxy mode + tab-shape matrix, `ParentHomeScreen` as a special shell, the More tab + You-tab hodgepodge, the Library *tab*, and the `child/[profileId]/*` proxy routes — and, **only after the §13.1 product ruling**, retire the `MODE_NAV_V0_ENABLED` no-regress constraint (flip V2 to the production default, remove the V0/V1 flag plumbing + `legacy-navigation-contract.ts` + the flags-off short-circuits), leaving zero orphaned types/keys/imports/branches by grep.

**Approach:** Replacement-live-before-delete, one dying surface per task. Each task asserts the V2 heir is live and replacement-parity checked (S1–S5 flag-shipped; no observed-cohort evidence gate exists after the 2026-06-14 product ruling) *before* removing the legacy code, runs the existing test suites green on both sides of the deletion (legacy tests deleted with their subjects, V2 tests stay green), and finishes with a project-wide grep proving no orphaned artifact survives (the repo "Clean up ALL artifacts" rule: types, imports, constants, SecureStore keys, commented-out JSX, fallback branches, i18n keys, e2e flows). Destructive steps carry a `## Rollback` posture. **No new surface is built here** — S1–S5 own every heir; S6 only deletes and flips the default.

## Gates / Blocked-by

This plan is GATED. **No destructive deletion may start until gates (a), (b), and (c) below are green, and the mandatory human confirmation above has been obtained.** Before gate (b), an executor may only do V2-only de-linking that leaves V0/V1 files, routes, contracts, tests, and behavior byte-identical. The prior "heir-backed deletions before V0 retirement" framing was unsafe because many T1-T8 subjects are still reachable from protected V0/V1 flag states.

- **Gate (a) — P3 park-and-return eval coverage EXISTS (the exit-funnel gate, spec §2/§7/§11).** The exit funnel (`session-summary/[sessionId].tsx`, the 3-screen reflection→summary→filing funnel) may NOT dissolve into the mentor wrap-up turn until park-and-return scenarios are in the eval harness (`pnpm eval:llm`). **Verification:** `apps/api/eval-llm/flows/park-and-return-ranking.ts` exists and is registered in `apps/api/eval-llm/index.ts`, includes the spec §2 P3 assertion — *a parked item surfaces within its window even while higher-priority cards compete for the ≤3 feed slots* (the EU-3 competition assertion) — and `park-and-return-reweave.ts` exists for conversation-layer prose coverage. **As of 2026-06-10 these flows did NOT exist** (verified then: `apps/api/eval-llm/flows/` had no `park-and-return*`; the closest were `session-summary.ts` / `session-recap.ts`). This is an **S3 deliverable** (spec §11 S3 row: "park-and-return eval scenarios into `pnpm eval:llm`"). **Gate (a) blocks T1 (exit-funnel dissolution) specifically.**

- **No observed-cohort gate (removed 2026-06-14).** The former S2->S3 evidence gate is not a blocker for S6 because product ruled that no S2/S3 observed-cohort evidence data will exist. Do not require or invent a PASS record. This removal does **not** weaken the remaining S6 gates: S6 is still irreversible and still requires explicit human confirmation, P3 eval coverage, replacement parity, and the V0/V1-retirement ruling.

- **Gate (b) — §13.1 V0-preservation-constraint retirement ruling MADE by product (owner: Zuzana).** S6 **executes** this ruling; it does not pre-empt it. Until product rules on *which S6 threshold* retires the `MODE_NAV_V0_ENABLED` no-regress constraint (spec §13.1, blocks S6), the **HARD CONSTRAINT holds: all protected legacy flag states must not regress** — the flags-off legacy shell, the current production V0-on/V1-off mode shells, and V1 preview/staging. **Verification:** a recorded product ruling (ADR or decision log) authorizing V0/V1 retirement at the met threshold, explicitly acknowledging that observed-cohort evidence is unavailable and not part of the threshold. **Gate (b) blocks every destructive deletion of a file, route, contract branch, or test used by V0/V1.** T1–T8 may proceed before this only if rewritten as V2-only de-linking that leaves V0/V1 paths byte-identical; actual deletion waits for gate (b).

- **Gate (c) — Lost V1 learning/retention flows have V2 heirs LIVE (amended 2026-06-13).** S6 must not delete a legacy host merely because the shell is cleaner. The V2 heirs must preserve the learning/retention value before deletion:
  1. **Reflection-for-bonus:** the mentor wrap-up turn asks the learner to write what they learned in their own words, files that learner-authored text as the mentor-memory/session signal, and applies the 1.5x reflection bonus (or its earned-reward equivalent) visibly as a private receipt.
  2. **Standalone quiz games:** Capitals and Guess Who remain reachable from a V2 light-practice affordance / route catalog path.
  3. **Supporter/adult self-learning:** Support hub carries a persistent positive "learn something yourself" doorway, and Me becomes a first-class scope after the supporter's first real learner state.
  4. **Self-directed browse:** the S2 Subjects tab and S3 Journal archive are browse-first escape hatches ("show me everything"), not search-only or feed-only.
  5. **Concrete progress numbers:** S2/S3/S1 surfaces show compact real progress/receipt numbers (mastered/learning/total, due reviews, weekly deltas, practice points/XP receipts, quiz personal bests) without restoring a full stats wall.
  **Verification:** S1 T20/T21, S2 T2/T12, S3 T4/T5/T8, S4 T17, and the V2 wrap-up/reflection test are green. **Gate (c) blocks T1, T5, T6, and any reward/progress-reader deletion; if any heir is missing, the deletion is blocked.**

**Gate sequencing summary:**

| Gate | Blocks | Cleared when |
|---|---|---|
| (a) P3 eval coverage | T1 only | `eval-llm/flows/park-and-return-ranking.ts` registered + EU-3 competition assertion present; re-weave flow registered for prose coverage |
| (b) §13.1 V0-retirement ruling | every destructive deletion of V0/V1-reachable files/routes/contracts/tests; T1-T8 may only do V2-only de-linking before this | product ruling authorizing V0/V1 + legacy-contract retirement, explicitly not relying on observed-cohort evidence |
| (c) lost-flow heirs live | T1/T5/T6/reward-progression reader deletions | reflection bonus wrap-up + quiz discovery + adult self-learning + browse-first + concrete progress receipts all green |

---

## Replacement-live precondition (applies to every deletion task)

Before deleting any legacy surface, its V2 heir must be **live and replacement-parity checked** — shipped in the S1–S5 plans behind `MODE_NAV_V2_ENABLED`, on dev+preview+staging-OTA, and verified by its named tests/checks. There is no longer an S2->S3 observed-cohort evidence gate. The heir map (from the spec §7 "what dies" list + `01-codebase-anchors.md` §4 screen-collapse inventory):

| Dying surface (legacy) | V2 heir (must be live first) | Owning phase |
|---|---|---|
| `session-summary/[sessionId].tsx` exit funnel | Mentor wrap-up conversation turn (S1 T24 in `session/index.tsx`, plus S3 eval coverage) that asks for learner-written "Your Words", files it, and awards the 1.5x reflection bonus receipt | S1 T24 + S3 evals |
| `ModeSwitcher.tsx` + `app-context.tsx` mode + proxy mode | Scope chip + person scopes | S4 |
| tab-shape matrix (`navigation-contract.ts` + `legacy-navigation-contract.ts`) | One V2 three-tab shell (Mentor/Subjects/Journal) | S1–S4 |
| `ParentHomeScreen.tsx` special shell | Support-hub Mentor feed + persistent adult self-learning doorway | S4/S5 |
| `more/*` tab + `my-notes/*` You-tab hodgepodge | Avatar admin sheet (S3) + Journal tab (S3) | S3 |
| `library.tsx` Library **tab** | S2 Subjects list (structure browse / "show me everything") + S3 Journal archive (cross-subject saved-items browse, EU-6) — browse survives; tab dies | S2 + S3 |
| `child/[profileId]/*` proxy routes | Chip person-scopes (structural rendering mask) | S4/S5 |

**If any heir is not live, its deletion task is BLOCKED — do not delete ahead of the heir.** This is the inverse of the gate: gates authorize the *phase*; the heir-live precondition authorizes each *task*.

---

## Verified audit amendments (2026-06-13)

These amendments are source-verified and override stale deletion criteria below.

1. **Group A cannot delete V0/V1-live code before gate (c).** `ModeSwitcher`, proxy mode, `ParentHomeScreen`, More/Library/child routes, and V1 tab-shape branches are still read when V2 is off. Move actual deletions in T2-T8 behind gate (c), or rewrite them as V2-only de-linking that leaves every V0/V1 file/route/contract/test alive and unchanged.
2. **T8 is not dead-code removal before flag retirement.** `resolveNavigationContract()` and `useNavigationShellContract()` still consume V1 tab sets. Merge T8 into the post-gate contract-retirement work (T10), or make any pre-gate T8 a test-only assertion that V2 short-circuits before legacy logic with no deletion from `navigation-contract.ts`.
3. **T1 grep must distinguish screen routes from server-summary plumbing.** `useSubmitSummary`, `useSkipSummary`, `useRecallBridge`, query keys, and API services may remain if the V2 wrap-up uses them. Screen-route grep should target route/navigation tokens (`pathname:.*session-summary`, `router.(push|replace).*session-summary`, `app/session-summary`, `SessionSummaryScreen`, `session-summary-derived`); server filing hooks/query keys require an explicit allowlist in the PR body.
4. **T5/T6 route sweeps must catch real inbound routes.** Sweep `/(app)/more`, `/more`, `/(app)/recaps`, `/recaps`, `/(app)/my-notes`, `/my-notes`, `/(app)/library`, `/library`, plus `pathname:` object routes, `goBackOrReplace`, `homeHrefForReturnTo`, pending-auth redirect helpers, and tests.
5. **T7 child-route inventory must use the actual route tree.** Include `apps/mobile/src/app/(app)/child/[profileId]/{index,reports,curriculum,mentor-memory,_layout}.{tsx,test.tsx}` plus nested `report/[reportId]`, `session/[sessionId]`, `subjects/[subjectId]`, `topic/[topicId]`, and `weekly-report/[weeklyReportId]`.
6. **Operational anchors.** E2E flows live under `apps/mobile/e2e/flows/...`; current nav OTA env lines are around `.github/workflows/ci.yml:397-398`; current `<ModeSwitcher />` mount is around `_layout.tsx:614`. Refresh exact anchors at execution time.

## Scope

In scope (delete / refactor only — no new surface):
- `apps/mobile/src/app/session-summary/[sessionId].tsx` + `_view-models/session-summary-derived.ts` + co-located tests + the `MentorMemoryCue` / `SessionSummaryLibraryFilingControls` / `FilingFailedBanner` components if they have zero non-funnel consumers (T1)
- `apps/mobile/src/components/chrome/ModeSwitcher.tsx` + `ModeSwitcher.test.tsx`; `apps/mobile/src/lib/use-mode-switch.ts` + test (T2)
- `apps/mobile/src/lib/app-context.tsx` — `AppMode`/`mode`/`setMode`/`derivedMode`/`familyCapable` mode machinery + flags-off short-circuits (`:64,77,152`) (T2, T11)
- `apps/mobile/src/hooks/use-parent-proxy.ts` + test; proxy chrome (`ProxyBanner`, proxy color paths in `_layout.tsx:596-601,622-643`) (T3)
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` + `home.tsx:161-169` branch (T4)
- `apps/mobile/src/app/(app)/more/*` (index, account→avatar, privacy→avatar, notifications, accommodation, celebrations, help, security-sessions, _layout) (T5)
- `apps/mobile/src/app/(app)/my-notes/*`, `recaps/*`, `mentor-memory.tsx` legacy entries superseded by Journal (T5)
- `apps/mobile/src/app/(app)/progress/milestones.tsx` + `MilestoneCard` + the `useProgressMilestones` read hook — the **standalone achievement gallery screen**, superseded by `milestone_reached` moments (S0 producer + S3 Journal moments strip). Resolves the dossier-02 oddity #1 open keep/delete call. The milestone **data/table/detection are KEPT** (see out-of-scope below) — only the dedicated destination screen + its read hook die (T5)
- `apps/mobile/src/app/(app)/library.tsx` Library tab route (T6)
- `apps/mobile/src/app/(app)/child/[profileId]/*` (index, reports, report, curriculum, session, subjects, topic, mentor-memory, weekly-report, _layout) (T7)
- `apps/mobile/src/lib/navigation-contract.ts` tab-shape matrix (`STUDY_TABS`/`FAMILY_TABS`/`PROXY_TABS`/`LEGACY_GUARDIAN_TABS`, `home.screen` branch) (T8 partial, T10)
- `apps/mobile/src/lib/legacy-navigation-contract.ts` (whole file) (T10)
- `apps/mobile/src/lib/feature-flags.ts` — remove `MODE_NAV_V0_ENABLED`/`MODE_NAV_V1_ENABLED`; promote V2 to default (T9, T11)
- `apps/mobile/eas.json` (`:11-15` prod, `:21-26` dev, `:37-42` preview); `.github/workflows/ci.yml` OTA env (currently around `:397-398`) — flag plumbing (T9)
- `apps/api/src/config.ts` — `MODE_NAV_V2_ENABLED` env entry disposition (T9)
- All co-located `*.test.ts(x)` for deleted subjects; the nav-contract guard/property/totality/snapshot/acceptance/usage-guard tests (T10, T12); e2e flows that exercise V0/V1 shells (T12)
- `apps/mobile/src/i18n/locales/en.json` — orphaned tab/mode/proxy/parent i18n keys (every task's grep step)
- `apps/api/src/services/app-help-map.ts` + `app-help-map.test.ts` — REWRITE the server-owned app-navigation destination map (and its label-sync test) from V0/V1 labels (`Home > My Notes > Notes`, `More > Profile`, `Library > choose the subject`, `Open Progress`) to the V2 three-tab destinations (Mentor / Subjects / Journal), in lockstep with the T9 prod flip (T13). This is API-side prompt text, not a route or import, so the mobile-only orphan sweep (T12) does NOT catch it — it is tracked explicitly here.

Out of scope (must NOT change here):
- **Building any new surface** — Mentor feed (S1), Subject hub (S2), Journal + avatar (S3), scope chip + person scopes + structural mask (S4), visibility-contract surfaces (S5). S6 consumes them, never builds them.
- **The identity-foundation migration (S4)** — `profileId → personId` / add `edgeId` repoint, `person`/`edge`/`membership` tables. S6 deletes UI shells; it does not touch identity schema.
- **Backend** — `GET /now`, the activity ledger, the retention gate (S0/S0-R). The session-summary *server* endpoints (`useSubmitSummary`/`useSkipSummary` API routes) stay until S5 confirms the wrap-up turn fully absorbs filing; T1 deletes only the *screen*, and flags the server-route disposition as an explicit follow-up (T1 done-when).
- **Reward persistence + the "on track" rhythm badge** — S0-R may clean up hidden reward side effects, and S1 owns the calm rhythm badge plus compact reward receipts. S6 does not delete reward persistence. XP/practice points, the 1.5x reflection bonus, quiz scores/personal bests, mastery counts, weekly deltas, and rhythm/momentum survive as private earned learning receipts per the 2026-06-13 amendment.
- **Old-shell reward UI removal is re-home-before-delete, not a schema-drop trigger.** F-XP-1 (`session-summary/[sessionId].tsx` bonus-XP/reflection copy) may retire **only when** the V2 wrap-up turn asks for learner-written reflection and awards/displays the 1.5x receipt. F-XP-2 (`practice/` hub `totalXp` label) sits on a surface S6 **keeps** as a bar/feed target, so it must be reworded/re-homed as practice points or earned receipts, not silently removed. F-XP-3 (`quiz_rounds.pointsEarned`) remains part of quiz-game retention and must be discoverable through T21/S2 routes. Dropping `xp_ledger`, `GET /xp`, or `retention_cards.xpStatus` is **out of scope** for S6 and would require a future migration plan with an equivalent earned-reward contract already live.
- **Milestone data/detection is re-home-before-delete, not a schema drop** (same posture as reward persistence above). The `milestones` table, `detectMilestones`/`storeMilestones` (`services/milestone-detection.ts`), and the snapshot-aggregation producer **stay**. S6 deletes only the standalone *gallery screen* (`progress/milestones.tsx`) and its dedicated `useProgressMilestones` read hook, and **only when** the heir is live + measured: `milestone_reached` moments rendering in both the Mentor feed (S1) and the Journal moments strip (S3), fed by the S0 producer emit. Dropping the `milestones` table or the detection path is out of scope and would require a future migration plan with the moments heir already live.
- **Cold-start surfaces** — the learner cold-start card (§3.1) and supporter cold-start variants (§3.2) are part of the ~25-screen end state, built and shipped in S1 (learner) and S4 (supporter). They are not deleted here; they are counted in the end state S6 reaches.
- Session entries kept as bar/feed targets: `session/`, `homework/camera.tsx`, `dictation/`, `practice/`, `session-transcript/[sessionId].tsx`, `subject/[subjectId].tsx`, `pick-book/`.

---

## Surface map (files × responsibility of the change)

| File / dir | What S6 does to it | Task |
|---|---|---|
| `session-summary/[sessionId].tsx` (+ `_view-models/`, tests) | DELETE route + view-models; remove `session-summary` from route catalog/HIDDEN_TAB_ROUTES; redirect any inbound link to the wrap-up turn | T1 |
| `summary-draft.ts` (`KEY_PREFIX='summary-draft'`) | DELETE if only the funnel consumed it; sweep SecureStore key usage | T1 |
| `ModeSwitcher.tsx`, `use-mode-switch.ts` (+ tests) | Before gate (c): V2-only guard/suppression; after gate (c): DELETE and remove `<ModeSwitcher/>` mount (currently around `_layout.tsx:614`) | T2 |
| `app-context.tsx` | STRIP mode machinery to nothing (or DELETE provider if no consumer remains) | T2, T11 |
| `use-parent-proxy.ts`, `ProxyBanner`, proxy color branches | DELETE proxy mode + chrome | T3 |
| `ParentHomeScreen.tsx`; `home.tsx:161-169` | DELETE component; collapse home branch to the V2 Mentor feed only | T4 |
| `more/*` | DELETE tab routes (admin now behind avatar, S3) | T5 |
| `my-notes/*`, `recaps/*`, `mentor-memory.tsx` | DELETE legacy entries (Journal absorbs, S3) | T5 |
| `progress/milestones.tsx`, `MilestoneCard`, `useProgressMilestones` | DELETE the standalone gallery screen + its read hook; milestone **data/table/detection KEPT** — surfaces as `milestone_reached` moments (S0 + S3). Heir-live precondition: moments shipped + replacement-parity checked | T5 |
| `library.tsx` | DELETE Library tab route (structure browse survives in the S2 Subjects list; cross-subject saved-items browse in the S3 Journal archive, EU-6) | T6 |
| `child/[profileId]/*` | DELETE proxy routes (chip person-scopes, S4/S5) | T7 |
| `navigation-contract.ts` | DELETE tab-shape matrix + `home.screen` branch (V2 chip owns shape) | T8, T10 |
| `legacy-navigation-contract.ts` | DELETE whole file | T10 |
| `feature-flags.ts`, `eas.json`, `ci.yml`, `config.ts` | Remove V0/V1 flags; make V2 the production default | T9, T11 |
| nav-contract guard/property/totality/snapshot tests; V0/V1 e2e flows | DELETE tests of deleted behavior; keep/repoint V2-shell tests | T10, T12 |
| `en.json` | Remove orphaned keys per `check-i18n-orphan-keys.ts` (unused side) | every task |
| `apps/api/src/services/app-help-map.ts` (+ test) | REWRITE V0/V1 destination labels → V2 three-tab destinations (Mentor/Subjects/Journal). Server-side prompt text — NOT caught by the mobile orphan sweep. Ships with the T9 prod flip | T13 |

---

## Ordered deletion sequence (replacement-live-before-delete dependency order)

The order is dictated by (1) which heir is live, (2) which deletion unblocks the next, and (3) whether gate (c) has authorized retiring the protected V0/V1 paths. Before gate (c), T1-T8 may only de-link V2 entry points while leaving legacy files/routes/contracts/tests intact. After gate (c), the same ordered chain becomes actual deletion.

```
── Group A: V2-only de-linking before gate (c), or actual deletion after gate (c) ──
T1  Exit funnel dissolves          ⟂ GATE (a) P3 evals   — heir: wrap-up turn (S1 T24 + S3)
T2  ModeSwitcher + mode machinery   — heir: scope chip (S4)
T3  Proxy mode + proxy chrome       — heir: person scopes (S4)
T4  ParentHomeScreen special shell  — heir: Support-hub feed (S4/S5)
T5  More tab + You-tab hodgepodge   — heir: avatar sheet + Journal (S3)
T6  Library tab (browse survives)   — heir: S2 Subjects list + S3 Journal archive (EU-6)
T7  child/[profileId]/* proxy routes — heir: chip person-scopes (S4/S5)
T8  navigation-contract home-branch + V1 tab-shape matrix (post-gate deletion only; pre-gate test-only V2 short-circuit assertion)
    (the V1 contract paths now have zero live consumers after T2–T7)

── Group B: V0 constraint retirement (GATE (c) §13.1 ruling) ──
T9  Flip V2 to production default (eas.json prod + ci.yml OTA + feature-flags)
T13 Rewrite apps/api app-help-map.ts → V2 destinations (SAME change-set as T9)
T10 Delete legacy-navigation-contract.ts + navigation-contract.ts shape matrix
    + their guard/property/totality/snapshot/acceptance/usage tests
T11 Delete app-context mode provider + flags-off short-circuits; remove V0/V1 flags
T12 Delete V0/V1 e2e regression flows; final orphan-grep sweep (incl. apps/api app-help-map)
```

**Why this order:** T2–T7 remove every runtime *reader* of the legacy contract and proxy state; only then (T8) can the contract's tab-shape branches be deleted without a live caller; only after the §13.1 ruling (gate c) do T9–T12 remove the flag scaffolding itself. Before gate (c), treat this as a de-linking checklist only: no protected V0/V1 file, route, contract branch, or test may be deleted.

---

## Tasks

> Each `done when:` is a **before/after check**: (i) the V2 heir is live + measured (replacement-live precondition), (ii) after gate (c), the legacy surface has **zero inbound routes / imports** (grep proves it), (iii) the relevant test suites are **green on both sides** of the deletion (legacy tests removed only with deleted subjects; V2 tests still green; the must-not-regress floor unchanged until gate c), (iv) **zero orphaned artifacts** by a project-wide grep (types, imports, constants, SecureStore keys, commented-out JSX, fallback branches, i18n keys, e2e flows).

### Group A — V2 de-linking before gate (c), destructive deletion after gate (c)

- [ ] **T1: Dissolve the 3-screen session exit funnel into the mentor wrap-up turn.** ⟂ **GATE (a).**
  Delete `apps/mobile/src/app/session-summary/[sessionId].tsx`, its `_view-models/session-summary-derived.ts`, and co-located tests **only after** the V2 mentor wrap-up turn has inherited the learning behavior the screen hosted: the mentor asks the learner to write what they learned in their own words, saves that text as the learner-authored session/mentor-memory signal, and applies/displays the 1.5x reflection bonus as a private earned-reward receipt. Remove the `session-summary` route from any route catalog, `HIDDEN_TAB_ROUTES`, and every `router.push('/session-summary/...')` / `homeHrefForReturnTo` redirect target — repoint each to the S1 T24 wrap-up conversation turn (with S3 eval coverage) in `session/index.tsx`. Delete the funnel-only helpers (`reflection-starters.ts`, `summary-draft.ts` + its `KEY_PREFIX='summary-draft'` SecureStore key) **only if** grep shows zero V2 wrap-up consumers; if `MentorMemoryCue` / `SessionSummaryLibraryFilingControls` / `FilingFailedBanner` / reflection prompts have other consumers, keep them and delete only the funnel screen.
  **Server-route disposition (explicit follow-up, not a silent leak):** the funnel's API routes behind `useSubmitSummary`/`useSkipSummary`/`useRecallBridge` stay live (the wrap-up turn still files via them); record in the PR body that their *screen* is gone but their *endpoints* remain S5-owned. Do not delete the server routes here.
  **done when:** (i) gate (a) green — `eval-llm/flows/park-and-return-ranking.ts` registered with the EU-3 competition assertion and the re-weave flow registered; gate (c) green for reflection — the V2 wrap-up test proves learner-written "Your Words" text is prompted, saved/filed, and rewarded with the 1.5x receipt; (ii) `git grep -nE "session-summary|SessionSummaryScreen|session-summary-derived|reflection-starters|summary-draft" apps/mobile/src` returns ONLY (a) the wrap-up turn's filing/reflection call sites (if they reuse a kept helper) and (b) nothing referencing the deleted screen/route; zero `router.push.*session-summary`; (iii) the V2 conversation/session suites pass (`cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage`), including assertions for reflection prompt, 1.5x receipt, and mentor-memory/session filing; the deleted screen's tests are gone, not skipped; the V0/V1 shells are untouched (no nav-flag file changed in this task); (iv) `pnpm check:i18n` shows no orphaned **screen-only** `summary.*` / `reflection.*` keys left in `en.json`; keys used by the V2 wrap-up are re-homed under the wrap-up namespace and must not be deleted.

- [ ] **T2: Delete the ModeSwitcher + Study/Family mode machinery.**
  Before gate (c), do **not** delete `ModeSwitcher` or `use-mode-switch`; only guard the `_layout.tsx` mount so V2 never renders it while V0/V1 paths remain byte-identical. After gate (c), delete `apps/mobile/src/components/chrome/ModeSwitcher.tsx` (+ test) and `apps/mobile/src/lib/use-mode-switch.ts` (+ test), then remove the `<ModeSwitcher />` mount (currently around `_layout.tsx:614`). In `app-context.tsx`, the `derivedMode`/`setMode`/`mode`/`AppMode` machinery loses its UI consumer here; **strip the mode-switch call paths but leave the provider shell until T11** (T11 deletes the provider once the contract that reads `mode` is also gone). Sweep `analytics.ts` mode-switch events, `RequireFamilyContext.tsx` (if its only purpose is mode-gating), and `LearnerScreen.tsx` ModeSwitcher references.
  **done when:** (i) heir live — the S4 scope chip is shipped behind `MODE_NAV_V2_ENABLED` and measured; (ii) `git grep -nE "ModeSwitcher|use-mode-switch|useModeSwitch" apps/mobile/src` returns zero matches in source (tests of deleted subjects removed); the `_layout.tsx` mount line is gone; (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx src/lib/app-context.tsx --no-coverage` passes; the V0/V1 flag files (`feature-flags.ts`, `eas.json`, `ci.yml`) are unchanged (V0 not regressed); (iv) no orphaned `mode.switch.*` / `tabs.familyHub*` i18n keys remain that only the ModeSwitcher used; `check-i18n-orphan-keys.ts` passes.

- [ ] **T3: Delete proxy mode + proxy chrome.**
  Delete `apps/mobile/src/hooks/use-parent-proxy.ts` (+ test). Remove the `ProxyBanner` mount and the `isProxyChromeActive` / `proxyColors` branches in `_layout.tsx:596-601,622-643`, the `proxy` surface in `use-navigation-contract.ts` (`NavigationProxySurface`, `useProxySurface`, the `isParentProxy` plumbing), and proxy paths in `legacy-navigation-contract.ts` (`PARENT_PROXY_TABS`, `isParentProxy` params — **but defer the legacy-contract file deletion itself to T10**; T3 only removes proxy *consumers*). Sweep `analytics.ts` proxy events, `use-clone-from-child.ts`, `session-transcript/[sessionId].tsx` proxy reads, and the `session-transcript-parent-proxy.yaml` e2e flow (delete with T12, note it here).
  **done when:** (i) heir live — S4 person-scopes shipped + replacement-parity checked; (ii) `git grep -nE "ParentProxy|isParentProxy|use-parent-proxy|ProxyBanner|proxyColors|isProxyChromeActive" apps/mobile/src` returns zero in source; (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-navigation-contract.ts src/app/\(app\)/_layout.tsx --no-coverage` passes; V0/V1 flags unchanged; (iv) no orphaned `proxy.*` i18n keys; `check-i18n-orphan-keys.ts` passes.

- [ ] **T4: Delete `ParentHomeScreen` as a special shell.**
  Delete `apps/mobile/src/components/home/ParentHomeScreen.tsx`. Collapse `home.tsx:161-169` — the `navigationContract.home.screen === 'FamilyHome' ? ParentHomeScreen : LearnerScreen` branch — so the `home` route renders only the V2 Mentor feed (its S1 heir). Remove `FamilyHome` from `NavigationContract['home'].screen` and `resolveContractHomeTabPresentation`'s `FamilyHome` branch in `legacy-navigation-contract.ts:136-143` (defer the file deletion to T10; remove only the branch here if it has no other live caller).
  **done when:** (i) heir live — the S4/S5 Support-hub Mentor feed is shipped + replacement-parity checked; (ii) `git grep -nE "ParentHomeScreen|FamilyHome" apps/mobile/src` returns zero in source; the `home.tsx` branch renders the V2 feed unconditionally under the V2 flag; (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/home.tsx --no-coverage` passes; V0/V1 untouched; (iv) no orphaned `tabs.familyHub*` / `tabs.children*` keys; `check-i18n-orphan-keys.ts` passes.

- [ ] **T5: Delete the More tab + the You-tab hodgepodge (`my-notes`, legacy `recaps`/`mentor-memory` entries, the milestones gallery).**
  Delete `apps/mobile/src/app/(app)/more/*` (index, account, privacy, notifications, accommodation, celebrations, help, security-sessions, _layout, and tests). Delete `my-notes/*`, and the standalone `recaps/*` + `mentor-memory.tsx` route entries that the S3 Journal tab + avatar admin sheet now own. **Delete the standalone milestones gallery** — `apps/mobile/src/app/(app)/progress/milestones.tsx`, its `MilestoneCard` component, and the `useProgressMilestones` read hook — now that `milestone_reached` moments (S0 producer + S3 Journal strip) are the heir; **keep** the `milestones` table, `detectMilestones`/`storeMilestones`, and snapshot aggregation (out-of-scope re-home note above). The gallery has no live inbound nav today (dossier-02 oddity #1), so this is removal of dead UI + its now-unused read hook, not a redirect. Remove `more`/`recaps` from the V1 tab-shape sets (`navigation-contract.ts` / `legacy-navigation-contract.ts`) — branch-level removal only; file deletions are T10. Repoint any `router.push('/more/...')` to the avatar sheet route (S3) and any `/my-notes` / `/recaps` push to the Journal tab.
  **done when:** (i) heir live — S3 Journal tab + avatar admin sheet shipped + replacement-parity checked; Journal shows recaps, learner-authored reflection excerpts/markers, notes/bookmarks, mentor memory, `milestone_reached` moments, and private earned-reward receipt history where present; (ii) `git grep -nE "/more/|my-notes|MoreScreen|HUB_ITEMS|progress/milestones|useProgressMilestones|MilestoneCard" apps/mobile/src` returns zero inbound route pushes / consumers of the deleted screens (the milestones-gallery grep returns nothing — confirming no inbound nav existed and the read hook is fully orphaned); the avatar sheet and Journal own every former destination; (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx --no-coverage` passes; the deleted screens' tests are gone; V0/V1 untouched; (iv) orphaned `more.*` / `myNotes.*` / gallery-only `progress.milestones.*` i18n keys removed (milestone moment keys `journal.moments.milestone.*` are KEPT — they are the heir); `check-i18n-orphan-keys.ts` passes.
  **Note (avatar sheet must already host account/privacy):** billing/security live in `more/account.tsx` and export/delete in `more/privacy.tsx` (owner-gated, per CLAUDE.md). T5 may delete these ONLY if S3 moved them behind the avatar; verify the avatar sheet renders billing/security/export/delete owner-gated before deleting `account.tsx`/`privacy.tsx`.

- [ ] **T6: Delete the Library *tab* (structure browse survives in Subjects; saved-items browse in Journal).**
  Delete `apps/mobile/src/app/(app)/library.tsx` and remove `library` from every V1 tab-shape set. **Keep `apps/mobile/src/components/library/*`** (BookCard, SuggestionCard, ShelfRow, LibrarySearchBar) — the S2 hub and the S3 Journal browsable archive (EU-6) reuse them. The tab dies; the browse does not (spec §7 + §5.4 + EU-6). Repoint each `/library` push **by job**: structure-browsing intents (the manage-subjects recovery, "Browse topics", go-library loading-timeout escapes) → the S2 Subjects tab list; saved-items intents → the S3 Journal archive. Never repoint wholesale to one tab — most `/library` pushes mean "show my subjects", not "show my saved items".
  **done when:** (i) heirs live — the S2 Subjects tab list AND the S3 Journal cross-subject *browsable* archive are shipped + replacement-parity checked (not search-only — EU-6), the Subjects tab full list renders before search, and compact progress numbers render on subject rows; (ii) `git grep -nE "\(app\)/library|LibraryScreen|push.*'/library'" apps/mobile/src` returns zero; `components/library/*` still imported by the S2 hub + S3 archive (grep confirms live consumers — these are NOT orphans); (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx --no-coverage` passes; V0/V1 untouched; (iv) orphaned `library.*` *tab* keys removed (keep archive/search keys the Journal uses); `check-i18n-orphan-keys.ts` passes.

- [ ] **T7: Delete the `child/[profileId]/*` proxy routes.**
  Delete `apps/mobile/src/app/(app)/child/[profileId]/*` (index, reports, report, curriculum, session, subjects, topic, mentor-memory, weekly-report, _layout, and tests). The S4/S5 chip person-scopes + structural rendering mask are the heir; the server *read shapes* these screens used are reused server-masked by S4 (do not delete server read endpoints here). Remove `child/[profileId]` from `HIDDEN_TAB_ROUTES` and any `router.push('/child/...')`.
  **done when:** (i) heir live — S4 scope chip + S5 person-scope structural rendering shipped + replacement-parity checked; (ii) `git grep -nE "\(app\)/child/|/child/\[profileId\]" apps/mobile/src` returns zero inbound pushes; (iii) `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/_layout.tsx --no-coverage` passes; deleted-route tests gone; V0/V1 untouched; (iv) orphaned `child.*` / parent-dashboard i18n keys removed; `check-i18n-orphan-keys.ts` passes.

- [ ] **T8: Remove the now-dead `navigation-contract.ts` home-branch + V1 tab-shape readers (dead-code only — flags still live).**
  After T2–T7 and gate (c), the V1 contract's `home.screen === 'FamilyHome'` branch (`navigation-contract.ts:376-386`), the `STUDY_TABS`/`FAMILY_TABS`/`PROXY_TABS`/`LEGACY_GUARDIAN_TABS` sets (`:145-168`), and the proxy/family gates can be removed. Before gate (c), T8 is **test-only**: assert the V2 branch short-circuits before legacy contract logic and delete nothing from `navigation-contract.ts`. **Do NOT delete the file or remove the V0/V1 flags before gate (c)** — `resolveNavigationContract` remains live for protected V1 paths.
  **done when:** (i) the V2 shell reads its three-tab set from the V2 seam only (verified by `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-navigation-contract.ts --no-coverage`); (ii) `git grep -nE "STUDY_TABS|FAMILY_TABS|PROXY_TABS|LEGACY_GUARDIAN_TABS|FamilyHome" apps/mobile/src` returns only `legacy-navigation-contract.ts` (deleted in T10) — zero in `navigation-contract.ts`; (iii) the nav-contract guard/property/totality/snapshot tests pass with the dead branches removed (update assertions that named the deleted sets to the V2 set — never weaken; if a test only validated a deleted construct, delete that test with its subject); (iv) `tsc --noEmit` clean; the V0/V1 flag-on shells still build (no flag file changed).

### Group B — V0 constraint retirement (GATE (c) §13.1 ruling)

> **Group B does not start until gate (c) is green.** Until the §13.1 product ruling, all protected legacy flag states must not regress: flags-off legacy, current production V0-on/V1-off, and V1 dev/preview. T9–T12 are the *execution* of that ruling, removing the flag scaffolding and the legacy contract entirely.

- [ ] **T9: Flip `MODE_NAV_V2_ENABLED` to the production default.**
  In `apps/mobile/eas.json`, set `build.production.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` (the prod build now ships V2) and **remove** `EXPO_PUBLIC_ENABLE_MODE_NAV` / `..._V1` from prod (`:13`), dev (`:23-24`), preview (`:39-40`). In `.github/workflows/ci.yml` OTA env (currently around `:397-398`), remove the V0/V1 lines and keep only the V2 line. In `apps/api/src/config.ts`, the `MODE_NAV_V2_ENABLED` env entry stays (it is now the canonical "on" state) — add a comment that V0/V1 are retired. Do this as a **flag-flip commit separate from code deletion** so a regression is reverted by flipping one env value, not by restoring deleted files.
  **done when:** prod/dev/preview/OTA all carry only `EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true'` (no V0/V1 env anywhere); `git grep -nE "EXPO_PUBLIC_ENABLE_MODE_NAV(_V1)?[^_]" apps/mobile/eas.json .github/workflows/ci.yml apps/mobile/.env.example` returns zero (only the `_V2` form remains); a preview-channel OTA renders the V2 three-tab shell as the only shell (manual verify on staging).
  **Rollback:** flip `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` back to `'false'` in eas.json prod + ci.yml OTA → the build falls back to the flags-off legacy shell **only if T10–T11 have not yet deleted the legacy code**. Because T9 ships as its own commit BEFORE the file deletions, a V2 regression caught at this stage is a one-line env revert with full V0 fallback intact.

- [ ] **T10: Delete `legacy-navigation-contract.ts` + the `navigation-contract.ts` shape matrix + their tests.**
  Delete `apps/mobile/src/lib/legacy-navigation-contract.ts` wholesale (`resolveTabShape`, `computeVisibleTabs`, `computeModeVisibleTabs`, `resolveShellVisibleTabs`, `resolveHomeTabPresentation`, the `GUARDIAN_TABS`/`LEARNER_TABS`/`PARENT_PROXY_TABS`/`FAMILY_MODE_TABS`/`STUDY_MODE_TABS` sets). Reduce `navigation-contract.ts` to only what the V2 shell needs (or delete it if the V2 chip fully owns shape — verify no live import). Delete the now-vacuous guard tests of deleted behavior: `navigation-contract.guard.test.ts`, `.property.test.ts`, `.totality.test.ts`, `.snapshot.test.ts`, `.acceptance.test.ts`, `navigation-contract-usage-guard.test.ts`, `legacy-navigation-contract.test.ts`, and the `__fixtures__/navigation-matrix.ts` fixture — each tests a construct that no longer exists (delete-the-whole-test, not weaken-the-assertion, per CLAUDE.md test rule (b)). Keep any V2-shell test and repoint it to the V2 set.
  **done when:** `git grep -nE "legacy-navigation-contract|resolveShellVisibleTabs|resolveTabShape|computeModeVisibleTabs|GUARDIAN_TABS|navigation-matrix" apps/mobile/src` returns zero; `tsc --noEmit` clean; `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-navigation-contract.ts src/app/\(app\)/_layout.tsx --no-coverage` passes (V2 shell green); no deleted test is skipped/weakened — it is removed with its subject.
  **Rollback:** `git revert` the T10 commit restores both contract files + their tests verbatim. Combined with re-flipping the T9 flag, V0/V1 is fully restored. **Data loss: none** — these are pure UI-logic files, no schema, no persisted state. Recovery procedure: revert T10 then T9 (reverse order); the flags-off legacy shell renders again.

- [ ] **T11: Delete the `app-context` mode provider + flags-off short-circuits; remove the V0/V1 flags.**
  Delete the mode machinery left standing after T2 in `apps/mobile/src/lib/app-context.tsx` — `AppMode`, `mode`, `setMode`, `derivedMode`, `familyCapable`, `modeOverride`, and the flags-off short-circuits at `:64,77,152`. If no consumer of `AppContextProvider` remains, delete the provider and its mount; otherwise reduce it to the minimum the V2 shell needs (verify by grep). In `apps/mobile/src/lib/feature-flags.ts`, **remove** `MODE_NAV_V0_ENABLED` (`:30`) and `MODE_NAV_V1_ENABLED` (`:31`). Sweep every remaining `FEATURE_FLAGS.MODE_NAV_V0_ENABLED` / `..._V1` read across the 90 files the grep found — each must already be dead after T1–T10; delete the dead branch (never leave a `false`-pinned fallback).
  **done when:** `git grep -nE "MODE_NAV_V0_ENABLED|MODE_NAV_V1_ENABLED|AppMode|derivedMode|familyCapable" apps/mobile/src` returns zero in source (only deleted-test removal, none live); `tsc --noEmit` clean; the full mobile unit suite passes (`pnpm exec nx lint mobile` + the related-tests sweep for `app-context`, `_layout`, `home`); the V2 shell is the only shell and it renders under `MODE_NAV_V2_ENABLED`.
  **Rollback:** `git revert` T11 then T10 then T9 (reverse dependency order) restores the flags, the provider, and the legacy contract. **Data loss: none** (UI-only). Until T11 lands, T9's flag-flip is still the cheap revert path; T11 is the point of no cheap return, so it ships last in Group B with the full suite green.

- [ ] **T12: Delete V0/V1 e2e regression flows; final orphan-grep sweep.**
  Delete the Maestro e2e flows that exercise the retired shells under `apps/mobile/e2e/flows/`: `parent/v0-guardian-tab-shape.yaml`, `parent/parent-tabs.yaml`, `parent/recaps-tab-list.yaml`, `parent/recaps-empty-state.yaml`, `parent/recap-detail-navigation.yaml`, `parent/family-bridge-from-recaps.yaml`, `parent/family-bridge-clone.yaml`, `parent/child-session-recap*.yaml`, `parent/session-transcript-parent-proxy.yaml`, `learning/solo-owner-tab-shape.yaml`, `account/profile-switching.yaml` (V0/V1-shell-specific), and any flow whose selectors target deleted tabs/screens. Keep flows that exercise surviving session/homework/practice entries. Run the **project-wide final orphan sweep**: grep the whole repo (not just `apps/mobile/src`) for every retired token and confirm zero live references.
  **done when:** the final sweep `git grep -nE "MODE_NAV_V0|MODE_NAV_V1|ModeSwitcher|ParentHomeScreen|isParentProxy|legacy-navigation-contract|STUDY_TABS|FAMILY_TABS|PROXY_TABS|LEGACY_GUARDIAN_TABS|session-summary/\[sessionId\]|/child/\[profileId\]|/more/index|my-notes" -- 'apps/mobile' returns zero in source (docs/`_archive`/changelog mentions are acceptable and explicitly excluded); `check-i18n-orphan-keys.ts` (no `--allow-unused`) passes — zero orphaned keys in `en.json`; `check-i18n-jsx-literals.ts` baseline unchanged (no new literals); `pnpm exec nx run-many -t lint typecheck` clean; the e2e suite has no flow referencing a deleted selector (a dry `check_flow_syntax` over the kept flows passes).

- [ ] **T13: Delete the V0 app-help map variant; make the V2 map the sole map.**
  `apps/api/src/services/app-help-map.ts` is the mentor's understanding of where things are in the app — a server-owned static destination map injected into the exchange prompt whenever `isAppHelpQuery(userMessage)` is true (`exchanges.ts:1334`). The **V2 variant + shell selector is authored and tested PRE-S6** (see the pre-S6 enabler slice — "V2 mentor app-understanding testability", v2-plan README cross-cutting note): `APP_HELP_MAP_V2` (Mentor/Subjects/Journal/avatar-sheet labels) lives alongside the V0 map, and `buildAppHelpPromptBlock(shell)` / `buildAppHelpDirectReply(text, shell)` select by shell, defaulting to V0 so prod stays byte-identical until T9. **By the time S6 runs, V2 app-help is already authored, eval-covered, and validated** — T13 is therefore a DELETION, not authoring: once T9 flips V2 to the prod default and T4–T8 delete the V0 More/Library/Home/Progress destinations, delete `APP_HELP_MAP` (V0), collapse the `shell` selector so `buildAppHelpPromptBlock()` / `buildAppHelpDirectReply()` return the V2 map unconditionally, and drop the now-unused `navShell` request field + its mobile send-site (if added for on-device QA). Ships in lockstep with T9 so the served map and the shipped shell never disagree for a real user.
  **done when:** (i) heir live — the V2 map variant has been live + eval-validated since the pre-S6 enabler slice, and T9 has flipped V2 to the prod default (or this ships in the same commit); (ii) `git grep -nE "My Notes|More >|Open Progress|Library >|APP_HELP_MAP\b|'v0'|navShell" apps/api/src/services/app-help-map.ts` returns zero V0 destinations / selector residue; the file exposes only the V2 Mentor/Subjects/Journal/avatar-sheet map; (iii) `cd apps/api && pnpm exec jest --findRelatedTests src/services/app-help-map.ts --no-coverage` passes with the V0-variant tests deleted (delete-the-whole-test, not weaken — repo test rule (b)); (iv) `pnpm eval:llm` snapshot re-captured for the app-help flow (prompt change → CLAUDE.md eval-snapshot rule); (v) extend the T12 final sweep to also grep `apps/api/src/services/app-help-map.ts` for retired V0 destination tokens.

---

## Rollback (posture per destructive step)

S6 is **all deletions of UI-logic files behind a flag** — there is **no migration, no schema change, no data backfill, no persisted-state change** anywhere in this plan (the only persisted key touched is the `summary-draft` SecureStore key in T1, addressed below). Per CLAUDE.md Schema-And-Deploy-Safety, a `## Rollback` note is mandatory for destructive steps; here the destructive steps are file deletions and an env flip.

**General posture:** every deletion ships as a small, independently-revertable commit in the §Ordered-deletion-sequence order. Rollback of any task = `git revert <task commit>` (restores the deleted files verbatim) — and for Group B, reverting in **reverse dependency order** (T12 → T11 → T10 → T9) restores the V0/V1 shells fully.

| Step | Destructive action | Rollback possible? | Data lost | Recovery procedure |
|---|---|---|---|---|
| T1 | Delete exit-funnel screen + (maybe) `summary-draft` SecureStore key | Yes | **The `summary-draft` local draft key, if deleted, abandons any in-flight on-device draft** (no server mirror — `project_summary_draft_backup_deferred`). Drafts are transient (a single unsaved session reflection); no historical data. | `git revert` restores the screen. The orphaned-key concern is one-directional: deleting the key stops *writing* new drafts; existing on-device drafts simply never render. If the wrap-up turn (heir) covers filing, the draft key is genuinely dead — confirm before deleting. |
| T2–T8 | Before gate (c): V2-only de-linking/test assertions. After gate (c): delete UI components/routes/dead branches (mode, proxy, parent-home, more, library tab, child routes, nav dead-code) | Yes | None — pure UI logic, no schema, no persisted state | `git revert <task commit>`. Before gate (c), V0/V1 flagged paths are untouched; after gate (c), rollback restores the deleted legacy shell. |
| T9 | Flip V2 to prod default; remove V0/V1 env | Yes (cheapest) | None | Flip `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` back to `'false'` + restore V0/V1 env lines → flags-off legacy shell renders (valid only while T10/T11 not yet landed). T9 ships as its own commit precisely to keep this one-line revert available. |
| T10 | Delete `legacy-navigation-contract.ts` + `navigation-contract.ts` shape matrix + tests | Yes | None (UI-only) | `git revert T10`, then re-flip T9 flag. Restores both contracts + their guard/property/totality tests verbatim. |
| T11 | Delete `app-context` mode provider + flags-off short-circuits; remove V0/V1 flags | Yes (point of no *cheap* return) | None (UI-only) | `git revert T11 → T10 → T9` (reverse order). After T11, the flag no longer exists, so recovery requires restoring the flag files too — hence T11 ships last in Group B, only after the full suite is green and the V2 shell is validated in production. |
| T12 | Delete V0/V1 e2e flows | Yes | None — the flows test deleted behavior; they have no value once the shells are gone | `git revert T12` restores the flow files (only useful if T9–T11 are also reverted). |

**Is full rollback possible after Group B completes?** Yes, by reverting Group B commits in reverse order — but it is **not the cheap path** once T11 removes the flags. The design intent (T9 as a standalone flag-flip before deletions) is to make the *common* regression case (V2 misbehaves in prod) a one-line env revert with full V0 fallback, and to defer the irreversible-by-flag deletion (T10/T11) until the V2 shell is proven in production. **Nothing in S6 is irreversible by `git revert`; nothing destroys data.**

---

## Self-review

**Spec coverage** (each §7 "what dies" item → task; each gate → §Gates):
- ModeSwitcher + proxy mode (§7) → T2 + T3. Tab-shape matrix (§7) → T8 + T10. `ParentHomeScreen` special shell (§7) → T4, with the S4 self-learning doorway live before deletion. More tab + You-tab hodgepodge (§7) → T5, with Journal recaps/reflections/reward history live. 3-screen exit funnel dissolves into wrap-up turn **only after P3 eval coverage and reflection-bonus heir coverage** (§7 + 2026-06-13 amendment) → T1 ⟂ gates (a)+(c). Library *tab* dies, browse survives in Subjects + Journal (§7, EU-6) → T6 (components/library kept; Subjects list full browse + progress numbers live). ~78 redundant front doors / collapse-follows-usage-evidence (§7) → realized across T1–T8 only after gate (b) authorizes destructive deletion of protected legacy paths.
- §11 S6 row (cutover & deletions; exit funnel gated on S3 evals; V0 ruling executed) → whole plan; gate (a) = S3 evals, gate (b) = §13.1 ruling.
- §13.1 V0-retirement ruling (owner: Zuzana, blocks destructive deletion) → gate (b), executed before any V0/V1-reachable file/route/contract/test is removed, never pre-empted.
- §11 evidence gate / §13.6 (S2→S3 not pre-authorized) → superseded by the 2026-06-14 no-cohort product ruling; no observed-cohort PASS is required for S6, but the remaining gates and explicit irreversible confirmation still block the plan.
- 2026-06-13 lost-flow preservation ruling → gate (c): reflection-for-bonus, standalone quiz discovery, adult self-learning, self-directed browse, and quantified progress all need live V2 heirs before deleting legacy hosts.
- §14 "Old nav regression risk" row (V0 flag-isolated + test-guarded for any S1–S5 PR) → preserved before gate (c); the regression-test floor (nav-contract guard/property/totality + V0/V1 e2e) stays green until the gate authorizes deleting tests *of deleted behavior*.
- Repo "Clean up ALL artifacts" rule → every task's `done when:` (iv) is a project-wide orphan grep (types/imports/constants/SecureStore key/i18n keys/e2e flows); T12 is the final full-repo sweep.
- Migration/destructive `## Rollback` rule → §Rollback table, one row per destructive step; explicitly states no schema/migration/data loss except the transient `summary-draft` SecureStore key (T1).
- Tests green both sides → every `done when:` (iii); deletions remove tests *with their subject* (CLAUDE.md test rule (b): delete the whole test when the feature is gone, never weaken an assertion).

**Name consistency:** flags `MODE_NAV_V0_ENABLED`/`MODE_NAV_V1_ENABLED`/`MODE_NAV_V2_ENABLED` (env `EXPO_PUBLIC_ENABLE_MODE_NAV`/`..._V1`/`..._V2`); files `legacy-navigation-contract.ts`, `navigation-contract.ts`, `app-context.tsx`, `ModeSwitcher.tsx`, `use-mode-switch.ts`, `ParentHomeScreen.tsx`, `session-summary/[sessionId].tsx`, `library.tsx`, `child/[profileId]/*`; tab sets `STUDY_TABS`/`FAMILY_TABS`/`PROXY_TABS`/`LEGACY_GUARDIAN_TABS` (V1) and `GUARDIAN_TABS`/`LEARNER_TABS`/`PARENT_PROXY_TABS`/`FAMILY_MODE_TABS`/`STUDY_MODE_TABS` (legacy); helpers `resolveTabShape`/`resolveShellVisibleTabs`/`computeModeVisibleTabs`/`resolveContractHomeTabPresentation`. Used identically across tasks, the ordered sequence, and the rollback table.

**Deferred-decision scan:** ordered deletion sequence is fully concrete (T1→T12, dependency-justified); each gate has a named verification artifact, including gate (c)'s lost-flow heirs; the heir-live precondition is a table not a "TBD"; the `summary-draft` key and the `components/library/*` keep-decisions are resolved (keep iff live consumer by grep); the server-route disposition for the funnel is explicitly deferred-with-owner (S5), not silently dropped; reward schema/table deletion is explicitly out of scope absent a future migration plan with equivalent earned-reward contract. No "TBD"/"handle appropriately" remain.

**Anchors verified 2026-06-10; refreshed 2026-06-13 where noted:** `feature-flags.ts:30-31`; `legacy-navigation-contract.ts` (whole file read); `app-context.tsx` flags-off short-circuits `:64,77,152`; `_layout.tsx` ModeSwitcher mount now around `:614`, tab whitelist/proxy chrome should be refreshed at execution time; `home.tsx:161-169` branch (via anchors doc); `session-summary/[sessionId].tsx:1-71`; eas.json env `:13,23-24,39-40`; ci.yml OTA env now around `:397-398`; child/`more`/`my-notes`/`recaps` route inventories; nav-contract guard/property/totality/snapshot/acceptance/usage-guard tests; V0/V1 e2e flows. **Gate (a) verified UNMET:** no `eval-llm/flows/park-and-return*` exists today.

**2026-06-10 + 2026-06-13 amendment reconciliation (spec §2.1/§15.17, §3.1/§3.2, lost-flow preservation):**
- *Motivation end-state (§2.1/§15.17):* The end state S6 reaches has no leaderboards, public rank/comparison, streak-loss pressure, random rewards, paywall urgency, or guilt mechanics. It **does** preserve earned private learning receipts: XP/practice points, the 1.5x reflection bonus, quiz scores/personal bests, mastery counts, weekly deltas, and rhythm/momentum. S6 deletes old hosts only after V2 heirs render those receipts where useful; it does not drop `xp_ledger`, `GET /xp`, or `retention_cards.xpStatus`.
- *Lost V1 learning levers:* Reflection-for-bonus moves into the mentor wrap-up turn; Capitals/Guess Who stay discoverable through light practice; adult self-learning stays first-class in Support hub; Subjects/Journal remain browse-first; compact progress numbers survive. Gate (d) enforces all five before deletion.
- *Cold-start in the end state (§3.1/§3.2):* The learner cold-start card (§3.1, built S1) and supporter cold-start variants (§3.2, built S4) are part of the ~25-screen end state this plan reaches. They are not deleted in S6. The exit-funnel dissolution gate on S3 P3 evals (gate a) is **unchanged** by the cold-start ruling.
- *V0/V1 no-regress constraint and §13.1 ruling:* Gate (c) (§13.1 retirement ruling, owner: Zuzana) blocks every destructive deletion that would affect protected V0/V1 paths; before it, only V2 de-linking/test hardening is allowed.
