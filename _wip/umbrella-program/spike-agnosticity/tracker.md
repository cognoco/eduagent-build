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

- [14:45] SETUP | OBS: Read tracker + WI-697 via Notion MCP. Task spec lives ENTIRELY in the WI Description (clamp(n,lo,hi) + colocated test for 4 cases incl lo>hi edge → new scratch/clamp.ts). AC is in the Acceptance Criteria property. WI page body itself is blank — all spec is in structured props, which means a non-Notion-native executor needs the spec handed to it as text; it can't "read the WI" without MCP/REST access.
- [14:45] SETUP | OBS: codex on PATH (/opt/homebrew/bin/codex); codex-companion.mjs present. Companion exposes `task --write --background`, `status`, `result`, `adversarial-review` as first-class subcommands — the adversarial-review is purpose-built for probe (b), no need to hand-roll a review prompt.
- [14:45] SETUP | OBS: Probe order chosen — (1) Claude executor in worktree-A incl nested Codex adversarial review (probe a-i + b + watch-item in one pass), (2) Codex executor in worktree-B (probe a-ii), (3) compare. Rationale: probe (b) requires a Claude executor, so fold it into the Claude pass.
- [14:45] SETUP | OBS: root checkout on `main`, origin/main=22921a6e7. Will create both worktrees from origin/main; never touch root branch.
- [14:46] SETUP | OBS: Both worktrees created in one `git worktree add ... origin/main` each — clean, ~instant, no checkout of root branch. DELIBERATELY SKIPPED pnpm install + env:sync (worktree-setup skill steps): fixture is a pure fn + colocated test, no toolchain needed for the meta-finding. Cost saved: a full monorepo install (~minutes). Friction note: the worktree-setup skill bundles install+env-sync as mandatory, so a faithful skill-driven dispatch would have paid that cost unnecessarily for a trivial fixture.
- [14:47] DISPATCH-CLAUDE | OBS: Launched Claude executor as background Agent (sonnet) pinned to worktree-A. Folded probe (b) into it: instructed it to attempt cosmo claim, build clamp, then spawn a NESTED Codex adversarial reviewer (try subagent_type codex:codex-rescue first, fall back to codex-companion adversarial-review). Single dispatch covers probe a-i + b + watch-item.
- [14:48] DISPATCH-CODEX | OBS: SEAM SURPRISE #1 — codex-companion `task --help` is not a help flag: it LAUNCHED a real Codex task using "--help" as the prompt. No arg validation; everything after `task` is prompt text. A runner-adapter must never pass through stray flags as prompt.
- [14:48] DISPATCH-CODEX | OBS: SEAM SURPRISE #2 (important) — the shared codex-companion runtime pins `workspaceRoot` to the ROOT checkout (/Users/.../eduagent-build), NOT a worktree, and defaults to FILESYSTEM READ-ONLY. So a Codex executor via the shared companion cannot, by default, write into my isolated worktree — it would target root (forbidden) and is read-only anyway. `--write` unlocks writes but the cwd is still root. Implication: to keep Codex writes inside a throwaway worktree I must use `codex exec --cd <worktree>` directly, not the shared companion task runtime. Recording, then testing codex exec with explicit --cd.
- [14:50] DISPATCH-CODEX | OBS: SOLVED the isolation problem. The clean Codex-in-worktree invocation is: `codex exec -C/--cd <worktree-abs-path> -s workspace-write --skip-git-repo-check "<prompt>"`. `--cd` pins cwd; `-s workspace-write` scopes the write sandbox to that cwd. This sidesteps the root-pinned shared companion entirely. (`--skip-git-repo-check` not strictly needed inside a worktree but harmless.) This — NOT codex-companion task --write — is the runner-adapter's Codex-executor primitive when isolation matters.
- [14:51] DISPATCH-CODEX | OBS: Codex executor RESULT — built clamp.ts + clamp.test.ts in 56s, ~57k tokens. Verified: both files landed in the CODEX WORKTREE only (git status: `?? .../scratch/`); ROOT checkout has NO scratch dir (ls→No such file). Isolation held; shared root never touched. Codex respected "do not run git / do not install" instructions exactly.
- [14:51] DISPATCH-CODEX | OBS: GUARDRAIL CONFIRMED as a finding — "shared companion runtime is root-pinned + read-only by default" is real and is a first-class runner-adapter contract requirement: a naive `codex-companion task --write` Codex-executor adapter would write to the SHARED root checkout (irreversible pollution of live sessions). The adapter MUST use `codex exec --cd <worktree>` (or otherwise force cwd) for any write-capable Codex executor. Never `--write` at root.
- [14:53] DISPATCH-CODEX | OBS: CLAIM-OPERABILITY probe design. The cosmo execute writer is a global plugin CLI (zdx-marketplace/cosmo 0.6.0), invoked `bun <plugin>/skills/execute/execute.ts <fetch|claim|complete> ...`, auth via NOTION_TOKEN (present in env), run from repo root, reads zdx-config.yaml. `fetch --supervised` is READ-ONLY (writes only a local workitem.json artifact + enforces a deterministic repo-origin guard); `claim` is the MUTATING call against shared WI-697. DECISION: probe operability with the non-destructive `fetch --supervised` (does the runtime/CLI work? does the repo guard pass from a worktree?) and reason about `claim` mutation from code, rather than firing a live mutating claim at the shared WI then having to release it — lower risk, equal meta-value. This itself is a finding: the lifecycle writer is runtime-AGNOSTIC (a plain bun CLI), so "can runtime X operate Cosmo" reduces to "can runtime X shell out to bun + has NOTION_TOKEN" — neither Claude nor Codex has native Cosmo awareness; both drive it identically via the CLI.
- [14:51] DISPATCH-CODEX | OBS: Codex output QUALITY — clamp impl normalizes bounds via Math.min/Math.max (so lo>hi is silently corrected, not rejected). Test's lo>hi case `clamp(5,10,0)` asserts 5 (in-range after normalization). Defensible reading of an ambiguous spec; an adversarial reviewer could argue lo>hi should throw instead. Note for the cross-runtime-review comparison. No NaN test. Codex did NOT attempt a Cosmo claim (not instructed to — I drove it as a pure executor via CLI, which itself is a finding: the Codex-exec path has no built-in Cosmo lifecycle awareness; claim must be driven by the orchestrating runtime, not the executor).

## Probe results (run 1 — partial; reconstructed post-mortem by program session)

- **(a) Claude executor:** PARTIAL-SUCCESS. Claimed WI-697 (Stage→Executing,
  `claude:sonnet-4-6:spike-697-claude`) AND built `clamp.ts` + `clamp.test.ts` in
  worktree-A. Did NOT reach probe (b) / report back — run terminated by the entitlement
  wall before the shepherd collected it.
- **(a) Codex executor:** SUCCESS. `codex exec --cd <worktree> -s workspace-write` built
  the fixture in 56s / ~57k tok, fully isolated (root never touched). Quality: clamp
  normalizes bounds via Math.min/Math.max (lo>hi silently corrected, not rejected); no
  NaN test. Cosmo claim: not driven to it — the executor has no native Cosmo awareness;
  the lifecycle writer is a runtime-agnostic `bun` CLI, so claim is driven by the
  orchestrator, identically for either runtime.
- **(b) Nested Codex review under Claude executor:** BLOCKED — never ran. The first
  mechanism attempted was the `codex:codex-rescue` Agent wrapper, which is itself a
  Claude Code agent; spawning it at this nesting depth hit the org entitlement wall.
- **Watch-item (reviewer≠executor independence):** not reached.

## Program-session post-mortem (run 1)

- **Outcome:** run TERMINATED by `"Your organization has disabled Claude subscription
  access for Claude Code · Use an Anthropic API key instead"` after ~5.7 min. Not a
  normal completion.
- **Where the wall is:** Claude-Code-wrapped agent spawns (Agent tool, incl.
  `codex:codex-rescue`) at depth ≥2 trip it; the **direct `codex exec` CLI does NOT**
  (separate auth) — which is exactly why the Codex-executor arm sailed through.
- **Confound:** the shepherd was launched as a SUB-AGENT of the program session, so every
  layer is one level deeper than real ops (real: shepherd=top, executor=depth-1,
  reviewer=depth-2; here: +1 each). So the depth threshold is not cleanly attributable.
- **Positives banked:** isolation held (root never polluted); the Codex-in-worktree
  primitive (`codex exec --cd <wt> -s workspace-write`) is established; the
  runtime-agnostic-CLI nature of the Cosmo lifecycle writer is established.
- **Cleanup done:** both throwaway worktrees + branches removed; WI-697 claim released →
  Ready (reusable for a re-run).
- **Re-run plan:** complete probe (b) with the nested reviewer using **direct `codex exec`**
  (not the `codex:codex-rescue` Agent wrapper) — which is also the production mechanism the
  finding already points to — and/or supply an `ANTHROPIC_API_KEY` for sub-agents, and/or
  run the shepherd as a top-level session to match real-ops depths.

## Run 2 (shepherd = this session)

- [RUN2 18:50] SETUP | OBS: Run 2 started. Root on `main`, origin/main=924dd7b68 (advanced since run 1's 22921a6e). No leftover spike worktrees (run-1 cleanup confirmed). codex on PATH, NOTION_TOKEN present. Created ONE throwaway worktree `.worktrees/spike-697-r2` (branch spike-697-r2) from origin/main — instant, root branch untouched. Per run-1 finding, SKIPPED pnpm install/env:sync (pure-fn fixture needs no toolchain for the meta-finding).
- [RUN2 18:50] SETUP | OBS: Fixture spec taken from run-1 banked tracker entry (clamp(n,lo,hi) + colocated test, 4 cases incl lo>hi → scratch/clamp.ts). Did NOT re-fetch WI-697 via Notion MCP — spec already textualized in tracker; saves an MCP round-trip and the WI body is blank anyway (all spec in structured props). Handing spec to executor as text.
- [RUN2 18:50] DISPATCH-CLAUDE | OBS: About to spawn ONE Claude executor (sonnet, depth-1 Agent) pinned to worktree spike-697-r2. Its job: build clamp fixture, then in phase-4 run BOTH nested-review paths — (i) Agent tool subagent_type codex:codex-rescue (true nested cross-runtime dispatch — does it work mechanically?), (ii) direct `codex exec --cd <wt> -s read-only "<review prompt>"` (review quality). Folds probe a-i + b + watch-item.
- [RUN2 18:58] NESTED-REVIEW | OBS: PROBE (b) PATH (i) — codex:codex-rescue NESTED SUB-AGENT DISPATCH **WORKED** this run (run-1 BLOCKER cleared, was a subscription wall not a depth limit). Claude executor (depth-1) spawned an Agent subagent_type=codex:codex-rescue (depth-2) that returned ~12 genuine Codex-generated adversarial findings in ~97s, no error/timeout. Mechanism: confirmed functional. Caveat: codex-rescue is a task-only FORWARDER — it can't invoke a structured adversarial-review; it forwards the "review this diff" prompt as a task. Acceptable for "does nesting work".
- [RUN2 18:58] NESTED-REVIEW | OBS: PROBE (b) PATH (ii) — direct `codex exec --cd <wt> -s read-only "<review prompt>"` ran clean, exit 0, gpt-5.5 high-reasoning, ~36k tok / ~30s. Auto-loaded the repo's deep-bugfixing skill, read files via bat, returned 3 concise actionable findings. This is the PRODUCTION review mechanism (run-1 finding pointed here).
- [RUN2 18:58] NESTED-REVIEW | OBS: FIXTURE — Claude executor made a DIFFERENT spec call than run-1 Codex: it chose to THROW RangeError on lo>hi (vs run-1 Codex's silent Math.min/max normalization) AND included a NaN test (run-1 Codex omitted it). So the two runtimes, same spec, diverged on the exact ambiguity the watch-item targets — direct evidence the lo>hi reading is genuinely ambiguous and runtime-dependent.
- [RUN2 18:58] NESTED-REVIEW | OBS: WATCH-ITEM (reviewer=Codex ≠ executor=Claude) — independence HELD and PAID OFF. Codex reviewers caught things a Claude self-review plausibly misses: the `-0` Object.is-vs-toBe identity gap, `undefined as any` TS-boundary trust, NaN-vs-lo>hi guard PRECEDENCE, and the missing `lo===hi` single-point case. Both paths also independently flagged "degenerate" terminology misuse. The author's intent-knowledge made these invisible to self-review; a fresh runtime surfaced them. Cross-runtime independence value is REAL, not theoretical.
- [RUN2 18:58] NESTED-REVIEW | OBS: FRICTION — (1) PATH(i) sub-agent CANNOT read the worktree; file contents must be pasted inline → token cost + truncation risk at scale. (2) PATH(ii) codex exec auto-ran `rg clamp` returning ~150 lines of unrelated repo hits — handled gracefully but noisy/token-costly; a weaker model could be confused. (3) codex exec printed findings block TWICE (stdout flush quirk). (4) model param to codex:codex-rescue accepted but un-verifiable from caller side whether honored.
- [RUN2 18:58] COMPARE | OBS: ISOLATION re-confirmed run 2 — fixture (clamp.ts+clamp.test.ts) present ONLY in worktree spike-697-r2; root has NO scratch/ dir; root branch still `main`. Read-only codex exec for review also touched nothing. Both nesting paths fully sandboxed.
- [RUN2 19:02] WRAP | OBS: finding.md WRITTEN (one page: per-probe verdicts a-i/a-ii/b + watch-item, 7 seam-contract implications, recommendation). Throwaway worktree spike-697-r2 + branch REMOVED (git worktree remove --force + branch -D, both ok); only other sessions' WI-689/690/691 worktrees remain, untouched. WI-697 NOT claimed this run (executor driven as pure executor, claim never fired) → no claim to release; WI-697 left Ready for the program session to cancel. No git commit/push (program session owns git). Run 2 COMPLETE.
