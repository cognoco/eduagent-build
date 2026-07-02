# Execution Tracker — PRG-33 · Mobile UX & Navigation (WS-33)

> Lane substance for the `mobile-ux-nav` lane. Process lives in `roles/shepherd-protocol.md`;
> this file holds the lane's delivery state. Disposable by construction — a fresh shepherd
> pointed here loses only warm cache. Pointers, never copies (live WI state = Cosmo).

## Charter
Improve MentoMate mobile UX and navigation coherence — CTA/button consistency, subject/curriculum
empty-state and Back-navigation correctness, and study↔family entry-surface regressions. "Done" =
every WI in WS-33 Closed via the review gate, with no shell/tab regressions across the shipped
nav flag states (V0-off legacy, V0-on, V1).

## Canon authority
- **Nav gating / tab shapes:** `apps/mobile/src/lib/navigation-contract.ts` (+ `legacy-navigation-contract.ts`).
- **Shell matrix (audience × flag state):** `docs/flows/mobile-app-flow-inventory.md` → "Navigation shell matrix".
- **Target shell direction:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` (V2).
- **Cross-stack Back/`router.push` rules:** AGENTS.md → "Repo-Specific Guardrails" (push the full ancestor chain; `unstable_settings.initialRouteName`).
- **Hard constraint:** no regression to any shipped nav flag state until the V0-retirement ruling (mentor-is-the-app spec §13). Back-navigation and empty-state changes must be verified against all three shell states.
- **Lane review invariant:** canon (navigation-contract + shell matrix) wins over any source plan that diverges from it.

## How to use
Fresh shepherd: read `roles/shepherd-protocol.md`, then this tracker, then `roles/executor/executor-protocol.md`.
The lane is **gated** (see Launch gate) — the workstream is On hold and 6 of 8 WIs are unrefined.
Do **not** dispatch execution-class work until the operator releases the hold via an inbox `directive`.
Until then: prime-and-hold — orient, arm the inbox watcher, and (if the operator directs refinement)
drive Captured→Ready (triage/refine) so the slice reaches DoR.

## Pointers
- **Cosmo Workstream:** WS-33 "Mobile UX & Navigation" — page id `3918bce9-1f7c-81ae-97c1-d15ad8951beb` (Status: **On hold**).
- **Workstreams data source:** `08b3ab36-709d-44af-b78c-5e9f74f6e745`.
- **Work Items DB (data source):** `36fd1119-9955-4684-8bfe-deb145e6a21f` (from `zdx-config.yaml`).
- **Clacks channel:** `_quartet/working/lanes/mobile-ux-nav/_state/{inbox,outbox}.jsonl`.
- **Substrate operating rules:** repo `AGENTS.md`; `_quartet/planning-rules.md`.

## Units / slice (8 WIs — DoR-refined + sequenced 2026-07-02; verified in Cosmo via re-read + Stage watcher)

| WI | Name | Stage | Exec path | Effort | Order |
|---|---|---|---|---|---|
| WI-1204 | Keep homework capture bottom actions above system navigation | Ready | Assisted | — | 100 |
| WI-1208 | Keep pick-book Back inside the Subjects shell | Ready | Assisted | S | 200 |
| WI-1212 | Use book-flip animation for subject curriculum preparation | Ready | Assisted | XS | 300 |
| WI-1210 | Align empty subject states with visible curriculum state | Ready | Assisted | M | 400 |
| WI-1209 | Return subject-hub empty-state Back to Subjects, not Home | Ready | Assisted | S | 500 |
| WI-1248 | Route remaining inline CTA buttons through shared Button (WI-1081 tail) | Ready | Assisted | L | 600 |
| WI-1142 | Add Study→Family switch-CTA regression coverage (BRIDGE-04 path) | Ready | Assisted | S | 700 |
| WI-1184 | Verify/fix child subject route wedging Chrome walkthrough | Refining | Assisted | — | 800 |

> Refinement content: `_state/refinement-proposal.md` (researcher, file:line evidence) as amended by
> shepherd adjudication (below). All 6 Captured → Ready passed the mechanical DoR gate; WI-1184 held
> at Refining (no root cause to author until repro obtained). `Effort` set by the refine executor
> (new mandatory DoR field), shepherd-confirmed.

## Sequence & dependencies (adjudicated — evidence overrode the advisory WP hypothesis)
- **NO Work Package.** The advisory "1208/1209/1210 = one shell surface → one WP" hypothesis was
  **refuted** by file-level evidence — the three touch **disjoint files** (1208
  `pick-book/[subjectId].tsx`; 1209 `subject-hub/[subjectId]/index.tsx` `goBack`; 1210
  `apps/api/src/services/subject.ts` + `use-subject-hub.ts`). Kept as three separate Items.
- **Fully parallel** (disjoint files → isolated worktrees, zero merge risk): WI-1204, WI-1208,
  WI-1212, WI-1210, WI-1248.
- **Soft-serial** WI-1210 → WI-1209: conflicts only if 1210 adds a *new* `emptyKind` value (its AC
  forbids that — precedence-correction only) → parallel-safe in practice; merge 1210 first for safety.
- **WI-1142** — test-only, Jest/Playwright-heavy → execute via **branch checkout, not worktree**
  (repo worktree-Jest-haste pathology). Independent.
- **WI-1248** — rolling **multi-PR** Button sweep by screen-area; independent/low-risk; track as
  background, not a single unit.
- **WI-1184** — repro-blocked, file-disjoint, **blocks nothing** — parked last (800).

## Supervision / escalations
- **Nav changes are regression-sensitive:** every Back/shell/tab change verified against all three
  flag states (V0-off legacy / V0-on / V1). No destructive DB steps in this lane.
- **WI-1208 likely ALREADY FIXED** (`handleBack` already replaces to `/(app)/shelf/[subjectId]`,
  predates WI capture ~6-7 wks) → AC is verify-first; deliverable is a regression test, not a blind
  fix. Don't let a builder "fix" a non-bug.
- **WI-1209 scope constraint:** localize to the empty-state call site — do **not** change the shared
  `goBackOrReplace` helper semantics (blast radius = regression risk to other flag states).
- **WI-1210 behavior rule:** never render "generating/Building curriculum" copy for a non-generating
  empty state; correct precedence within existing `emptyKind` values; microcopy drafted in exec
  (operator may tweak in review) — non-blocking.
- **WI-1184 plan:** attempt the live staging Chrome/CDP walkthrough via a qa/browse executor
  (doppler `-c stg`) when reached; if unobtainable → surface `blocked` (ORION trigger (b)).
- **Tooling note (cross-lane):** `cosmo:triage` (`triage.ts`) auto-detects its judge client via Unix
  `which` → ENOENT-crashes on Windows; workaround `--judge-provider claude` on every triage call.
  Flagged to ORION (affects any Windows agent).

## Current position
Lane activated + **released for autonomous execution** 2026-07-02. Shepherd live, both watchers
armed. Operator ruling: ORION holds full autonomous execution authority for WS-33 — **no operator
go/no-go gate on execution.** Sequence: refine 6 Captured → DoR + sequence (inbox-002), then proceed
straight into the work queue (inbox-003), driving each WI claim→execute→review→close with the live
reviewer. Escalate to operator ONLY for genuine design/product forks or hard blocks.

## Launch gate
**Released** (was: gated on WS-33 On hold). Refine directive `muxnav-inbox-002` + autonomous-execute
directive `muxnav-inbox-003` issued 2026-07-02. No further gate — the shepherd refines, sequences,
then executes without waiting. Residual conditional block: WI-1184 needs a staging repro; if
unobtainable, surface `blocked`.

## Change log
- **2026-07-02** — Lane provisioned by orchestrator (ORION). WS-33 resolved: "Mobile UX & Navigation",
  On hold, 8 WIs (6 Captured / 1 Refining / 1 Ready). Tracker + clacks channel created; shepherd
  (prime-and-hold) + reviewer kickoffs authored; Cosmo-Stage + outbox monitors armed. Awaiting
  operator release directive.
- **2026-07-02** — Released. Operator granted ORION full autonomous execution authority (shepherd
  works for orchestrator; no execute go/no-go gate). Reviewer spawned + live on WS-33. Issued
  `muxnav-inbox-002` (refine 6 Captured → DoR + sequence) then `muxnav-inbox-003` (proceed straight
  into execution, escalate only design forks / hard blocks). Shepherd running.
- **2026-07-02** — **Slice DoR + sequenced.** Dispatched a read-only researcher (whole-slice triage
  → `_state/refinement-proposal.md`, file:line evidence) + a general executor (applied triage/refine
  to Cosmo, re-read-verified). Adjudication: refuted the WP hypothesis (disjoint files → 3 separate
  Items); WI-1208 verify-first (likely already-fixed); WI-1209 localize (don't touch shared helper);
  WI-1210 correctness-anchored copy default (non-blocking); WI-1184 held Refining (repro-blocked,
  parked 800). 6 Captured → Ready, ×100 order assigned, Effort set. No blocking escalation. Entering
  execution wave (builders per order). Checkpoint decision emitted to outbox.

## Execution log (durable — compaction-safe)
- **WI-1212** — ✅ **CLOSED** (reviewer, 2026-07-02 18:44 — first graduation). PR **#1824** merged squash **349a7356905e30a4eab2db0d5ed699142073a62c**; all CI green incl. claude-review APPROVED 0/0/0.
- **WI-1208** — ⚠️ **DOUBLE-BOUNCED, ESCALATED** (parked in Executing). Already-fixed (no new work, pre-existing passing test `pick-book/[subjectId].test.tsx:417-429`). Reviewer /cosmo:qa DoD rejects twice on a genuine already-fixed-vs-DoD gap: (1) completion-summary cited short file paths not resolvable from repo root [fixable: need `apps/mobile/src/app/(app)/…` prefix]; (2) Fixed In needs a commit whose required checks are GREEN, but the historical fix commit 75ace69609 shows a FAILED CI run and there is no new landing PR. Escalated to ORION (outbox mobile-ux-nav-6, needs-orchestrator). **RULED (muxnav-inbox-008, option b):** close as VERIFIED ALREADY-FIXED / not-reproducible; Fixed In stays honest = 75ace69609 (predates WI); green-landing-commit DoD **waived** for this resolution class (reviewer applies), LIVE evidence = passing test on green main. Rejected false-provenance (a) + make-work (c). Re-engaged WI-1208 builder to fix short paths + re-complete per ruling. If /cosmo:review+qa can't express an already-fixed close → tooling gap, park + tell ORION (ORION capturing that gap as a WI). Blocks nothing.
- **Process lesson (ORION):** a verified-already-fixed bug should be closed as not-reproducible at **TRIAGE (verify-first)**, before execute/review, to avoid this DoD dead-end. Apply to future WS-33 verify-first items (e.g. any repro-negative outcome on WI-1184).
- **WI-1283** — NEW, captured (Bug P3, WS-33, Captured, linked 1208/1209) from the WI-1208 verify: `shelf/[subjectId]/index.tsx:55-57` handleBack hardcodes `/(app)/library`, no MODE_NAV_V2 branch (sibling of 1209). Parked (unrefined follow-up; order ~900).
- **WI-1204** — ✅ **CLOSED** (reviewer, 2026-07-02 ~18:50 — AC red-green amendment + re-complete cleared the DoD). PR **#1825** merged squash **267b743f6b616801155af254a0aacfa992781f11**; safe-area inset fix in `camera.tsx`, red-green guard 4 variants; all CI green, claude-review APPROVED w/ 1 non-blocking CONSIDER (logged/deferred).
- **WI-1210** — merged→Reviewing. PR **#1831** merged squash **a8e31d79fb4d3a57d0aa6c2b96ef8cf7ccc5f9f0**; precedence fix in `apps/api/src/services/subject.ts` (in-flight-books query; NO new discriminator), red-green 3 variants; all CI green, claude-review APPROVED 0/0/0. Builder re-engaged to `complete`. Awaiting reviewer close.
- **WI-1209** — building (`.worktrees/WI-1209`, claimant wi1209-builder). Empty-state Back → flag-aware Subjects target; LOCALIZED (do not touch shared goBackOrReplace). AC already carries red-green clause. Dispatched after 1210 merge.
- **Tooling gaps captured by ORION:** WI-1293 (execute.ts complete has no Resolution/not-reproducible flag) + NEW **WI-1296** (append-not-replace deadlock: stale bounced-summary re-flagged by qa) — related WI-1266. Park-on-3rd-bounce STANDS for WI-1208.
- **WI-1142** — merged→Reviewing. PR **#1830** merged squash **c049cc29761fd835790b409297b490926c3284eb**; RQ-backed Jest regression test (strategy a), red-green verified; needed 1 rework round for a claude-review SHOULD_FIX (unguarded `globalThis.fetch` override → wrapped in try/finally), then APPROVED. Builder re-engaged to `complete`.
- **WI-1248** — ⚠️ **PARKED, ESCALATED (mis-refined).** GATE-0 recon refuted my single-PR ruling: AC claims an rg command that doesn't exist; real scope ~94-97 files / ~9 screen-areas, NOT uniform (5 judgment classes in 2 files: new danger sites, py-2.5 sizing, rounded-full shapes, non-button false-positives, flex-1 layout — Button.tsx takes no style/className override + has no danger variant, a prerequisite gap). Builder stood down, NO code written, worktree clean, claim left to expire (no release subcommand; Stage stuck Executing until lease lapses). Scope decision escalated to ORION (outbox mobile-ux-nav-8, needs-orchestrator): (A) decompose→WP+run now / (B) decompose+DEFER to a dedicated design-system pass [recommended] / (C) uniform-subset-now + capture remainder. Blocks nothing.
- **Held:** WI-1209 (soft-dep on 1210 merge), WI-1248 (rolling multi-PR sweep — dedicated effort), WI-1184 (repro-blocked), WI-1283 (unrefined).

## Review-loop notes (rework + systemic fix)
- **WI-1204 rework bounce (2026-07-02 18:23):** reviewer rejected on a MECHANICAL DoD gate — a `Type=Bug` requires the Acceptance-Criteria TEXT to declare a **red-green-revert regression guard** clause naming what the guard asserts. NOT a code defect (guard was built + verified; PR #1825 merged). **Systemic:** refine wrote the same under-specified AC for every Bug (1204/1208/1209/1210). ORION confirmed this maps to tracked **WI-1266** (DoR regression-language check looser than the /cosmo:review Type=Bug guard). **Fix DONE:** general executor appended a red-green-revert clause to the AC of all four Bug WIs (original AC intact, re-read verified); re-completed **WI-1204** (`--fixed-in 267b743f6`) and **WI-1208** (`--fixed-in 75ace69609`, already-fixed) → both back to Reviewing. WI-1209/1210 AC-only (they complete later against conformant AC). No real guard gap anywhere — WI-1208 has a pre-existing passing test. Cross-lane learning emitted (outbox mobile-ux-nav-4/5); ORION directive muxnav-inbox-007 acked.
- **Reviewer IS live + acting** on WS-33 (bounced 1204 + 1208 on the AC gate; both re-completed).
- **Shared-tree note:** main working tree carries ~28 pre-existing uncommitted `apps/api/eval-llm/snapshots/**` diffs (NOT this lane's; do not touch — builders work from origin/main in isolated worktrees, unaffected). Flag only.
