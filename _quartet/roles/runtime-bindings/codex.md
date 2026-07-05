# Codex Runtime Binding

**What this is.** The Codex binding of the Quartet role contracts. The role protocols stay
runtime-agnostic; this file supplies the concrete Codex mechanics for the four runtime primitives
named in `_quartet/README.md`.

Machine-readable binding: `codex.json`. Smoke check:
`python _quartet/scripts/smoke_codex_runtime_binding.py`.

## Invariant

`reviewer != executor` remains a quality invariant. A Codex executor must be reviewed by a
different runtime, and a Codex reviewer must not close work produced by a Codex executor unless the
operator records an explicit exception outside this binding.

The runtime identity is `identifyOwnRuntime`: use claimant strings shaped as
`codex:<role>:<scope>` and record the concrete workspace as `<repo>@<branch-or-worktree>`.
Do not derive runtime identity from the repository persona.

## Primitive Bindings

| Primitive | Codex binding |
|---|---|
| `identifyOwnRuntime` | Runtime is `codex`; claimant identity uses `codex:<role>:<scope>`; workspace records the branch or worktree. |
| `dispatchExecutor` | Spawn bounded executor work with `codex exec --cd <dedicated-worktree> -s workspace-write <brief-file>`. Write-capable executors use a dedicated worktree from `origin/main`. |
| `monitorJob` | Run an external watcher process from a gitignored runtime directory such as `.cosmo-watch/<role-or-lane>/`, record it in the monitor manifest, and reconcile it before trusting silence. Codex has no in-harness Monitor primitive in this binding; wakeup is durable log/state delivery plus explicit reconciliation at resume/status/checkpoint boundaries. |
| `spawnFreshContextSession` | For bounded review/audit, use `codex exec --cd <read-only-or-throwaway-worktree> -s read-only <review-brief-file>`. For long-running roles, the operator pastes the kickoff into a fresh Codex session. |

## Role Notes

- **Orchestrator:** may run in Codex if it uses the manifest-backed monitor binding and dispatches
  executors through `dispatchExecutor` instead of any harness-native subagent primitive.
- **Shepherd:** may run in Codex if its inbox and stage watchers are external monitor jobs and it
  dispatches bounded executors with dedicated worktrees.
- **Executor:** a Codex executor is native to Codex, Clacks-blind, and reports only to its spawner.
- **Reviewer:** a Codex reviewer is valid only when the executor runtime differs. If the executor is
  Codex, choose a different reviewer runtime.

## Smoke Fixture

The smoke script resolves the binding for orchestrator and shepherd roles without invoking any
runtime command. It fails if a required primitive is missing, if the binding depends on Claude
Code-only `Agent` / `Monitor` semantics, or if the role docs stop pointing at this binding.
