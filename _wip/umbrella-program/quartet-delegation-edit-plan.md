# Quartet Sub-Agent Delegation — Edit Plan (DECISIONS SETTLED 2026-06-19; ready to implement)

> Operator-ratified 2026-06-19 (design thread post-compaction). Source learning:
> `.claude/memory/feedback_quartet_subagent_delegation.md`. Status: **all 5 design points + 3 decisions
> settled; implementation-ready.** Next: author the edits below, then bump the memory to "applied".

## The settled model

1. **Relentless delegation = context-longevity, not token-thrift.** The goal is keeping the
   orchestrator's / shepherd's OWN context window lean → longer autonomous runway before compaction +
   sustained reasoning quality. Delegation often RAISES total tokens (fork copies context; sub-agents
   re-read files) — that is an accepted trade. Self-check = "is *my* window staying lean?", never "did I
   save tokens?"

2. **Typed executors, one umbrella.** "Executor" stays the umbrella term; the shepherd selects a typed
   variant. Type changes the *ceremony*; it NEVER changes the *control rails*. Every profile — builder or
   housekeeper — carries: quality-criteria awareness, process awareness, goal-loop + success criteria,
   Definition of Done, report-back boundary. The 4 profiles (split by two behavioural axes — *mutates
   state?* and *drives a decision?*):

   | Profile | Mutates | Adversarial review | Deliverable |
   |---|---|---|---|
   | **Builder** | production code | yes — Phase-4, fresh session, never a fork, capped 3 | green PR; NEVER merges |
   | **Auditor** | read-only | yes — verify high-stakes findings | findings + `file:line` evidence |
   | **Researcher** | read-only | yes — skeptic pass on load-bearing claims | synthesis + cited sources |
   | **Analyst** | read-only | yes — devil's-advocate on the recommendation | assessment / recommendation |
   | **Housekeeper** | state (Cosmo / docs / files) | **no** — correctness-check only | applied state change, verified |

   Auditor/Researcher/Analyst differ only in goal + deliverable phrasing (same rails: read-only,
   evidence-cited, adversarially-verified) → split as **named profiles co-located in one standard file**,
   shared rails stated once (clarity without 4 drifting docs). Builder keeps its deep doc
   (`executor-protocol.md`). Housekeeper is the one genuinely-different mutating-but-mechanical profile.

3. **Fork sparingly — expensive.** Fresh-brief sub-agent is the default. Use a FORK only when
   briefing-cost > context-copy-cost (task too entangled to brief without loss) AND the work is valuable
   enough to justify the token cost. Fork keeps the *parent's* window lean (tool output never returns) —
   aligned with the goal despite the cost. **Hard carve-out: adversarial review is NEVER a fork** (fresh
   session, no inherited context). A fork must not re-delegate (harness rule); tiering is for fresh agents.

4. **Tiered (nested) delegation allowed**, two rails: (a) every tier carries the brief-standard *down*;
   (b) the parent owns its child's DoD — accountability does not dilute with depth.

5. **Sub-agents are Clacks-blind, by design.** The Clacks is a strict two-party protocol
   (sole-inbox-writer / sole-outbox-writer, JSONL high-water); its reliability rests on the single-writer
   invariant. Sub-agents talk to their **spawner** (brief in → result out); the spawner translates results
   into channel messages. Wiring a sub-agent onto the channel breaks single-writer, lets a child bypass the
   shepherd's DoD-accountability, and bloats the child's window with irrelevant coordination chatter. Even
   long-running sub-agents checkpoint to a **durable state file** the parent reads — never to inbox/outbox.
   The only thing a sub-agent knows about Clacks: *report to your spawner; never write channel files.*

6. **/workflows — scale-tiered standing authorization** (granted, read-only research/audit/sweep only;
   builder/merge excluded). Cost-governed so it's autonomous-by-default with rare human prompts:
   - **Cheap tier (autonomous, no prompt):** bounded read-only sweep — default cap **≤ ~8 agents,
     single-vote verify, ≤ 1–2 loop rounds.** Covers routine work.
   - **Expensive tier (prompt ONCE for a budget grant):** wide fan-out / multi-round loop-until-dry /
     N-vote adversarial panels. The rare edge case.
   - **Caps are agent-count + round based, NOT token-budget alone** — `budget.total` is null with no `+Nk`
     directive, so `budget.remaining()` is Infinity and the budget guard never fires. The hard floor must
     be agent/round counts.
   - **Budget-increase-on-demand, not set-each-time:** run to the envelope autonomously; only on hitting
     the ceiling AND judging more genuinely warranted → request a bump. Prompting stays rare because the
     cheap tier is sized to cover normal sweeps. (Autonomy-first: human prompt = edge-case alternative.)
   - **Cheapest-pattern-first:** single-vote verify, K=1 rounds, unless the finding is high-stakes;
     escalate adversarial depth only with justification.

7. **Orchestrator held to the same bar, with a STRICTER quality carve-out.** As last line of defense the
   orchestrator delegates the *legwork* (evidence-gathering, repro, sweeps) aggressively, but **never
   delegates the ruling** — go/no-go on irreversible/prod/land actions and the strict-green
   land-verification stay in-seat. (Concrete instance: WI-848 #1236 land — gate verified in-seat: pulled
   the allowed-red failing set + the claude-review verdict body personally before merging.)

## The edits (5 targets)

**A. NEW `_wip/identity-foundation/subagent-brief-standard.md`** — the typed-executor standard. Sections:
   1. **Shared control rails** (apply to ALL profiles, every dispatch brief): goal + verifiable success
      criteria (loop-to end-state, not a task list); quality bar (name the specific gates); process
      awareness (repo engineering rules, no suppression); Definition of Done; report-back boundary (exactly
      when to return + what NOT to surface); **Clacks-blind** prohibition; tiering rails (carry the
      standard down; parent owns child DoD).
   2. **Profile: Builder** → short spec + pointer to `executor-protocol.md` for the full Phase-0–7 ceremony.
   3. **Profiles: Auditor / Researcher / Analyst** → read-only (Explore agent or `isolation: worktree`),
      evidence-cited, adversarial verify of high-stakes findings, findings/synthesis/assessment deliverable.
   4. **Profile: Housekeeper** → mutating-state, mechanical, NO adversarial review, but a correctness-check
      (verify the write actually landed).
   5. **Fork guidance** (sparingly; never for review) + **/workflows cost tiers** (point 6).

**B. `_wip/umbrella-program/orchestrator-protocol.md`** — upgrade "orchestrate, don't execute" to a
   **Relentless Delegation** mandate (point 1 framing: context-longevity not token-thrift; in-seat
   execution = failure mode; catch yourself on 3rd+ file read / multi-step probe → dispatch) + the
   **stricter orchestrator quality carve-out** (point 7: delegate legwork, never the ruling). Cross-ref the
   standard (A) and the /workflows tiers (point 6).

**C. `_wip/identity-foundation/shepherd-protocol.md`** — extend "you do not write production code yourself"
   to ALL execution-class work (investigation, repro, analysis, audit sweeps, fix-building); same
   failure-mode framing + safe-boundary; cross-ref the standard (A). Clarify: when handing
   `executor-protocol.md` to a builder, that doc is **builder-only** — non-builder work uses the matching
   profile in (A).

**D. `_wip/identity-foundation/executor-protocol.md`** — add a header line labelling it the **Builder
   profile** deep-doc (one of the typed executors in (A)); point readers to (A) for the non-builder
   profiles + shared rails. No change to the Phase-0–7 builder mechanics.

**E. Kickoff templates** (`_wip/identity-foundation/shepherd-kickoff-template.md`,
   `_wip/umbrella-program/orchestrator-kickoff.md`) — one binding line each so a freshly-spawned role
   internalizes the mandate + the standard pointer from the launcher, not only the protocol body.

Post-land: bump `.claude/memory/feedback_quartet_subagent_delegation.md` to status "applied".

## Notes
These are PRG-05 productionization input (role-scaffolds slated to relocate) — edit the current
authoritative copies. Process docs, NOT ADR-class. Own-work-scope commit (no `git add -A`).
