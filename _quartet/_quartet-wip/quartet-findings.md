# Quartet Findings — machinery

Improvement candidates for the **reusable `_quartet/` system** (Brain `roles/`, Library `library/`,
`clacks/`, `planning-rules.md`). This is the hand-off surface for the ZDX/Quartet stream: at critical
mass the operator converts these to work items against the machinery's owner. **Scope rule:** only
gaps in the *reusable* system live here; this-deployment state/mess lives in `repo-findings.md`.

**The common shape.** Nearly every entry is one defect: **the reusable Brain over-commits to
deployment specifics** — it hard-names instance paths/ids and assumes a single-owner, finite-lane,
fully-hydrated world. **Fix pattern: refer to _bindings_, not _instances_** — the program layer
(kickoff) supplies roster location, monitor identity, lane scope, hook home.

**Open machinery set:** F1/F16 (literal roster path), F2/F6 (anchor read-in-full + unbounded),
F3 (dated-filename convention), F5 (shared-tree commit + push/land scope), F7 (findings surface
undiscoverable), F10 (no standing-lane lifecycle), F11 (monitor output-file hygiene), F17 (monitor id
un-keepable across jobs), F18 (no scoped/observer boot), F13-residue (no home for the session-start
hook), F29 (master-DB enumeration has no binding). **Promoted from memory (2026-07-01):** F19 (agent isolation / single-writer on a shared tree),
F20 (CI-repro at the failing commit), F21 (verify-at-source + shepherd conformance-review), F22
(sub-agent checkpoint cadence + no-git), F23 (shepherd completion gates), F24 (cutover/switch-flip
owner in plans). **Category B (may not be Quartet):** F25 (refine-inspects-code → ZDX DoR), F26
(PR-on-done → estate/Cosmo). **From the learning-tracker:** F27 (reviewer invariants — never fork for
review), F28 (ZDX/Cosmo finalize lifecycle — may not be Quartet).

**Validated (held under dogfood — do NOT "fix"):** Brain is orient-sufficient off `roles/` +
`planning-rules.md` alone; four-roles / altitude invariants / 8-step lane-activation are legible as
written; the hook's **channel-tail reconciliation** is the best single design element (makes a stale
anchor non-fatal); the `working/README.md` snapshot-staleness warning works; Relentless Delegation
kept orchestrator context lean exactly as mandated.

---

### F1 / F16 — The reusable Brain hard-names a literal working-state path (headline)
`orchestrator-protocol.md` (Orient-on-resume **and** the 🔴 mandatory re-read block) and
`planning-rules.md` (Document map) all name a **literal** `working/program/program-roster.md` as a
required read. The generic, portable Brain cannot carry the one per-instance fact — *where this
program's working state actually lives* — so today it's closed only by the hook's injected binding
line, and a non-hooked / greenfield launch reaches for a blank template by construction. **Fix:** make
the working-state *location* a binding the **orchestrator kickoff** owns (it's per-instance anyway);
the protocol/planning-rules refer to "the roster (location = deployment binding)", never a path; the
hook stays the mechanism for hooked resumes. *(F1 = 06-29 orient; F16 = re-confirmed on the 07-01 cold
boot — same defect, merged.)*

### F2 / F6 — "Read the anchor IN FULL" + unbounded anchor growth
Orient step 1 mandates reading the world-state anchor **in full**; the anchor is
newest-session-prepended and accretes without bound (~115k tokens on 06-29 → ~297 KB on 06-30, ~2.5×
in a day). That directly fights the lean-context mandate the protocol opens with, and the machinery has
no anchor-hygiene / rotation discipline. **Fix:** current-state-at-top + archive prior session blocks
to a sibling, or a structured roll-up the hook tails (as it already does for channels) instead of
"read in full."

### F3 — Dated handoff filename is a legibility trap (minor)
The anchor is updated in place but its filename carries a fixed date; mtime-based `ls -t` picks the
right file, but the stale-looking name invites distrust. **Fix:** rename on refresh, or drop the date
from the handoff filename (a convention for the artifact).

### F5 — No shared-tree commit-scope guidance
The Quartet's model is multiple concurrent role-sessions sharing one substrate/checkout. A commit flow
that stages "what's dirty" instead of "what THIS session authored" is structurally unsafe there — seen
live, a dirty-sweep staged 29 files from a co-active session (incl. working-tree-only `_state/` +
hook files) before it was caught. **Fix:** Quartet commit guidance mandates explicit-pathspec staging
(never `add -A` / dirty-sweep) for any shared-tree session; or per-session worktrees so the ambiguity
never arises. (`_state/` + the hook dir are working-tree-only by design — never staged by anyone;
operator ruled NO on gitignoring `_state/`, 06-28.) **Extends to push/land:** on a worktree whose
upstream tracks a shared integration branch, a **bare `git push` fast-forwards that shared branch
directly**, bypassing the per-WI PR / review / merge gate — always push an explicit refspec
`HEAD:<wi-branch>`; landing into the shared branch stays an orchestrator/operator act via PR, never an
executor's push. *(from memory: feedback_commit_skill_bare_push_worktree)*

### F7 — The dogfood findings surface is undiscoverable
Nothing in orient-on-resume, the protocol, or README bootstrap tells a fresh session to read/append
the findings log — so two independent actors nearly created a *second* findings file, fragmenting the
very signal it exists to consolidate. A capture surface no protocol points at fragments by
construction. **Fix:** list the findings files in README layout + the orient-on-resume read list
(and/or the orchestrator kickoff).

### F10 — Lifecycle model has no steady-state for a standing (non-graduating) lane
planning-rules describes start → active → graduated/parked/killed, and §2.8's close ceremony assumes
*finite* work. A **standing lane** (Operations / Bug Lane) never graduates, so §2.8 never fires — the
standard defines no steady-state management for it (checkpoint cadence, relocation window, how it
differs from a finite Initiative). **Fix:** add a standing-lane lifecycle, incl. an operator-gated
quiescent-window relocation (its channels/monitors are live, so mid-flight moves are unsafe).

### F11 — monitor-hygiene governs watchers but not their stale output files
The spec reconciles *watchers* and never addresses the derived output/cache files a watcher writes into
`_state/` (TTL, clear-on-re-arm, or mark-as-derived). A reader can mistake a stale output file for
current truth. **Fix:** add an output-file discipline to monitor-hygiene.

### F17 — Reconcile ritual can't "keep" a monitor across a job boundary
monitor-hygiene's reconcile has a "keep — refresh its task-id" branch, but Monitor watches are
**job-scoped**: a fresh orchestrator in a new job sees none of the prior job's monitors in `/tasks`, so
reconcile after any job change always resolves to "replace all," and stored `task-id`s carry no
cross-session value. **Fix:** say so explicitly — the manifest's durable worth is its *intent rows*,
not the ids.

### F18 — No scoped / observer boot mode
The protocol's orient + monitor-hygiene assume the booting orchestrator **owns every active lane** (arm
a central backstop + per-active-lane watchers), yet the kickoff simultaneously says stay arm's-length
from lanes you weren't asked to drive. No mode exists for an orchestrator handed a lane *subset* or a
read-only/observer boot. **Fix:** let orient scope be a named lane subset, arming monitors only for
owned lanes.

### F13-residue — No defined home for the program-level session-start (rehydration) hook
The Library/clacks defines the hook's *content* (monitor-hygiene: "reconcile, don't re-arm") but never
*where it lives*, so a deployment can nest a program-wide hook inside one lane's `_state/` (the state
symptom is `repo-findings.md` F13). **Fix:** give the session-start hook a defined program-level slot.

---

## Promoted from operator memory (2026-07-01)

Machinery lessons that were living in this repo's operator memory (`.claude/memory/`). Folded here so
the Quartet owner can institutionalize them into the Brain/Library; the **source memory can retire once
the machinery lands the fix** — provenance tagged per entry.

### F19 — Agent isolation & single-writer discipline on a shared tree (executor layer)
On a shared checkout, sub-agent fan-out is unsafe by default: (a) a `subagent_type:"fork"` launched
**without** isolation runs in the parent cwd and **inherits Edit/Write — a "read-only" instruction is
not enforced** (use the `Explore` type, which has no write tools, or `isolation:"worktree"`); (b) **>1
writer agent on one worktree races** the index/edits; (c) a spawned writer fleet is
**orphaned-but-alive when its parent is killed** and keeps editing. **Fix (executor-protocol / spawn
economics):** parallel rollout = read-only Explore mappers → a SINGLE applier, or one
`isolation:worktree` per writer; never >1 writer per tree; after any agent kill, direct-scan for live
descendants + recent edits before declaring quiescent. **Harness caveat:** launching a fork with
`isolation:"worktree"` PINS the parent session cwd into `.claude/worktrees/agent-*`, after which
Edit/Write refuse shared-checkout paths — write via Bash + absolute paths until un-pinned. *(from
memory: feedback_adversarial_fork_isolation, feedback_orphan_writer_fleet_survives_parent_kill)*

### F20 — CI-failure repro must run at the failing commit, not the shared local tree (executor dispatch)
On a shared checkout local `main` lags `origin/main`; CI runs at the merge commit, so reproducing or
analyzing a failure against the stale local tree sees different code and **confabulates causation**.
**Fix (executor dispatch brief):** repro from a fresh worktree at the failing commit (`git rev-parse
HEAD` == the run's SHA), pull the real CI job log as primary source, spot-verify pivotal claims via
`git show origin/main:<file>`. *(from memory: feedback_subagent_stale_local_repro)*

### F21 — Verify at primary source; sub-agents fabricate evidence (executor GATE-0 + shepherd conformance-review)
Two facets of one rule. (a) Before building a **directed** fix, verify its premise at source — a "live
error" often rests on a grep that missed a caller-level guard branch; if the fix already exists, stop
and report, don't fabricate a no-op (executor **GATE-0**). (b) Sub-agent **appliers fabricate
citations** (cite twin test files that don't exist) and mis-classify seams; they are NOT trusted to
self-cite/self-classify — a **shepherd conformance-review before integration** (verify each cited file
with `git ls-files`, seed real seams) is the load-bearing net. **Fix:** bake GATE-0 into every executor
brief and a mandatory conformance-review into the shepherd loop. **Completeness (tracker E7):** a
"no-gap"/fix verification must be *complete* — when the change names N variant surfaces, sweep ALL of
them AND all sibling call sites of the guard (the "3+ sibling locations" drift class), not just the
first paths checked. *(from memory: feedback_verify_directive_premise_before_build,
feedback_applier_fabricates_citations; + tracker E7)*

### F22 — Sub-agent checkpoint cadence + no-git-from-subagents (dispatch rails)
Long-running sub-agents that return findings only in chat lose the work if the thread fails. **Fix
(dispatch rails):** any agent expected to run >~4 min checkpoints partial results to a durable,
coordinator-named file every ~4 min and returns its path (research/review → a checkpoint note;
implementation → its actual file changes); sub-agents do **not** commit/stage/push by default —
own-work land stays with the coordinator. *(from memory: feedback_agent_checkpoint_cadence)*

### F23 — Shepherd completion gates for zero-code re-completion; builders must not self-complete (lifecycle)
A bounced WI that looks "zero-code" (feature already on `main`, empty PR diff) must NOT be re-completed
on that basis alone: the reviewer's close gate also checks **no unresolved review finding in landed
source** AND the cited `Fixed In` commit's **own `main` rollup is green**. And **builders must not
self-run `/cosmo:execute complete`** — lifecycle is shepherd-owned; a per-WI Stage monitor's
Executing→Reviewing alarm catches a premature builder completion. **Fix:** encode both gates in the
shepherd / reviewer protocol. *(from memory: feedback_shepherd_zerocode_completion_gates)*

### F24 — Replace/rewrite plans must name a cutover (switch-flip) owner (planning-rules)
Build-new plans naturally enumerate construction + securing work but let **caller migration / the
switch-flip** fall out — "remove legacy readers" reads as cleanup when it is actually migrating every
caller. **Fix (planning-rules):** at plan ratification ask *which unit makes the system USE the new
thing, and which owns the data/state convergence at the flip?* — if none answers both, a wave is
missing. Corollary: piecemeal merges only under the single-live-store invariant (new paths inert until
one atomic convergence); no partial per-domain activation. *(from memory: feedback_plan_cutover_ownership)*

### F25 — Refinement must inspect current code before promoting a WI to Ready *(may be ZDX DoR, not Quartet-role machinery)*
Refining a Cosmo WI toward `Ready` must inspect the **current affected code/docs**, not just fill Cosmo
fields against the mechanical DoR gate — a fields-only refine produced a too-shallow `Ready`/`Auto`
classification (2026-06-21, 10 WIs). Before `--to-ready`: identify likely affected files from
title/AC/source-links, read the current surface, base AC + Execution Path on that; if scope can't be
bounded, leave `Refining` or classify `Assisted`. **Home caveat:** this reads as a **ZDX
Definition-of-Ready** discipline more than a Quartet role-scaffold rule — route to the ZDX/DoR owner.
*(from memory: feedback_cosmo_refine_requires_code_inspection — Category B)*

### F26 — Open a PR when a WI's work is done, without a separate prompt *(estate/Cosmo workflow — may not be Quartet)*
After a WI has a verified commit + branch push + `/cosmo:execute complete`, open the GitHub PR (default
draft) before reporting done — don't wait for a separate "create PRs" prompt. **Home caveat:** this is
an operator **workflow/handoff preference** for this estate's Cosmo→PR flow, not reusable Quartet-role
machinery; it could inform a shepherd close-flow step but likely belongs in repo/estate conventions.
*(from memory: feedback_cosmo_done_creates_pr — Category B)*

---

## Promoted from the Quartet learning-tracker (2026-07-01)

Net-new findings extracted from `_wip/umbrella-program/quartet-learning-tracker.md` (the PRG-05
productization holding-pen). Its other entries were already captured or shipped: **E3** = F20, **E6** =
`monitor-hygiene.md`, **E5** = the orchestrator-protocol 🔴 re-read block, **E1/E4** = the
Relentless-Delegation mandate + lane-activation ceremony already wired into the protocols. Only the
below were not yet on this surface.

### F27 — Reviewer quality invariants: never fork for review; the reviewer catches what the executor's scoped verify misses (reviewer chapter)
Sharpens the shipped reviewer≠executor invariant with three field-proven rules. (a) **Adversarial
review must be a fresh, no-context session — a `fork` is disallowed for review**: it inherits the
author's conclusions and rubber-stamps them (both WI-811 review forks restated the author's status
instead of refuting it); the reviewer sees only the artifact + attack vectors. (b) **The reviewer
catches cross-consumer gaps executor-scoped verification misses** — WI-823: shepherd + builder + a
fresh skeptic all concluded "no gap" scoped to the write/auth path, but the separate reviewer found a
real gap in a *different* read-path consumer; never round an executor's confident "no-defect" up to
done. (c) **A bounce is not automatically a real finding either** — read the reviewer's actual words
and distinguish a code-finding from a tooling artifact (WI-825 bounced 3× on a broken test harness,
not a defect); adjudicate findings against the WI's **AC**, and honor logged operator deferrals.
*(from tracker E2/E7/E9)*

### F28 — ZDX/Cosmo review-loop lifecycle *(system-related; may NOT be Quartet-role machinery — likely ZDX/Cosmo skill docs)*
Two lifecycle rules from dogfooding the reviewer leg; flagged because their home is the **ZDX/Cosmo
skill layer**, not the Quartet role-scaffold, but system-relevant per operator instruction. (a)
**`/cosmo:execute complete` IS the finalize path** when the `completion-summary.md` is parser-conformant
(`Title:` colon-format sections, single-line `**Caveats / Follow-ups:**`, no bare filenames/UUIDs/counts
in prose) — the older "`complete` is unusable, use `replace_content`" is a superseded v0.1.0 workaround;
drop that framing. (b) **A `Type=Bug` DoD needs a declared red-green-revert regression guard** up front
— `/cosmo:review` bounces a Bug that ships a fix without a durable guard + cited RED-pre-fix/GREEN-post-fix
evidence, even when AC/symptoms pass (put it in the Bug-executor brief). Full runbook:
`_wip/umbrella-program/cosmo-finalization-guide.md`. *(from tracker E8/E9)*

---

## From the 2026-07-01 cold re-boot (dogfood)

### F29 — The kickoff mandates enumerating the master DB but supplies no enumeration binding
Boot step 3 (launcher + kickoff §2) tells a cold orchestrator to "read the [Initiatives] DB for the
live initiative set; do not trust a hardcoded list." Live from a genuine cold boot: `notion-fetch` on
the DB container returns **schema + view config only, zero rows** — it cannot enumerate. Row
enumeration needs the *bulk-query* tools (`query_data_sources` / `query_database_view`), which are
plan-gated in this deployment (the environment fact = `repo-findings.md` **F14**). So the instruction
is **unfollowable as written**, and the kickoff is internally contradictory: it ships a §3 hardcoded
orientation snapshot AND says read the DB AND says distrust hardcoded lists — with no working
enumeration path bridging them. **Machinery gap (distinct from F14's environment fact):** the reusable
kickoff treats "enumerate the master of record" as a free capability. **Fix (same common shape):** the
program-layer kickoff owns an **enumeration binding** — either a maintained page-ID index location it
names, or an explicit "enumerate via `notion-search` (lossy/capped), then per-page `notion-fetch`"
fallback with its limits stated — so "read the master" is actionable without assuming bulk-query.
Refer to a binding, not a capability.
