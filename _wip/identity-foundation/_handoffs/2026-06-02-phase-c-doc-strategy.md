# Handoff — Identity Foundation, **Phase C (doc-strategy decision)**

**For:** a fresh session. **Task:** execute **Phase C** of the identity-foundation initiative — the
doc-strategy decision. This is a **Track-2** task that runs in parallel with the B-product PM session
(which is being run *separately* — not by you). Repo: `eduagent-build` (cwd
`/Users/vetinari/nexus/_dev/eduagent-build`).

## Read these first (in order)

1. `_wip/identity-foundation/ROADMAP.md` — the runway, phases table, **"Execution model — parallel tracks"**
   section, and decision log. This is the spine.
2. `_wip/identity-foundation/README.md` — folder index + earlier decision log.
3. Then skim the pilot artifacts listed under "Pilot evidence" below.

Project rules live in `CLAUDE.md` / `.ruler/AGENTS.md`. The initiative's own glossary is the repo
`CONTEXT.md` (identity section) — but note the ontology is the canonical model, not CONTEXT.md.

## What Phase C must decide (its exit gate)

From the ROADMAP phases table — Phase C, deliverable = **an ADR** (and *where that ADR lives* is itself part
of the decision), owner = "You + Claude". Exit gate, four calls:

- **(a) chunk-vs-monolith** — keep the chunked-doc structure or consolidate to a monolith.
- **(b) PRD-rebuild-vs-separate-doc** — rebuild the PRD into the chosen structure, or keep the anchored-spine
  PRD as a standalone doc.
- **(c) the repo-wide rollout call** — does the pilot structure roll out beyond this folder, or stay local.
- **(d) where ADRs / the ontology ultimately live** — the ontology's §6 explicitly defers "fold into
  `CONTEXT.md` vs stay beside it" to Phase C; ADR `0001` carries a placement note saying the canonical ADR
  home (`docs/adr/` repo-wide?) is a Phase-C call. Resolve both.

**Central operating principle (ROADMAP):** *"Pilot, not commitment — every structural choice here is reversible
until Phase C ratifies it."* So the chunked structure you'll be studying is a **trial**, not a settled state —
do not treat it as a given; C is where it's either ratified or changed.

## The pilot evidence Phase C evaluates

This initiative has been *operating* the chunked-doc structure in `_wip/identity-foundation/`. Study it as the
trial data — it's the strongest evidence for/against the structure because it's a live run, not a hypothesis:

- `identity-foundation-prd.md` — the **anchored-spine PRD** (every body claim cites canon; a Part 10 decision
  queue is the live ledger). Note its self-description in the header for the rationale of the shape.
- `identity-ontology.md` — the **ratified ontology, now v1.1** (the locked model; §4 invariants; §R log; §6
  deferred items including the "where this lives" question).
- `adr/0001-...md`, `adr/0002-payer-capacity-store-delegated.md` — the two ADRs; 0001's placement note is
  directly relevant to call (d).
- `b-product-walkthrough/` — the newest artifact: a facilitator pack (BRIEF + WALKTHROUGH + two themed HTML
  diagrams) produced for the PM session. Relevant as evidence of how the chunked structure scales to derived
  artifacts.
- `drift-map.md`, `domain-model-options.md`, `age-consent-spike.md`, the `archive/` and `_handoffs/` folders —
  the discovery artifacts the structure has accumulated.

## Sequencing / dependency context (why C can start now)

- **Phase A:** complete (`drift-map.md` + addendum).
- **B-tech:** **complete and committed** — ontology v1.1 + every Part-10 item that was the architect's to rule.
  See the ROADMAP decision log entries dated 2026-06-02.
- **B-product:** **packaged and running separately** with the PM (via `b-product-walkthrough/`). You do **not**
  run it.
- The ROADMAP **"Execution model — parallel tracks"** says **C goes first** — it sets the *container* for D/E
  output, so it should be decided before more docs are generated. D's *work* can proceed in parallel but
  D ratifies only after B-product clears. **C does not wait on the PM session.**

## Decisions already made that bear on C (don't re-open; do honour)

- **Dual-axis sign-off (T/P):** decisions carry an architecture sign-off (`T`) and a product sign-off (`P`);
  see the sign-off legend in PRD Part 10. Any doc-strategy you choose must preserve this ledger mechanic.
- **The ripple rule:** a product-side change can reopen a `T✓` architecture item — the structure must keep that
  traceable.
- **Ontology v1.1 (Payer capacity store-delegated, ADR 0002):** an example of an in-place canon amendment via
  a §R append + body lockstep + ADR — i.e. the structure has already been stress-tested by a real amendment.
  Worth weighing in the chunk-vs-monolith call.

## Out of scope for you

- Do **not** re-open Phase B (B-tech is locked; B-product is the PM's).
- Do **not** run or pre-empt the PM session.
- Do **not** start authoring Phase-D domain-model *content* beyond what the doc-strategy decision itself
  requires.

## Repo conventions you'll need

- **Commit via the `/commit` skill** — it handles staging, hooks, and push. Stage only intended files; never
  blanket `git add -A`/`.`. Known hook gotcha: the commit-msg hook flags the word "swept"/"sweep" unless the
  message carries a `(no-sweep)` annotation.
- **Worktrees** go under `.worktrees/<branch>/` via the `worktree-setup` skill (not Claude Code's built-in
  `EnterWorktree`).
- **Canonical sources:** the PRD **Part 10** (decision ledger) and the **ontology**. Record Phase-C decisions
  in the ROADMAP decision log, and as an ADR per the gate.
- Three files in `_wip/identity-foundation/` (`age-consent-spike.md`, `domain-model-options.md`) and
  `_wip/_scratchpad.md` carried in-progress edits that were committed in `cf7585339` — they're current.

## Suggested skills for the next session

- **`writing-plans`** (repo-local override) — if you choose to plan the doc-strategy work before executing.
- **`worktree-setup`** — only if the rollout work warrants isolation; a doc-strategy ADR likely does not.
- **`/commit`** — for committing the ADR + ROADMAP updates.
- Consider the gstack plan-review skills (`/plan-eng-review`, `/plan-ceo-review`) if you want a second pass on
  the doc-strategy ADR before ratifying — the rollout call is a repo-wide commitment worth pressure-testing.

## First moves for the receiving agent

1. Read the ROADMAP + README, then skim the pilot artifacts above.
2. Frame the four exit-gate calls (a–d) explicitly, each with options + tradeoffs, grounded in the *pilot
   evidence* (what worked / chafed while operating the chunked structure through A → B-tech).
3. Bring the four calls to the user ("You + Claude" co-own C) for ratification; don't decide unilaterally.
4. Write the resulting ADR (location per the decision), update the ROADMAP decision log + Phase-C status,
   and `/commit`.
