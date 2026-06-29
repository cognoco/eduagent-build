# Quartet Glossary

Shared vocabulary for the Quartet machinery. Use these terms; don't coin synonyms.

## The stack
**ZDX → Cosmo → Clacks → Quartet.**
- **ZDX** — the work-item standard (the schema: Stage, State, Execution Path, Resolution, Altitude…).
- **Cosmo** — the work system that stores Work Items against the ZDX standard.
- **Clacks** — the comms layer the roles signal over: `_state/{inbox,outbox}.jsonl` mailboxes +
  Cosmo-Stage signaling + the Monitor watchers. Design: `clacks/progress-channel-design.md`.
- **Quartet** — the four execution roles that drive the work.

## The work hierarchy
**Program** → **Initiative** (`PRG-NN`) → **Cosmo Workstream** (0..n per Initiative) → **Work
Package** (`Altitude=WP`, PR-sized) → **Work Item / Sub-item**. Full rules: `planning-rules.md` §1.

## The four roles (the Quartet)
- **Orchestrator** — one per program. Steers the roster/queue/gates, activates + coordinates lanes,
  rules + relays operator decisions, routes the Clacks. Scaffold: `roles/orchestrator-protocol.md`.
- **Shepherd** — one per active lane (one Cosmo Workstream). Refines, dispatches executors, tracks
  verdicts, drives the lane Backlog→Close. Operator-launched. Scaffold:
  `roles/shepherd-protocol.md`.
- **Executor** — the worker a shepherd dispatches to do one unit in isolation. Native to its
  spawner's runtime; Clacks-blind. A *layer* with **types** (below). Scaffold: `roles/executor/`.
- **Reviewer** — a separate session in a separate runtime that takes Work Items from
  `Stage=Reviewing` to a disposition. **Reviewer ≠ executor** is a quality invariant. Scaffold:
  `roles/reviewer-protocol.md`.

## Executor types (under the executor layer)
Type changes the **ceremony**, never the shared **rails**.
- **Builder** — mutates production code; heaviest ceremony (worktree, plan, adversarial review,
  PR-to-green). `roles/executor/builder.md`.
- **Researcher** — read-only; answers a question or recommends a course of action. `…/researcher.md`.
- **Auditor** — read-only adversarial check on a different model (Codex) for independence.
  `…/auditor.md`.
- **General** — catch-all for simpler tasks incl. small non-code state mutations (verify the write).
  `…/general.md`.

## Reviewer vs watcher vs review-agent — three distinct things
Easy to conflate; the reviewer leg has three layers:
- **Reviewer** — the *role* / standing contract: take a Work Item from `Stage=Reviewing` to a
  disposition via `/cosmo:review` + `/cosmo:qa`. Scaffold: `roles/reviewer-protocol.md` (Brain).
- **Watcher** — a long-running daemon that *polls* Cosmo workstreams for `Stage=Reviewing` and, on
  each transition, spawns one review process. The detector/dispatcher, not the reviewer.
  Tooling: `clacks/review-watcher.ts`.
- **Review-agent** — the ephemeral per-transition process the watcher launches (this estate: a Codex
  `exec`) that actually runs the QA + disposition. No file; created at runtime.

So "the watcher launches the review-agent" = the polling daemon detects a transition and spawns a
worker to do the review. The watcher automates by hand what `reviewer-protocol.md` describes.

## Other terms
- **Rails** — the thin universal contract every executor honours (goal-loop, quality bar, process
  awareness, DoD, report-back boundary, Clacks-blind, tiering). `roles/executor/executor-protocol.md`.
- **Clacks-blind** — a sub-agent reports only to its spawner and never writes channel files.
- **Lane** — colloquial for an active Initiative's workstream + its shepherd + its working artifacts.
- **Monitor manifest / reconcile** — the discipline that keeps watchers trustworthy across session
  boundaries. `clacks/monitor-hygiene.md`.
- **Boundary node** — a named milestone an Initiative exports; cross-Initiative gates reference these,
  never foreign internal items. `planning-rules.md` §5.2.
- **Graduation** — the symmetric close of a lane: every WI Closed → close the Cosmo Workstream
  container, stand the shepherd down, flip the roster row. `planning-rules.md` §2.8.

## Brain / Library / Working — the three kinds
- **Brain** — the role protocols (`roles/`): how each role behaves.
- **Library** — the definitions/shapes of the artifacts roles manipulate (`library/`): roster,
  tracker, Clacks channel, dashboard, activation queue.
- **Working state** — the live instances a running role produces (`working/`): the filled roster,
  dashboard, lane trackers, `_state/` channels. Instantiated from the Library by the Brain.
