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

**Precedence:** operator rulings > Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) >
this layer > the type doc > habits.

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
6. **Clacks-blind.** The executor is a strict two-party sub-agent: brief in → result out, to its
   spawner only. It **never** writes `_state/inbox.jsonl` / `_state/outbox.jsonl` (the
   sole-writer orchestrator↔shepherd channel). Even a long-running executor checkpoints to a
   **durable state file the parent reads**, never to a channel file. The only thing an executor
   knows about the Clacks: *report to your spawner; never write channel files.*

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
