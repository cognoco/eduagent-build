# Quartet Productionization Audit

Date: 2026-06-29
Audience: the agent who prepared `_quartet/`
Scope: `_quartet/` as a reusable Quartet product, compared against the organic system documented under `_wip/umbrella-program/` and `_wip/identity-foundation/`.

> **Status (historical — bootstrap fixes since applied).** The first-run / bootstrap gaps this audit
> raised have been addressed: blank program + lane templates (`working/**/*.template.*`), the
> dependency register + prerequisite guard (`dependencies.md`), and the snapshot-trap fix
> (`working/README.md`). The reviewer/monitor *substrate* items (durable lease, structured
> review-result envelope, runner adapter) remain open and are tracked as reviewer-leg productization
> (Cosmo/ZDX stream) — see `dependencies.md`. Read this audit as the rationale, not the current gap list.

## Executive summary

The main problem is not that `_quartet/` failed to copy the old organic system faithfully. Faithful copying is not the goal. The main problem is that `_quartet/` is still closer to an extracted documentation bundle than a self-contained operating product.

The biggest MVP blocker is the first-run path. The README says a fresh orchestrator can recreate the program's operational self - roster, dashboard, activation queue, lane channels, and role launches - but `_quartet/` does not yet provide enough executable or procedural detail for a fresh agent to do that reliably without remembering the original `_wip` program. The role protocols are strong, but the product surface around bootstrap, reviewer/monitor operation, durable state, and Cosmo dependency handling is not yet complete.

Recommended sequencing:

1. Fix Quartet's system-product gaps now.
2. Treat the active Cosmo/ZDX preparatory work as an explicit dependency.
3. Do not execute cutover or old-path rewiring yet.
4. Circle back to cutover planning after the parallel Cosmo/ZDX stream settles and Quartet's MVP surface is hardened.

## What Quartet already captures well

`_quartet/` captures the core operating model in a much cleaner shape than the organic source:

- `README.md` separates role scaffolds, library artifacts, Clacks support, examples, and working state.
- `roles/orchestrator-protocol.md` names the Quartet stack as ZDX -> Cosmo -> Clacks -> Quartet and defines the orchestrator as the program-level control point above Cosmo workstreams.
- `roles/orchestrator-protocol.md` defines a lane activation checklist covering initiative registration, Cosmo workstream creation, WI capture, channels, shepherd kickoff, review loop, outbox watcher, roster, queue, and dashboard.
- `roles/shepherd-protocol.md` keeps the two-gate loop: implementation PR gate, then Cosmo close/review gate.
- `roles/reviewer-protocol.md` preserves the reviewer as a separate quality gate.
- `roles/executor/` starts turning "executor" into typed surfaces instead of a single overloaded role.
- `clacks/monitor-hygiene.md` captures an important lesson from the organic system: monitor silence is not health, and standing monitors need manifest/reconcile discipline.

This is the right direction. The issue is not conceptual weakness. The issue is that the bundle does not yet meet the user's MVP bar:

> A fresh agent pointed to the orchestrator protocol should be able to set itself up and orchestrate the system, including instructing the operator how to set up shepherd agents, review agents, and related monitors.

Today, a strong agent can infer the rest. A fresh agent cannot rely on `_quartet/` alone.

## Main problem: `_quartet/` does not yet have a complete bootstrap contract

The README promises more than the package operationally delivers.

The key promise is in `_quartet/README.md`: after receiving the kickoff, the orchestrator should be able to recreate the program's operational self - roster, dashboard, activation queue, lane channels, and role launches. The protocols tell the orchestrator what must exist, but they do not yet give a complete first-run procedure for creating it.

The gap shows up in several ways:

1. `working/` is explicitly a copied point-in-time surface, not an authoritative product template. `_quartet/working/README.md` says the included roster/dashboard are snapshots and that `lanes/` is intentionally empty.
2. The orchestrator activation checklist says to create channels, launch shepherds, arm review loops, arm outbox watchers, and update roster/queue/dashboard, but `_quartet/` does not yet provide a single "from blank directory to running lane" runbook.
3. The launch boundary between operator and orchestrator is under-specified. The orchestrator protocol says the operator spawns the orchestrator, but the orchestrator also needs to instruct the operator how to spawn shepherds, reviewers, monitors, and possibly executor agents.
4. The package does not yet distinguish clearly between:
   - canonical system files,
   - reusable templates,
   - live working state,
   - copied historical examples,
   - old `_wip` pointers kept only for provenance.
5. The package still includes some historical references in examples and copied working artifacts. That is acceptable during extraction, but the MVP bootstrap path must not require the fresh agent to know which old pointers are live and which are archaeological.

### Required fix

Add a first-run bootstrap surface. It can be one file or several, but it needs to be explicit enough that an agent can follow it without having been present for the organic build.

Minimum viable shape:

- `_quartet/START_HERE.md` or a stronger top section in `_quartet/README.md`.
- A blank program-state template set:
  - `working/program/program-roster.template.md`
  - `working/program/activation-queue.template.md`
  - `working/program/dashboard.template.md` or dashboard generation instructions
  - `working/lanes/<lane-slug>/_state/` layout instructions
  - expected `inbox.jsonl` / `outbox.jsonl` / monitor manifest paths
- A first-lane procedure:
  1. establish program root,
  2. create or identify Cosmo Workstream,
  3. capture WIs/WPs or link existing ones,
  4. create lane channel state,
  5. prepare shepherd kickoff,
  6. prepare reviewer/monitor setup,
  7. update roster/queue/dashboard,
  8. perform a resume/reconcile check.
- Operator instructions:
  - what to paste to a new orchestrator,
  - what to paste to a shepherd,
  - what to paste to a reviewer,
  - what environment variables and repo location are required,
  - what a successful launch should report back.
- A "do not proceed if" section:
  - no Cosmo access,
  - no workstream page ID,
  - no monitor state path,
  - unclaimed live WI already executing,
  - reviewer/monitor dependency work not yet landed.

This is the highest-leverage repair because it turns Quartet from "good extracted knowledge" into an operable product.

## Biggest MVP blocker: reviewer and monitor substrate is still PoC-grade

The reviewer/monitor leg is the riskiest part of MVP because it owns the quality gate. If it misses a review transition, double-launches a reviewer, replays stale state, or accepts an unclearable completion summary, the whole Quartet promise degrades.

The organic system already identified this as unfinished productionization work:

- `_wip/identity-foundation/review-loop-productization-handoff.md` lists no durable state, no lease/lock, no structured review result, prompt-level overrides, polling/event-source limitations, runner abstraction gaps, no backpressure model, and review worker isolation risks.
- `_wip/umbrella-program/supporting-artefacts/mechanism-productionization-design-input.md` asks for watcher lease, durable de-dupe state, bounded concurrency/backpressure, runner-adapter contract per role, structured review-result envelope, structured override policy, bounce contract, and close-evidence contract.
- `_wip/umbrella-program/spike-agnosticity/finding.md` says the runner seam must force write-capable Codex execution into a throwaway worktree using `codex exec --cd <worktree> -s workspace-write`, and should prefer direct `codex exec` for review with read-only isolation.

`_quartet/clacks/review-watcher.ts` is better than the original hard-coded watcher, but it remains a productization bridge, not a sufficient MVP substrate by itself:

- It defaults output to `/tmp/cosmo-watch`, which is not durable program state.
- It keeps transition/de-dupe state in process memory.
- It shells out to `codex exec` directly and hard-codes a runner mode instead of exposing a clear runner adapter contract.
- It has no durable lease model preventing multiple authoritative watchers.
- It has no structured review-result envelope.
- It handles overrides as config/prompt text, not as a first-class policy/result object.

### Required fix

Do not wait for the full industrial version, but add an MVP reviewer/monitor contract that is explicit, testable, and honest about limitations.

Minimum MVP contract:

- A document such as `_quartet/clacks/reviewer-monitor-contract.md`.
- A durable state location under the program or lane, not `/tmp`, for:
  - last seen stage per WI,
  - transition key/de-dupe history,
  - running review launches,
  - monitor manifest,
  - watcher logs.
- A lease rule:
  - exactly one authoritative Cosmo-stage watcher per program or declared workstream set,
  - how to acquire/refresh/release the lease,
  - how a resumed orchestrator detects stale or duplicate watchers.
- A transition key definition:
  - include WI id,
  - previous stage,
  - new stage,
  - modified timestamp or stage-transition evidence,
  - enough data to allow re-finalize/re-review after a bounce.
- A structured reviewer result envelope:
  - disposition,
  - evidence gathered,
  - commands run,
  - Cosmo mutation made,
  - override used,
  - required follow-up,
  - reviewer runtime,
  - source WI id and completion summary anchor.
- A bounce contract:
  - where findings are written,
  - how claim release is handled,
  - what Stage/State transition is expected,
  - how shepherd/orchestrator are notified.
- A runner adapter contract:
  - command template,
  - cwd/worktree isolation,
  - sandbox level,
  - read-only review default,
  - failure and timeout behavior,
  - stdout/stderr/log capture.
- An operations checklist:
  - start watcher,
  - stop watcher,
  - reconcile watcher,
  - force re-read Cosmo at close/finalize boundary,
  - recover after compaction/session restart.

This can initially wrap the existing `review-watcher.ts`. The key is that the product contract must exist and the implementation must not pretend ephemeral process memory is enough.

## Parallel-stream status and dependency handling

There is active or intended parallel work in Cosmo/ZDX that should influence Quartet, but it should not block every Quartet improvement.

Observed via Cosmo API at `2026-06-29T07:44:01Z`:

### Cosmo improvements workstream

The `WI-888` through `WI-894` set is in the `Cosmo improvements` workstream, not the `NEX/ZDX improvements` workstream. Current observed state:

- `WI-888 (Cosmo: reviewer reads only the latest completion summary (parser robust + re-finalize clearable))` - Stage=Ready, State=Active.
- `WI-889 (Cosmo: execute complete should author Fixed In (dod hard-requires non-empty))` - Stage=Refining, State=Active.
- `WI-890 (Cosmo: reviewer watcher de-dupe key skips re-finalize; DB-query monitor lags/replays stale)` - Stage=Refining, State=Active.
- `WI-891 (Cosmo reviewer: respect advisory/continue-on-error red lanes in closure-verification)` - Stage=Refining, State=Active.
- `WI-892 (Cosmo: execute complete append + qa whole-body parse causes unclearable finalize deadlock)` - Stage=Closed, State=Active.
- `WI-893 (Cosmo: refine.ts cannot promote a childless Work Package)` - Stage=Closed, State=Active.
- `WI-894 (Cosmo: capture.ts should auto-chunk Acceptance Criteria over 2000 chars)` - Stage=Ready, State=Active.

The same workstream also includes:

- `WI-836 (Update Cosmo skill mechanical checks for childless Work Packages)` - Stage=Captured, State=Active.
- `WI-837 (Update Cosmo skill docs and re-sync bundled downstream copies)` - Stage=Captured, State=Active.
- `WI-887 (Fold Cosmo WI finalization runbook into cosmo/zdx skill docs)` - Stage=Ready, State=Active.

The observed records did not show live claim fields at that time. That does not prove no parallel session is working; it only means the Cosmo claim fields did not reflect it when checked. Treat this as a coordination warning: if those sessions are executing, they should keep Cosmo claims current so Quartet does not encode stale assumptions.

### NEX/ZDX improvements workstream

The `NEX/ZDX improvements` workstream is open and contains broader ZDX ontology and propagation work:

- `WI-404 (Promote the repo-local writing-plans skill to a global ZDX-level plan skill)` - Stage=Backlog, State=Parked.
- `WI-439 (Build sync mechanism for estate-global rules snippet across machines)` - Stage=Backlog, State=Parked.
- `WI-448 (Build the ZDX rule/skill propagation engine (.agents->.claude generation + snippet injection + cross-machine cascade))` - Stage=Backlog, State=Parked.
- `WI-519 (Promote eduagent doc-layer + decisions-layer model into the ZDX standard (incubating))` - Stage=Backlog, State=Parked.
- `WI-590 (Design the estate work-system object ontology - top-down x bottom-up, planning x execution, primitive shape and terminology)` - Stage=Captured, State=Active.
- `WI-750 (Amend NEX-ADR-0012 isolation-matrix: test secret-listing, not folder-enumeration)` - Stage=Captured, State=Active.
- `WI-834 (Evaluate adding an Effort/Estimate property to Cosmo Work Items)` - Stage=Captured, State=Active.
- `WI-835 (Rewrite ZDX standard for two-layer planning/execution ontology + childless WP)` - Stage=Captured, State=Active.
- `WI-838 (Provision the Cosmo Planning DB (Initiative/Epic/Story))` - Stage=Captured, State=Active.
- `WI-839 (Wire Cosmo planning-to-execution relations (realized-by + spawns))` - Stage=Captured, State=Active.
- `WI-840 (Resolve remaining ontology threads: terminology/_Avoid_ + Item-rename eval + planning substrate)` - Stage=Captured, State=Active.
- `WI-852 (Disentangle Initiative (effort) from the persistent-system concept and name it)` - Stage=Captured, State=Active.

These matter because Quartet is meant to be portable across the ZDX estate and closely linked to Cosmo. Do not hard-code current ontology assumptions in Quartet if the NEX/ZDX stream is actively changing those primitives. Instead, write Quartet's contracts against stable concepts:

- Work Item
- Workstream
- Stage
- State
- Execution Path
- claim
- reviewer disposition
- evidence
- role launch
- monitor event

Where terminology is in flux, include a "ZDX terminology compatibility" note and point to the current ZDX standard as the source of truth.

## Cutover: explicitly defer

Do not fold old-path cutover into the immediate Quartet hardening pass.

There is a separate `_wip/umbrella-program/quartet-cutover-plan.md`, and it correctly frames cutover as a later atomic repoint/retire operation. It also says the designer does not execute the cutover. Keep that separation.

Reasons to defer:

1. The Cosmo CRs are a forward dependency for the reviewer leg.
2. NEX/ZDX ontology and planning/execution substrate work may change the exact shape Quartet should target.
3. `_wip` still contains live operational/session files, not only historical source material.
4. `_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh` still hard-codes old `_wip/umbrella-program` paths and is a live referrer.
5. A premature sweep risks breaking running sessions while also forcing `_quartet` to encode moving assumptions.

Immediate rule for the Quartet author:

- Improve `_quartet/` as a system product now.
- Do not repoint live hooks, delete old files, or mark `_wip` artifacts retired now.
- Add notes where `_quartet` intentionally waits on Cosmo/ZDX work.
- After those dependencies land, rerun the cutover sweep and update the cutover plan.

## Other system improvements to make now

### 1. Add an MVP readiness checklist

Create `_quartet/MVP-CHECKLIST.md` or include a checklist in `README.md`.

It should answer:

- Can a fresh orchestrator start from `_quartet/roles/kickoffs/orchestrator-kickoff.md`?
- Can it identify canonical system files?
- Can it create blank working state?
- Can it activate a lane?
- Can it instruct the operator to launch a shepherd?
- Can it instruct the operator to launch a reviewer or watcher?
- Can it recover after compaction/resume?
- Can it reconcile monitor state?
- Can it detect when Cosmo/ZDX dependencies are not satisfied?
- Can it avoid touching cutover-only files?

### 2. Make source/template/example boundaries unmistakable

Right now, `_quartet/working/` and `_quartet/examples/` contain useful historical material, but a fresh agent can confuse copied state with canonical setup instructions.

Recommended labels:

- `system/` or `roles/`: canonical reusable protocols.
- `templates/`: blank or reusable files for new programs and lanes.
- `examples/`: historical examples, never authoritative.
- `working/`: optional live instance state, not source of truth for the product.

If directories stay as-is, add prominent headers to each file class.

### 3. Add a dependency register

Create `_quartet/dependencies.md`.

Minimum content:

- ZDX standard version expected.
- Cosmo properties Quartet relies on.
- Cosmo lifecycle assumptions.
- Clacks channel assumptions.
- Required secrets/env vars for watchers.
- Required runner commands and runtimes.
- Known pending dependencies:
  - `WI-888 (Cosmo: reviewer reads only the latest completion summary...)`
  - `WI-889 (Cosmo: execute complete should author Fixed In...)`
  - `WI-890 (Cosmo: reviewer watcher de-dupe key skips re-finalize...)`
  - `WI-891 (Cosmo reviewer: respect advisory/continue-on-error red lanes...)`
  - `WI-894 (Cosmo: capture.ts should auto-chunk Acceptance Criteria...)`
  - relevant NEX/ZDX ontology items such as `WI-835 (Rewrite ZDX standard for two-layer planning/execution ontology + childless WP)`, `WI-838 (Provision the Cosmo Planning DB...)`, and `WI-839 (Wire Cosmo planning-to-execution relations...)`.

### 4. Promote the reviewer result from prose to data

Even before the watcher is fully productized, define a JSON shape. Markdown summaries can remain human-readable, but the orchestrator needs machine-checkable outputs.

Suggested fields:

```json
{
  "schema": "quartet.review_result.v1",
  "wi": "WI-000",
  "workstream": "WS-000",
  "reviewerRuntime": "codex",
  "disposition": "approve|bounce|blocked|manual",
  "evidence": [],
  "commandsRun": [],
  "cosmoMutations": [],
  "overridesApplied": [],
  "findings": [],
  "followUps": [],
  "timestamp": "ISO-8601"
}
```

This does not need to be perfect. It needs to exist so watcher, reviewer, shepherd, and orchestrator all target the same output.

### 5. Document runner isolation as a hard contract

The agnosticity spike found that write-capable Codex executors must force cwd into the throwaway worktree. Quartet should elevate that into role-launch policy:

- executors write only in their assigned worktree,
- reviewers default read-only,
- reviewer runtime should differ from executor runtime when practical,
- root-pinned companion/task wrappers are not acceptable for write-capable execution unless they enforce cwd and sandbox explicitly,
- runner adapters must validate arguments instead of passing stray flags into prompt text.

### 6. Add "fresh agent drills"

The best verification for Quartet MVP is not a unit test. It is a dry run:

1. Start a fresh agent with only `_quartet/roles/kickoffs/orchestrator-kickoff.md`.
2. Ask it to initialize a dummy program in a scratch directory.
3. Ask it to prepare a shepherd kickoff for a fake workstream.
4. Ask it to prepare reviewer watcher configuration.
5. Ask it to explain what it cannot do without Cosmo credentials.
6. Check whether it reaches for old `_wip` paths.

If it cannot do this cleanly, Quartet is not yet MVP-ready.

## Suggested repair plan for the Quartet author

### Phase 1 - Bootstrap surface

Deliverables:

- Add `START_HERE.md`.
- Add blank working-state templates.
- Update README to point first-run users to the bootstrap path.
- Add explicit operator instructions for spawning orchestrator, shepherd, reviewer, and watcher roles.

Acceptance criteria:

- A fresh agent can initialize a dummy program/lane without reading `_wip`.
- Historical examples remain accessible but cannot be mistaken for canonical setup.

### Phase 2 - Reviewer/monitor MVP contract

Deliverables:

- Add reviewer monitor contract.
- Add durable state layout.
- Add structured review-result schema.
- Update `review-watcher.ts` documentation and defaults to point at durable program state.
- Document lease/de-dupe/recovery rules.

Acceptance criteria:

- A fresh orchestrator can explain how many watchers should exist and where their state lives.
- A resumed orchestrator can reconcile monitors from a manifest.
- A reviewer result can be consumed without parsing ad hoc prose.

### Phase 3 - Dependency register and compatibility notes

Deliverables:

- Add `_quartet/dependencies.md`.
- Capture live dependencies on Cosmo and ZDX.
- Mark pending Cosmo improvements and NEX/ZDX ontology items as external dependencies.

Acceptance criteria:

- Quartet does not encode moving assumptions as permanent doctrine.
- The author can update one dependency register after the parallel stream lands.

### Phase 4 - Cutover planning return point

Do not execute now.

When the parallel stream is stable:

- rerun old-path reference sweep,
- update `_wip/umbrella-program/quartet-cutover-plan.md`,
- repoint live hooks deliberately,
- retire old docs only after confirming no running sessions rely on them,
- re-run the fresh-agent drill against `_quartet/` alone.

## Bottom line for the Quartet author

Your extraction did the hard conceptual work: Quartet now has named roles, protocol boundaries, typed executor surfaces, Clacks support, and a cleaner map than the organic system ever had.

The next pass should not be a cutover pass. It should be a productization pass:

- make first-run bootstrap real,
- make reviewer/monitor operation durable enough for MVP,
- make Cosmo/ZDX dependencies explicit,
- make examples unmistakably non-authoritative,
- define what "MVP-ready" means in checkable terms.

After that, cutover can be planned and executed as a separate operation.
