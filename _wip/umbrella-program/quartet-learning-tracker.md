# Quartet Learning Tracker

> **Purpose.** Holding pen for Quartet-*mechanics* learnings extracted from `.claude/memory/`
> on **2026-06-20**, to be folded into the `_quartet/` system during PRG-05 productization.
> This is the productization input — NOT live protocol. **FREEZE-safe** (a live-tracking file, not
> a frozen protocol doc).
>
> **Provenance tags** per entry: `[drained→deleted]` = source memory fully captured here and removed;
> `[residual-kept]` = source memory ALSO retains non-Quartet value, left in `.claude/memory/` for
> separate review (see the manual-review list in the extraction report).
>
> **Merges applied:** 3 clusters collapsed (E2, E7, E8). One stale contradiction resolved in E8.
> The 2 borderline memories (`feedback_commit_skill_bare_push_worktree`,
> `feedback_code_review_should_fix`) were deliberately **left out** of this pass.

---

## A. Delegation & sub-agents

### E1 — Relentless delegation + typed sub-agent profiles
**Learning.** Orchestrator AND shepherds must push execution onto sub-agents whenever it's safe to do
so without compromising quality; every sub-agent brief carries crystal-clear goal-loops, adversarial
review, quality bar, and DoD.
**Why.** In-line execution by an orchestrator/shepherd fills its context window fast → constant
operator hand-holding + sharp LLM-reasoning-quality drop; structured hand-off to goal-looped,
adversarially-reviewed sub-agents is materially more reliable.
**Current application.** `_wip/identity-foundation/subagent-brief-standard.md` (shared rails + 5 typed
profiles: Builder / Auditor / Researcher / Analyst / Housekeeper); wired into `orchestrator-protocol.md`
(Relentless-Delegation mandate + orchestrator quality carve-out: *delegate the legwork, never the
ruling*), `shepherd-protocol.md` (no-self-execution across all execution-class work),
`executor-protocol.md` (labelled Builder-only), both kickoff templates.
**Settled design points.** fork sparingly (token-expensive, never for review); sub-agents are
Clacks-blind (report to spawner, never write channel files); `/workflows` = scale-tiered standing
authorization for read-only sweeps (cheap tier autonomous ≤~8 agents/≤2 rounds; expensive tier prompts
once).
**Target `_quartet/` home.** Delegation chapter / `subagent-brief-standard`.
**Provenance.** `feedback_quartet_subagent_delegation` `[drained→deleted]`.

### E2 — Sub-agent review-delegation rule (MERGE: rule + enforcement)
**Learning.** Pick the build tool by suitability (no fork-only mandate): `fork` for context-heavy
implementation, `Explore` for read-only search, `general-purpose` for briefed bounded work. But
**adversarial review is STRICTLY a fresh, no-context session — a fork is DISALLOWED for review**
(it inherits the author's conclusions and rubber-stamps them; evidence: both WI-811 review forks
restated the author's status report instead of refuting it). The reviewer sees only the artifact +
attack vectors, never the author's reasoning; the implementer never reviews its own work.
**Enforcement caveat.** A `fork` spawned WITHOUT isolation runs in the parent's cwd and inherits edit
tools, so "read-only" is NOT enforced (a review fork once edited the worktree despite the instruction).
Enforce read-only with `isolation:"worktree"` OR the `Explore` agent type (no Edit/Write). If a
non-isolated fork does edit, treat its edits as UNTRUSTED: kill, re-verify+own each change, re-run the
proof on the final state.
**Harness gotcha (kept for general value).** Launching a fork with `isolation:"worktree"` PINS the
parent session cwd into `.claude/worktrees/agent-*` → Edit/Write then refuse shared-checkout paths;
write MAIN/_state via Bash+python absolute paths until un-pinned.
**Apply.** Build tool by fit; review = fresh no-inheritance agent (diff + vectors only); partition
parallel implementation into disjoint file sets; NO-GIT for sub-agents (shepherd commits).
**Target `_quartet/` home.** Delegation chapter → "review delegation" + a harness-caveats appendix.
**Provenance.** `feedback_fork_delegation_separate_adversarial_review` `[drained→deleted]` +
`feedback_adversarial_fork_isolation` `[residual-kept]` (retains the cwd-pinning harness fact).

### E3 — Dispatch CI-failure repro against a fresh `origin/main` worktree
**Learning.** A sub-agent told to "reproduce/classify this CI failure" runs against the *session's*
local checkout, which on this shared tree can be behind `origin/main` → it sees different code/line
numbers than the failing run and confabulates causation (WI-808: blamed a PR that never touched the
files).
**Apply.** For any CI-repro, dispatch the agent against a fresh worktree from `origin/main` and make it
confirm `git rev-parse HEAD` == the failing run's commit before trusting anything; pull the real CI job
log (`gh run view --job <id> --log-failed`) as primary source; spot-verify the pivotal claim via
`git show origin/main:<file>` before relaying. Static analysis at the *correct* commit beats
reproduction at the *wrong* one.
**Target `_quartet/` home.** Delegation chapter → "dispatching CI work".
**Provenance.** `feedback_subagent_stale_local_repro` `[residual-kept]` (retains general shared-checkout
/ primary-source-CI-log method).

---

## B. Orchestrator / shepherd machinery

### E4 — Standard layered lane machinery; no bespoke kickoffs
**Learning.** Lane execution uses a standard, layered machinery — use it, don't reinvent per lane.
**Lineage (don't invert):** `nexus/_WIP/wi-execute.md` = operator's raw manual *example* → the
standardized `executor-protocol.md` is the *official distilled version* (NOT an "embryo").
**Layers:** lane `execution-tracker.md` (entry point) → `shepherd-protocol.md` → `executor-protocol.md`
→ thin per-dispatch pointer-briefs → a **thin kickoff launcher** ("read these + the lane tracker,
shepherd PRG-NN accordingly"). There is NO bespoke per-lane kickoff doc; reusable launcher template at
`_wip/identity-foundation/shepherd-kickoff-template.md`.
**Two standard shepherd musts** (every lane): (1) the reviewer/watcher is a SEPARATE session (currently
Codex) — the shepherd does NOT own/wire it; (2) the shepherd runs its OWN Cosmo monitor on its
workstream's WI Stages to catch verdicts (Closed vs rework→Executing). **DoD = Cosmo Close, not a green
PR.**
**Executor model/effort.** Default Sonnet/standard; escalate a unit to Opus only when the *reasoning*
is hard (not by severity).
**Why.** PRG-10 authored a bloated bespoke kickoff + mislabeled the protocol as "embryo" → three rounds
of confusion before the operator pointed at the clean standard machinery.
**Target `_quartet/` home.** Lane-activation chapter.
**Provenance.** `feedback_shepherd_kickoff_role_split` `[drained→deleted]`.

### E5 — Compaction-handover MUST mandate protocol re-read (not just state)
**Learning.** An orchestrator/shepherd compaction handover must mandate re-reading
`orchestrator-protocol.md` + `program-roster.md` + `planning-reference.md` (+ role protocols when
standing up a lane) — not just the anchor + channel tail.
**Why.** The anchor says *where things stand*; the protocol says *how to act*. A state-only handover
guarantees the resumed session reinvents the machinery — the documented 2026-06-18 drift (ad-hoc Cosmo
REST archaeology, nearly hand-rolled a lane).
**Apply.** Every handover carries a 🔴 MANDATORY RE-READ list at the top, ordered:
(1) orchestrator-protocol, (2) roster, (3) planning-reference, (4) anchor + Cosmo + channel tail,
(5) `{shepherd,executor,reviewer}-protocol` + kickoff templates when standing up a lane. The Approach-D
`SessionStart` hook injects this for the orchestrator role (belt-and-suspenders).
**Target `_quartet/` home.** Orchestrator chapter → compaction/resume.
**Provenance.** `feedback_compaction_handover_reread_protocol` `[drained→deleted]`.

### E6 — Monitor hygiene (= WI-850)
**Learning.** Verdict/outbox/Cosmo-Stage monitors are session- AND host-scoped — a reboot or
session-end kills them silently, after which "no events" is indistinguishable from "nothing changed."
**Mechanisms to defend against:**
- **Silent death** → spot-check Cosmo directly; re-arm after any restart; never trust prolonged silence.
- **Differ baseline blind spot** → a freshly-armed differ baselines on its first read and misses a
  transition that already happened or lands within its first poll → after ANY finalize/Stage-write,
  explicitly RE-READ the verdict once; keep the monitor for *subsequent* changes only.
- **Two-channel gap** → the Clacks/inbox monitor watches orch↔shepherd MESSAGES only and is BLIND to
  Cosmo Stage → run a SEPARATE persistent Cosmo-Stage watcher.
- **Silent expiry** → a Monitor-tool instance is non-persistent by default and expires silently at its
  timeout mid-session (not just on reboot) → `persistent:true` mandatory + dup-stopped.
**Target pattern.** persistent Cosmo-Stage monitor + direct-read Stage at every finalize/close GATE +
a central orchestrator reviewer-transition backstop (> per-shepherd luck).
**Target `_quartet/` home.** Clacks/monitor-hygiene chapter.
**Provenance.** `feedback_monitor_silence_not_health` `[residual-kept]` (retains general Monitor-tool
behavior facts usable outside the Quartet).

---

## C. Review / verify invariants

### E7 — reviewer≠executor + premise-verify + completeness-sweep (MERGE)
**Two same-session incidents (2026-06-19), cutting opposite ways — scrutinize BOTH directions.**
- **WI-823 — reviewer caught what the executor missed.** Shepherd + builder + a fresh Explore skeptic +
  a primary-source spot-check ALL concluded "no gap," but scoped to the edge-WRITE/auth path; the
  separate reviewer found a REAL gap in the recap-READ path (`getRecapForParent` didn't forward `opts`
  to `getChildSessionDetail`, `services/recaps.ts:305-310`). Executor-side verification scopes to the
  path it reasoned about; a different consumer can drop the same guard.
- **WI-825 — the reviewer misfired.** Bounced 3× on a broken harness (Windows-doppler-on-Mac runner +
  parser misreads + append/cumulative-parse), NOT a substantive finding.
**Principles.** (a) reviewer≠executor is the load-bearing close invariant — never round an executor's
confident "no-defect/no-op" verdict up to done; (b) a bounce is not automatically real either — read
the reviewer's actual words, corroborate, distinguish code-finding from tooling artifact; (c) **GATE-0
premise-verify before building**: for any directed "live error" fix, trace each legacy read UP to its
entry point and confirm no caller-level flag branch routes elsewhere — if the fix already exists, STOP
and report, do NOT fabricate a no-op (ponytail rung 1); (d) a "no-gap"/fix verification must be
COMPLETE — when the AC names N variant surfaces, sweep ALL of them and ALL sibling call sites of the
guard (the "3+ sibling locations" drift class), not just the first paths checked.
**Institutionalized as** a mandatory GATE-0 ("premise reproduces on current `main` before ANY fix; else
report, don't build").
**Target `_quartet/` home.** Reviewer chapter (independence invariant) + executor chapter (GATE-0 +
completeness sweep).
**Provenance.** `feedback_reviewer_backstop_catches_executor_misses` `[drained→deleted]` +
`feedback_verify_directive_premise_before_build` `[residual-kept]` (retains the general
verify-premise-before-building discipline).

---

## D. Cosmo / ZDX autonomous-review interface (the reviewer leg of the Quartet)

### E8 — Finalizing a WI through the autonomous review loop (cross-ref; consolidated elsewhere)
This is **ZDX-lifecycle knowledge used by any agent**, not Quartet-only, so it is NOT a `_quartet/`
protocol concern. The three source memories were **drained 2026-06-20 into one consolidated runbook**:
`_wip/umbrella-program/cosmo-finalization-guide.md` (the source memories are now deleted). It is the
**reviewer leg of the Quartet**; productization should fold that guide into the **cosmo/zdx skill docs**
with a Quartet cross-ref.
**One net-new synthesis to carry forward** (a contradiction the sources disagreed on): the older
"`execute complete` is unusable, use `replace_content`" is **superseded** — `complete` IS the path when
the `completion-summary.md` is parser-conformant (`Title:` colon-format sections, single-line
`**Caveats / Follow-ups:**`, no bare filenames/UUIDs/counts in prose); `replace_content` was the v0.1.0
workaround. Keep this resolution; drop the "unusable" framing.
**Provenance.** The three `cosmo_*` memories — `[drained→deleted]` (consolidated into
`cosmo-finalization-guide.md`, 2026-06-20).

---

## E. Shepherding lessons (from a graduated lane)

### E9 — Reusable shepherd-lane lessons
- **Type=Bug DoD needs a red-green-revert regression guard, declared up front.** ZDX `/cosmo:review`
  bounces a `Type=Bug` that ships the fix without a durable guard + cited red-green-revert evidence —
  even when AC/symptoms pass. Put "add a persistent guard + demonstrate RED pre-fix, GREEN post-fix,
  cite it" in the Bug-executor brief to avoid a guaranteed rework cycle. (Hygiene/Documentation WIs
  don't hit this.)
- **Adjudicate reviewer/Codex findings against the WI's AC, not in the abstract**; an operator can clear
  a content gate + defer polish, and the separate reviewer honors logged deferrals.
**Target `_quartet/` home.** Shepherd chapter → review/merge-gate lessons.
**Note — repo-CI facts NOT extracted here.** The repo-level CI facts originally in this lane memory
(docs-PR `paths-ignore` unmergeable; merge-on-UNSTABLE; the `session/index.test.tsx` ambient flake) are
NOT Quartet mechanics — they remain in the repurposed `project_prg14_agent_instructions_lane` memory
(repo-CI gotchas), candidates for AGENTS.md.
**Provenance.** `project_prg14_agent_instructions_lane` `[residual-kept]` (lane snapshot dead; shepherd
lessons extracted here; repo-CI facts retained in the memory).
