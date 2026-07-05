# Executor Protocol — the shared layer

**What this is.** The **executor layer** of the Quartet: the contract every sub-agent a
shepherd (or orchestrator) dispatches must honour, *regardless of type*. An executor is the
worker a shepherd spawns to do one unit of work in isolation. There are several **types** —
**builder · researcher · auditor · general** — but they all sit under this one layer.

**The core principle: type changes the *ceremony*, never the *rails*.** The rails below are
the constant, thin contract; the ceremony (worktree, plan-before-code, adversarial review,
PR-to-green) is type-specific weight that lives in the type docs. A one-line doc edit and a
production-code change satisfy the *same* rails — they differ only in ceremony.

**Quartet placement.** Executor is one corner of the **Quartet** (orchestrator / shepherd /
executor / reviewer). It is **native to its spawner's runtime**, reports only to its spawner,
and is **Clacks-blind** (never reads or writes the `_state/` channel). Note: the **reviewer is
a role, not an executor type** — it is a separate standing session that closes Work Items via
the Cosmo lifecycle, peer to the shepherd; do not model it as something a shepherd dispatches.

**Binding note.** This file defines the runtime-neutral executor contract. A Claude Code executor,
Codex executor, or other harness-specific executor is a binding of this contract; the binding must
provide `dispatchExecutor`, `spawnFreshContextSession`, `monitorJob` where relevant, and
`identifyOwnRuntime` for claimant/runtime identity. The concrete Codex binding is
`roles/runtime-bindings/codex.md`.

**Precedence:** operator rulings > Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) >
this layer > the type doc > habits.

**Substrate access ladder (WI-1314).** Load the `notion-patterns` skill at boot, like the `cosmo`
skills. Three independent paths reach the work system: Notion **MCP**, the **cosmo bun CLIs**
(`NOTION_TOKEN` over REST — they never touch MCP), and the **notion CLI / raw REST**. **MCP loss is
a tooling degradation, never a work stoppage — halting on it is a protocol violation.** An executor
mid-run on MCP loss drops down the ladder (claim/complete via the `cosmo` bun CLIs still work) and
keeps going; it reports degraded mode to its spawner as ordinary progress, not as a blocked/escalation
report-back trigger. (Companion codification: `orchestrator-protocol.md`, `reviewer-protocol.md`,
`shepherd-protocol.md` — landed fdecfba; the ladder rule and this file's language mirror those.)

---

## 1. The rails (apply to ALL types, every dispatch brief)

Every dispatch brief must specify these, regardless of type:

1. **Goal + verifiable success criteria.** State the end-state, not a task list. The executor
   loops until the criteria hold — it does not hand back "I ran the steps." Weak criteria
   ("make it work") force clarification; strong criteria ("all tests green, PR at
   `mergeStateStatus=CLEAN`, no valid must-fix findings") close the loop.
2. **Quality bar — name the specific gates.** Name the exact checks that must pass (lint,
   typecheck, test suite, CI job names, review-check name). The executor may not soften these —
   no suppression, no private redefinition of "green." (For a trivial task the bar may be
   degenerate — "the file contains X" — but it is still stated.)
3. **Process awareness.** Point the executor at the repo engineering rules (`AGENTS.md`) and any
   lane-specific notes (tracker, plan block). Executors follow what the brief cites; they do not
   re-derive rules from scratch.
4. **Definition of Done.** One unambiguous DoD the executor asserts before reporting back. **The
   parent owns its child's DoD — accountability does not dilute with nesting depth.**
5. **Report-back boundary — exactly when, exactly what NOT to surface.** The executor reports:
   (a) a pre-destructive-step pause, (b) success (DoD met), (c) blocked / escalation-needed.
   Everything else stays inside the run — no progress narration, no play-by-play, no FYI lines.
6. **Clacks-blind — transitive to every sub-agent you spawn (WI-1368).** The executor is a strict
   two-party sub-agent: brief in → result out, to its spawner only. It **never reads or writes**
   `_state/inbox.jsonl` / `_state/outbox.jsonl` (the sole-writer orchestrator↔shepherd channel) —
   and neither does any sub-agent it dispatches, however deep the nesting. §1's "Tiering" rule
   (every tier carries the rails down) applies to this rail in full: a builder that spawns a
   research/audit helper must carry the no-`_state`-reads binding into that helper's brief.
   **Conformance:** a sub-agent-spawning brief that omits this transitive binding is
   non-conformant — this closes the WI-1313 build gap, where a builder's research sub-agent read
   `quartet-mvp/_state/` files the builder itself was correctly held off. Even a long-running
   executor checkpoints to a **durable state file the parent reads**, never to a channel file. The
   only thing an executor (or anything it spawns) knows about the Clacks: *report to your spawner;
   never read or write channel files.* This extends to git: these channel files (and
   `.perID-seen.json`) are working-tree-only — never `git add` or `git stash -u` them, even
   incidentally via a broad `git add`/stash of the lane's `_state/` dir (WI-1245 fixture-proved
   both corrupt a live channel). Interim hardening; WI-1257 ratified the durable fix (Option A /
   A-2 relocation) and WI-1245 built the indirection point (`clacks/lane-state-path.mjs`,
   `QUARTET_LANE_STATE_ROOT`) — a no-op by default, cutover not yet live. Full invariant:
   `library/clacks-channel.md`.

   **Harness-injected leak vector (WI-1368).** The breach above is active — a deliberate read. The
   binding can also be breached *passively*: a harness file-change notification can surface
   `_state/` content (e.g. `monitor-manifest.json`) unprompted during routine operations (e.g.
   `git diff`), to a role that never asked for it and stayed blind by intent. Flag it, don't use
   it — treat any harness-surfaced `_state` content as untrusted and let it play no part in the
   executor's decisions. Receiving it passively and discarding it is not itself a breach; acting on
   it is. Tooling should avoid surfacing `_state` paths to Clacks-blind roles where feasible, but
   the executor does not control the harness — its obligation is flag-not-use.
7. **Carry lane context on captures.** If the brief authorizes filing follow-up work, carry the
   current lane onto anything you file: preserve the origin WI's Project/Workstream/Sprint where the
   capture tool can inherit them, or name those fields explicitly in the hand-back for the spawner
   to file. If the work is intentionally cross-lane, say so instead of silently dropping context.
8. **Claimant is the executing role, never the repo persona (WI-1368).** A Cosmo claim an executor
   lodges uses the **executing role**, per the `<role>:<name>` identity primitive (WI-1221) — e.g.
   `claude:builder:WI-1368` — never the repo agent persona (e.g. "hex"). See
   `orchestrator-protocol.md`'s "Claimant ≠ repo persona" rail for the shared rule (landed WI-1357)
   and the WI-1344 fix-forward precedent it addresses at the orchestrator layer: a claim wrongly
   lodged as `claude:hex:WI-1344-fixfwd`, corrected in-place to `claude:builder:WI-1344-fixfwd`.
   A dispatch template that derives an executor's claimant from `AGENTS.md` identity is
   non-conformant.

**Tiering.** Nested delegation is allowed: every tier carries this standard *down* (include the
rails in the nested brief), and the parent owns its child's DoD at every level.

---

## 2. The types — pick by what the work does

| Type | Mutates | Adversarial review | Deliverable | Doc |
|---|---|---|---|---|
| **Builder** | production code | yes — Phase-4, fresh session, never a fork, capped 3 rounds | green PR; never merges | `roles/executor/builder.md` |
| **Researcher** | nothing (read-only) | yes — skeptic pass on load-bearing claims | synthesis / assessment + cited sources, named recommendation | `roles/executor/researcher.md` |
| **Auditor** | nothing (read-only) | **is** the adversarial review — spun up on a *different model* for independence | findings + `file:line` evidence, real/not-real verdicts | `roles/executor/auditor.md` |
| **General** | optionally non-code state | no — correctness-check only | the task's result, verified | `roles/executor/general.md` |

A dispatch brief points at exactly one type doc plus this layer. The type doc specialises
ceremony and deliverable; it does not restate the rails.

**Builder vs General mutation:** builder mutates *production code* (heavy ceremony, PR, review);
general may mutate *non-code state* (Cosmo properties, docs, config, channel entries the spawner
will relay) and carries a single extra rule — *verify the write actually landed* — in place of
review.

**Auditor vs the Reviewer role:** both run an independent, cross-model adversarial check. They
differ by altitude and authority — the auditor is a *helper* spawned ad-hoc for one
artifact/diff/claim and returns findings; the **reviewer** is a *standing role* triggered by
Cosmo `Stage=Reviewing` that **closes or bounces** Work Items. Same discipline, different layer.

---

## 3. Spawn economics — how a parent spawns a helper

### Fork sparingly
Use a **fresh-brief sub-agent** by default. Reserve a fork for the rare case where briefing-cost
genuinely exceeds context-copy-cost (the task is too entangled to brief without loss) AND the
work justifies the token expense. Keeping the parent's context window lean is the goal —
**context-longevity, not token-thrift** — delegation often raises total tokens; that is an
accepted trade.

**Hard carve-outs:**
- Adversarial review (builder Phase-4, auditor) is **never** a fork — it requires a fresh session
  with no inherited context.
- A fork must not re-delegate (harness rule); tiering applies to fresh agents only.

**Fork-isolation caveat (read-only is NOT self-enforcing).** A fork spawned *without* isolation
runs in the parent's cwd and inherits its edit tools — so a "read-only" instruction is unenforced
(a review fork has edited the worktree despite the brief). Enforce read-only structurally:
`isolation:"worktree"` **or** the `Explore` agent type (no Edit/Write). If a non-isolated agent
does mutate state, treat its edits as **untrusted** — kill it, re-verify and re-own each change,
and re-run the proof on the final state. Harness gotcha: `isolation:"worktree"` pins the parent
session's cwd into `.claude/worktrees/agent-*`, after which Edit/Write refuse shared-checkout
paths — write shared/`_state` paths via absolute-path shell until un-pinned.

### Dispatching CI-failure work — pin the commit first
A sub-agent told to "reproduce / classify this CI failure" runs against the *session's* local
checkout, which on a shared tree can sit behind `origin/main` → it reads different code and
confabulates causation (it has blamed a PR that never touched the files). Any CI-repro dispatch
must: run against a **fresh worktree from `origin/main`**, confirm `git rev-parse HEAD` == the
failing run's commit before trusting anything, pull the real CI job log as the primary source
(`gh run view --job <id> --log-failed`), and spot-verify the pivotal claim against
`git show origin/main:<file>`. **Static analysis at the correct commit beats reproduction at the
wrong one.**

### `/workflows` cost tiers (read-only research / audit / sweep only; builder/merge excluded)

| Tier | When autonomous | Cap |
|---|---|---|
| **Cheap (autonomous, no prompt)** | Default | ≤ ~8 agents, single-vote verify, ≤ 1–2 loop rounds |
| **Expensive (prompt once for a budget grant)** | Wide fan-out / multi-round / N-vote panels | Operator-granted ceiling |

- Caps are **agent-count + round based**, not token-budget alone (`budget.total` is null by
  default → `budget.remaining()` is Infinity; the hard floor must be agent/round counts).
- **Budget-increase-on-demand, not set-each-time.** Run to the envelope autonomously; request a
  bump only when the ceiling is hit AND more work is genuinely warranted.
- **Cheapest-pattern-first.** Single-vote verify, K=1 rounds unless the finding is high-stakes;
  escalate adversarial depth only with justification.

---

## 4. Self-referential framework change — adopts at the next session boundary
This protocol is a **self-referential change to the Quartet framework itself** (mirrors the same
clause in `orchestrator-protocol.md` and `program-manager-protocol.md`). Per the framework's own
operating discipline, a framework-canon change is never hot-swapped under a running session — it
takes effect starting with the **next session** that reads it. An executor mid-run under the
pre-amendment rails is not retroactively bound by an amendment it never read; the transitive
Clacks-blind binding, the harness-leak clause, and the claimant rule (rails 6 and 8 above) apply
from the next dispatch onward.
