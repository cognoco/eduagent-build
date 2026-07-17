# BID-13 "Mentor loop" — Refinement Pass

Batch page: `3a08bce9-1f7c-8197-8f99-c776260d9657` (Status: Ready, Formed 2026-07-17, NOT YET DISPATCHED)
Members: WI-2094, WI-2099, WI-2222. Analyst: refine-bid13. Read-only pass (Notion GET-only, repo read-only).

---

## 1. Members & DoR verdicts

All three are already `Stage=Ready` (mechanical DoR already passed once via `/zdx:refine`, WI-2094 twice — reopened for a stale-AC correction, re-passed). This pass is an independent confirmation, not a first check.

### WI-2094 — Route valid Mentor statements instead of silently ignoring send
**Verdict: READY-CONFIRMED**
- Type=Bug, P1, Kind=Atom/Item, Execution Path=Assisted, Effort=S, Blocked by=empty.
- Executable code surface confirmed: `apps/mobile/src/lib/bar-intent-match.ts`, `apps/mobile/src/app/(app)/mentor.tsx` (Found In cites exact lines: bar-intent-match.ts:189-259, mentor.tsx:169-191) — verified both files exist at those paths.
- AC has regression-test requirement ("Add red-green component/integration coverage for all variants") ✓.
- AC enumerates behavioral variants (7: declarative request, question, confident navigation command, ambiguous input, arrow press, keyboard submit, submit-while-editing) ✓.
- Root cause is stated, not just symptom (non-question declarative input falls through intent matching; the enabled-submit branch calls `setShowLightPractice(true)` which is a visual no-op when light practice is already showing).
- No gaps. QA reproduction comment (2026-07-16) independently confirms the symptom on native + Chromium with exact repro strings.

### WI-2099 — Preserve the opening Mentor exchange when starting a session
**Verdict: READY-CONFIRMED**
- Type=Bug, P1, Kind=Atom/Item, Execution Path=Assisted, Effort=M, Blocked by=empty.
- Executable code surface confirmed: `apps/mobile/src/app/(app)/session/index.tsx`, `apps/mobile/src/components/session/use-session-streaming.ts` (ensureSession, line 339 def / 632 call site), `apps/mobile/src/components/session/use-subject-classification.ts`, `apps/mobile/src/components/session/sessionModeConfig.ts` (getOpeningMessage, line 180).
- AC has regression-test requirement ("cross-layer red-green regression covering entry, follow-up, persistence, and rehydration") ✓.
- AC enumerates variants (6: question opener, declarative opener, follow-up e.g. "Yes", delayed creation, retry/restart, already-created session) ✓.
- **Note on history**: capture-time DoR diagnostic (`item.a10.variants`) flagged missing variant enumeration — this gap is closed in the current AC. Not a live gap; recorded for shepherd awareness only.
- Root cause stated precisely: `ensureSession(sessionSubjectId, text)` (use-session-streaming.ts:632) uses the *follow-up* message text, not the original route `rawInput` that session/index.tsx renders only in a local opening bubble — so canonical transcript/backend session drops the opener.

### WI-2222 — Consolidate Mentor capability contract tests and targeted E2E
**Verdict: READY-CONFIRMED**
- Type=Task (not Bug — none of the Bug-specific DoR sub-rules apply), P2, Kind=Atom/Item, Execution Path=Assisted, Effort=S, Blocked by=empty.
- AC is a self-contained, testable "MINIMUM SUPPORTING OUTCOME": one shared case table drives the existing matcher + closed deep-link boundary tests (jump, Mentor session, clarification, unsupported route, wrong-scope denial); no corpus duplication; reuses existing fixtures.
- Comment history shows real refinement work: an initial hard block on WI-2221 was proposed then explicitly **removed** ("baseline fixture and boundary work can proceed now; final capability coverage reconciles with WI-2221" — WI-2221 is correctly excluded from this batch per the Brief). Scope was narrowed from "new trigger corpus" to "consolidate existing assets" after a reuse audit.
- Deferred/out-of-scope items (Playwright/Maestro journeys → WI-2231/2234/2236; flow inventory → WI-2198) are named, not silently dropped.
- No gaps. This item is completable within BID-13 without WI-2221 landing first — the deferred boundary is explicit in its own AC, so review shouldn't expect WI-2221-scope coverage from this batch.

---

## 2. Sequencing DAG + rationale

```
WI-2094 ─┐
         ├──(hard, shared test files)──▶ WI-2222
WI-2099 ─┘──(soft, coverage boundary)───▶ WI-2222

WI-2094 ∥ WI-2099   (file-disjoint — safe parallel or either order)
```

**2094 ∥ 2099 — confirmed file-disjoint, verified by import graph, not just description:**
- WI-2094's surface: `mentor.tsx` (imports `matchBarIntent` from `bar-intent-match.ts`; on match-uncertain it calls `setShowLightPractice`; on success it does `router.push({ pathname: '/(app)/session', params: { mode: 'freeform', rawInput: result.text }})`). Likely also touches `components/mentor/ColdStartCard.tsx` (the "Teach me something new" fill-only chip named in the QA comment as contract-inconsistent with typed input).
- WI-2099's surface: `session/index.tsx` (consumes `rawInput` route param, calls `getOpeningMessage(..., rawInput)` from `sessionModeConfig.ts` to build the local opening bubble) → `use-session-streaming.ts` (`ensureSession(sessionSubjectId, text)` — the actual defect: uses follow-up `text`, not the original `rawInput`) → `use-subject-classification.ts` (also imports `use-session-streaming`, listed in Found In as part of the raw-input handoff chain).
- Cross-checked both directions: `mentor.tsx` imports nothing from `session/*` or `use-session-streaming`; `session/index.tsx` imports nothing from `bar-intent-match`. mentor.tsx → session/index.tsx interact **only** through the Expo Router param contract (`mode`, `rawInput`), never through a shared source file or function.
- **The one soft coupling**: both fixes touch code on either side of that route-param contract. Neither fix should need to change the contract's shape (name/type of `mode`/`rawInput`) to do its job — but if either drifts the contract, the other side breaks silently. This is exactly the seam WI-2222 is built to catch (see below), not a reason to sequence 2094/2099 against each other.

**2222 after 2094 — HARD edge (shared files, not just conceptual):**
WI-2222's own reuse-audit comment states it consolidates/extends `bar-intent-match.test.ts` and `bar-intent-match.adversarial.test.ts` — the **same test files** WI-2094's AC requires new variant coverage in. Running 2222 before 2094 lands means consolidating against pre-fix matcher behavior, then rebasing through 2094's edits to the same files. Sequence strictly: 2094 lands → 2222 consolidates the settled matcher test surface.

**2222 after 2099 — SOFT edge (coverage boundary only, no shared files):**
WI-2222 touches none of WI-2099's files (`session/index.tsx`, `use-session-streaming.ts`, `sessionModeConfig.ts`, `use-subject-classification.ts` do not appear in 2222's Found In/reuse-audit). The "locks the contract surface" language in the Brief is about 2222's *deep-link boundary tests* exercising the settled mentor→session hand-off meaningfully — not a file dependency. **Practical implication for the shepherd**: 2222's matcher-consolidation work can start as soon as 2094 lands, even if 2099 is still in flight; only the portion of 2222 that exercises the full session-entry boundary needs 2099 settled too.

This confirms the Brief's own sequencing note ("2222 LAST... run 2094/2099 in either order or parallel") — with the caveat that "2222 last" is two edges of different strength, useful if the shepherd wants to start 2222 early against 2094 alone.

---

## 3. Seam file map

### BID-12 / WI-2112 (Challenge redefinition) — **LOW RISK, verified via committed diff, not description**
WI-2112 is already committed (`39d5153d2`, "route challenge.start deep link into Challenge Round session, not recall-test") but **not on `main`** — it lives on an unmerged remote branch `WI-2112` (`git merge-base --is-ancestor` returns false against local `main` HEAD `691f294da`). Actual diff touches exactly two files:
- `apps/mobile/src/app/(app)/topic/[topicId].tsx`
- `apps/mobile/src/app/(app)/topic/[topicId].test.tsx`

Zero overlap with any BID-13 file (`mentor.tsx`, `bar-intent-match.ts`, `session/index.tsx`, `use-session-streaming.ts`, `sessionModeConfig.ts`, `use-subject-classification.ts`). **No file collision.**

There is one *shared logical surface, not a shared file*: both WI-2112 and WI-2094 push into the same `/(app)/session` route, and WI-2099's `session/index.tsx` is the consumer for all of it — but on different `mode` branches. WI-2112 routes `mode: 'challenge'` deep links to `mode: 'learning'` (mirroring the existing `mode: 'review'` branch); WI-2094's mentor-bar path pushes `mode: 'freeform'`. Confirmed in `session/index.tsx` (`effectiveMode === 'learning'` gates Challenge-Round-adjacent logic, lines 596/620) and `sessionModeConfig.ts` (mode-keyed dispatch, e.g. `practice`→`review` normalization) — these are separate conditional branches in mode-keyed code, not competing edits to the same branch. This is coexistence, not collision, and it's precisely the boundary WI-2222's deep-link tests are positioned to cover once everything lands. Claimants on 2094/2099 do not need to coordinate live with the WI-2112 branch; a normal rebase-before-merge is sufficient.

### BID-15 (forming) / Supporter & Linking E2E program — **LOW RISK, disjoint surfaces**
No `supporter` directory exists under `apps/mobile` at all. The mobile UI's term for this role is **`parent`** (`apps/mobile/src/components/parent/`, `apps/mobile/e2e/flows/parent/`); the backend domain term is **`supporter`** (`apps/api/src/services/supporter-*.ts`, `supportership-revocation.ts`, `linking-ceremony.ts`). Linking flow lives at `apps/mobile/src/app/(app)/link/`. None of these paths intersect `apps/mobile/src/components/mentor/`, `apps/mobile/src/app/(app)/mentor.tsx`, or `apps/mobile/src/app/(app)/session/`.
One shared **read-only** infrastructure dependency: `apps/mobile/src/lib/scope-context.tsx` (`useScopeContext`) is imported by `mentor.tsx` and also referenced by supporter-domain code. Neither BID-13 nor (plausibly) BID-15 needs to *modify* this provider to do their work — both are consumers. Flagging for awareness, not scoring it as a seam risk.

---

## 4. Shepherd execution notes — verification approach per item

**WI-2094 (Bug)** — red-green-revert required per DoD §Bug. The QA-confirmed symptom lives in **two files at once** (matcher returns `uncertain` in `bar-intent-match.ts`, *and* `mentor.tsx`'s uncertain-branch calls `setShowLightPractice(true)` which is a no-op when light practice is already shown) — a unit test against the matcher alone would prove the matcher changed but **not** that pressing Send actually starts something. Red-green must run at the mentor.tsx integration level: press Send with each of the 7 AC variants → assert an observable outcome (session opens / clarification shown / catalog command executes), not just an intent-classification return value. Treat the AC's explicit device clause ("verify on preview Android plus a small-screen layout") as a manual or static+landed check per DoD verification-hygiene — it's not unit-testable.

**WI-2099 (Bug)** — red-green-revert required per DoD §Bug. This is a data-integrity bug where the **local UI already looks correct** (opening bubble renders fine) while the **canonical backend record is wrong** (opening input never lands in persisted transcript/events). A test that only asserts on rendered bubble content would pass before and after the fix and prove nothing — per the program's verification rule (exercise the guaranteed property, not code shape), the regression test must assert on the actual persisted/canonical session record (the `ensureSession` call's effect / transcript state after entry+follow-up+rehydration), across all 6 AC variants, not on component render output.

**WI-2222 (Task)** — not Bug-typed, so DoD's red-green-revert rule doesn't apply to it directly; its own deliverable *is* test coverage. The meta-verification is whether consolidation preserves detection power: confirm the shared case table still fails the same way the original separate suites (bar-intent-match unit/adversarial, now-deep-link, llm-provider-fixtures) did against each known-bad case, i.e. a mini red-green pass on the harness itself, before/after the consolidation. Must land after WI-2094 (hard, shared test files) — starting it before 2094 lands means rework.

---

## 5. Open flags for PM

1. **Dispatch-relevant — sequencing is advisory-only, not mechanically enforced.** All three items have empty Notion `Blocked by`. "WI-2222 last" exists only as Brief prose plus `Workstream Order=2` on WI-2222 (2094/2099 have `Workstream Order=null`) — per Notion convention this is an advisory soft-sequence, not a hard gate. If the dispatcher/claim mechanism reads `Blocked by` for gating, it will see WI-2222 as immediately claimable alongside 2094/2099. Recommend either: (a) set a hard `Blocked by` WI-2222 → WI-2094 before dispatch, or (b) confirm with the dispatch tooling owner that Brief-prose/Workstream-Order sequencing is actually honored. This is the one item that could cause a real ordering violation if missed.
2. WI-2094 and WI-2099 share the same `Blocking` target: WI-2231 ("Fix V2 profile and consent exits and cover the first Mentor session", Type=Bug) — consistent with WI-2222's own AC noting WI-2231/2234/2236 own the composed Playwright/Maestro journeys. Forward-looking only, not a blocker for this batch; noted for downstream awareness.
3. No blocking gaps found in any of the three items. All three are legitimately READY-CONFIRMED; this pass surfaced sequencing precision (edge type/strength) and seam evidence beyond what the Brief already asserted, not new defects.
