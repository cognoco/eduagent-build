# Agnosticity spike — live tracker

**Spike nature.** This is a *methodology spike* under **PRG-05** (execution-mechanism
productionization), design phase. The dummy task (`WI-697`, a throwaway `clamp()`
fixture) is only a vehicle — **the deliverable is the meta-finding** about
cross-runtime agent dispatch, not the dummy code. Keep a meta perspective: capture
friction, surprises, costs, and seam mechanics, not task progress.

**Owner:** spike agent (Claude shepherd, background) · **Monitored by:** program session.
**Fixture:** `WI-697` (Ready, standalone, MentoMate) — Cancelled by the program session post-spike.
**Deliverable:** `_wip/umbrella-program/spike-agnosticity/finding.md` (one page).

## The two probes

- **(a) Executor backend swap.** Dispatch WI-697's build via two backends and compare
  quality / cost / throughput / friction:
  - (i) a **Claude sub-agent** executor (Agent tool)
  - (ii) a **Codex-model** executor via the Codex plugin's `codex-companion` runtime
- **(b) Nested cross-runtime adversarial review.** Have a **Claude executor** spawn a
  **Codex** nested adversarial reviewer for its phase-4 review (shepherd → executor →
  Codex reviewer = nested sub-agents, depth 2). Does nesting work across runtime?
- **Watch-item.** Reviewer-runtime ≠ executor-runtime: when the executor is Codex, the
  nested reviewer should be Claude (and vice-versa). Record whether independence held
  and whether the cross-runtime reviewer caught anything the same-runtime one wouldn't.

## Run metadata

- Started: _(agent fills)_
- Backends exercised: _(agent fills)_
- Worktrees used: `.worktrees/spike-697-*` (throwaway)

## Observation log (append-only, newest at bottom)

Format: `- [HH:MM] <PHASE> | OBS: <one observation, meta-perspective>`
Phases: SETUP · DISPATCH-CLAUDE · DISPATCH-CODEX · NESTED-REVIEW · COMPARE · WRAP

<!-- agent appends below this line -->

## Probe results (agent fills as it goes)

- **(a) Claude executor:** _(verdict + notes)_
- **(a) Codex executor:** _(verdict + notes — incl. could it run /cosmo:execute claim? the worktree-setup? the build?)_
- **(b) Nested Codex review under Claude executor:** _(did nesting work? mechanism used — nested Agent vs direct codex-companion CLI? findings quality?)_
- **Watch-item (reviewer≠executor independence):** _(held? value observed?)_

## Final finding pointer

- _(agent: link finding.md + one-line bottom-line when done)_
