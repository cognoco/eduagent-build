# Sub-Agent Brief Standard — Typed Executor Profiles

**What this is.** The authoritative brief standard for all executor sub-agents dispatched in the
Quartet machinery. Every dispatch brief — regardless of executor profile — must wire the shared
control rails below; the profile sections specialize ceremony and deliverable only. Cross-lane
standard; lives alongside `shepherd-protocol.md` and `executor-protocol.md`.

**Precedence:** operator rulings > Cosmo lifecycle rules (AGENTS.md + `cosmo` skills) > this
standard > profile-specific protocol > habits.

---

## 1. Shared control rails (apply to ALL profiles, every brief)

Every dispatch brief must specify these six elements, regardless of profile type:

1. **Goal + verifiable success criteria.** State the end-state, not a task list. The executor
   loops until the success criteria hold — it does not hand back "I ran the steps." Weak criteria
   ("make it work") require constant clarification; strong criteria ("all tests green, PR at
   `mergeStateStatus=CLEAN`, no valid must-fix findings") close the loop.

2. **Quality bar — name the specific gates.** Name the exact checks that must pass (lint,
   typecheck, test suite, CI job names, review-check name). The executor may not soften these —
   no `eslint-disable`, no suppression, no private redefinition of "green."

3. **Process awareness.** Point the executor at the repo engineering rules (`AGENTS.md`) and
   any lane-specific notes (tracker, plan block). Executors do not derive rules from scratch;
   they follow what the brief cites.

4. **Definition of Done.** One unambiguous DoD statement — the condition the executor asserts
   before reporting back. The parent (shepherd / orchestrator) owns its child's DoD;
   accountability does not dilute with nesting depth.

5. **Report-back boundary — exactly when, exactly what NOT to surface.** The executor reports:
   (a) pre-destructive-step pause, (b) success (DoD met), (c) blocked or escalation-needed.
   Everything else stays inside the run — no progress narration, no play-by-play, no FYI lines.

6. **Clacks-blind.** The executor is a strict two-party sub-agent: it reports only to its
   spawner (brief in → result out). It **never** writes to `_state/inbox.jsonl` or
   `_state/outbox.jsonl` — those are the sole-writer-invariant orchestrator↔shepherd channel.
   Not even a long-running executor checkpoints to channel files; it writes a durable state file
   the parent reads. The only thing an executor knows about the Clacks: *report to your spawner;
   never write channel files.*

**Tiering rails.** Tiered (nested) delegation is allowed. Every tier carries this standard
*down* to the next level (include the shared rails in a nested brief). The parent owns its
child's DoD — accountability does not dilute with depth.

---

## 2. Profile: Builder

Mutates production code. Ceremony-heavy; adversarial review mandatory.

**Short spec:** Claim before coding · isolated worktree (`.worktrees/WI-NN`) · write an
implementation plan before touching code · implement + durable checkpoint every ~4 minutes ·
Phase-4 adversarial review (fresh session, never a fork, max 3 rounds) · PR to green ·
`/cosmo:execute complete` (→ Stage=Reviewing). Authority ends at the green-PR report — NEVER
merges, NEVER self-grants a check exception.

**Full ceremony:** `executor-protocol.md` (Phase 0–7). A dispatch brief for a builder points
there. When the shepherd's kickoff or brief references `executor-protocol.md`, that doc is
**Builder-only** — non-builder work uses the matching profile section in this file, not that doc.

---

## 3. Profiles: Auditor / Researcher / Analyst

Read-only. Explore agent or `isolation: worktree` — no production-code writes. Evidence-cited,
adversarially verified.

The three profiles share the same rails; they differ only in goal framing and deliverable:

| Profile | Goal | Adversarial verify | Deliverable |
|---|---|---|---|
| **Auditor** | Find violations / gaps in the codebase or process | Yes — verify high-stakes findings (fresh session, no inherited context) | Findings report with `file:line` evidence per finding |
| **Researcher** | Answer a question by synthesizing sources | Yes — skeptic pass on load-bearing claims | Synthesis + cited sources |
| **Analyst** | Assess options and recommend a course of action | Yes — devil's-advocate on the recommendation | Assessment + named recommendation with rationale |

All three: no `file:line`-less claims; no speculation beyond cited evidence; adversarial review
is a **fresh session** (never a fork, which inherits context and cannot give an independent read).

---

## 4. Profile: Housekeeper

Mutates non-code state: Cosmo properties, doc files, config, channel entries. Mechanical and
deterministic — the target state is fully specified in the brief; judgment is not the deliverable.

**No adversarial review** — but a **correctness-check is required:** the executor verifies the
write actually landed (re-read the property / file / entry and confirm the expected value is
present) before reporting back. This substitutes for review: if the write silently failed or
produced a wrong value, the housekeeper catches it in-run.

Do NOT write to Clacks channel files (`_state/inbox.jsonl` / `_state/outbox.jsonl`) even when the
task is a channel operation — the sole-writer invariant applies; the spawner does the channel
write.

---

## 5. Fork guidance + /workflows cost tiers

### Fork guidance

Use a **fresh-brief sub-agent** by default. Reserve a fork for the rare case where briefing-cost
genuinely exceeds context-copy-cost (task too entangled to brief without loss) AND the work
justifies the token expense. Keeping the parent's context window lean is the goal
(**context-longevity, not token-thrift**) — delegation often raises total tokens; that is an
accepted trade.

**Hard carve-outs:**
- Adversarial review is **never** a fork — it requires a fresh session with no inherited context.
- A fork must not re-delegate (harness rule); tiering applies to fresh agents only.

### /workflows cost tiers (read-only / audit / sweep only; builder/merge excluded)

| Tier | When autonomous | Cap |
|---|---|---|
| **Cheap (autonomous, no prompt)** | Default | ≤ ~8 agents, single-vote verify, ≤ 1–2 loop rounds |
| **Expensive (prompt once for a budget grant)** | Wide fan-out / multi-round / N-vote adversarial panels | Operator-granted budget ceiling |

- Caps are **agent-count + round based**, not token-budget alone (`budget.total` is null by
  default → `budget.remaining()` is Infinity; the hard floor must be agent/round counts).
- **Budget-increase-on-demand, not set-each-time.** Run to the envelope autonomously; request a
  bump only when the ceiling is hit AND more work is genuinely warranted.
- **Cheapest-pattern-first.** Single-vote verify, K=1 rounds unless the finding is high-stakes;
  escalate adversarial depth only with justification.
