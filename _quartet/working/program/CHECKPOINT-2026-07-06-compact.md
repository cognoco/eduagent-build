# ORION Compaction Checkpoint — 2026-07-06 ~15:20Z

> Machine-local, not committed. Written for a resuming ORION (orchestrator) session on the
> Quartet-on-Codex pilot. Read the MANDATORY RE-READ list first, then reconcile live state.

## 🔴 MANDATORY RE-READ on resume (orchestrator-protocol §"Orient on resume")
1. `_quartet/roles/orchestrator-protocol.md`
2. `_quartet/working/program/program-roster.md`
3. `_quartet/planning-rules.md`
4. Anchor + Cosmo + channel tails: this checkpoint + `working/lanes/coverage-debt/execution-tracker.md`
   + tail both `_state/{inbox,outbox}.jsonl`
5. `_quartet/roles/{shepherd,reviewer}-protocol.md` when standing up / adjudicating lane work

## Identity / scope
- **ORION = orchestrator** of the program; sole in-scope lane: **WS-44 Coverage Debt**
  (`3938bce9-1f7c-81ad-add6-f36bf7c317bc`). WS-31/33/34/39 + all 11 Ramtop lanes OUT — never touch.
- **Quartet-on-Codex pilot:** shepherd = Codex (attended-only — reads inbox only on its own turns,
  does NOT self-wake); reviewer = Claude Code (Clacks-blind, signals via Cosmo Stage only).
- Branch: **main**. Never `git add` `_state/*.jsonl`. Never `git stash -u` live channels.

## Monitors (reconcile against /tasks; re-arm if dead)
- Outbox watcher: **bluz9nrzd** (tail -F coverage-debt outbox)
- WS-44 stage monitor: **bjqhqi4cq**
- Hourly L1 liveness cron: **ef22fa14** — SESSION-BOUND; **RE-ARM on session restart** (CronCreate,
  hourly, 2h-Executing-stall floor → wake → escalate). This is the fix for the 8h overnight freeze.

## Channels
- inbox: last id **cvdebt-inbox-032** (I am sole writer). outbox: last **coverage-debt-050**.
- Outbox lines arrive TRUNCATED in monitor events — always re-read full line from disk before acting.

## Operator rulings in force (durable — apply, don't re-litigate)
1. **F35 landing rhythm:** orchestrator merges the Gate-cleared PR *before* Reviewing; shepherd opens
   PR + signals `needs-orchestrator`, HOLDS `complete` until my `[orch-land]` returns the squash SHA,
   then re-points Fixed In + runs `complete`. Orion self-authorizes pre-launch merge-to-main.
2. **Static+landed sufficient:** for device-dependent (verify-at-e2e-run) WIs, static validation +
   landed code + green maestro-validator meets the device DoD. Real emulator runs batch into
   **WI-1655** as a NON-BLOCKING pre-launch smoke pass. Reviewer told via WI-1401 page comment.
3. **Option (a) production fixes:** the lane's audit uncovers real production bugs; orchestrator
   adjudicates each, requires a **red-green-revert proof**, lands on evidence — NO per-change operator
   review. (Ruling relayed cvdebt-inbox-032.)
4. **Autonomous rolling pipe** (coverage-debt-034): shepherd runs the whole workstream at own
   capacity/parallelism; supervision on orchestrator. Code-level bar unchanged (real tests, no
   internal mocks, red-green for isolation/safety).

## Lane state (~15:15Z)
- **Closed (Done):** WI-1407 `8b6dd54f3`, WI-1405 `093dffc28`, WI-1411 `1c26b288`, WI-1412
  `53e5fe22`, WI-1414 `f37d90f2` (profile-isolation prod fix).
- **Just landed by me (~13:52–15:00Z), shepherd running `complete` → Reviewing → reviewer closes:**
  WI-1404 PR#1942 `f53d7fca4`, WI-1403 PR#1945 `e2c59bd9c`, WI-1408 PR#1948 `a8728be44`,
  WI-1413 PR#1947 `98951bfe5` (landed over the KNOWN family-v2 flake red = WI-1654, UNSTABLE not
  BLOCKED).
- **WI-1401:** code landed `25cb08871`; UNPARKED per ruling 2; shepherd re-runs `complete` → close.
- **WI-1402:** unblocked behind WI-1403's land; dispatchable.
- **WI-1409 + WI-1410:** production-code isolation fixes (proxy/impersonated-child write affordances
  exposed) — UNBLOCKED per option (a); shepherd proceeds to PR WITH red-green-revert proof. WATCH for
  their PRs → gate + land.
- **WI-1654** (family-v2 no ORDER BY, P2 Bug, IN WS-44, Refining): UNBLOCKED per option (a) — ORDER BY
  prod change + deterministic regression proof. Also a live flake redding OTHER api PRs until fixed.
- **WI-1562:** excluded, never claim.

## Improvement WIs captured this session (all backlog-checked; cross-lane ones WS-44-cleared)
WI-1645 (reviewer boot channel) · WI-1646/1647/1648 (Codex binding: worktree MSYS / sandbox Notion
egress / exec-1h-timeout) · WI-1650 (review false-blocking) · WI-1651/1652 (reviewer-filed: Maestro
CI vacuous-green + flow-selection) · WI-1653 dup→1651 · WI-1654 (family-v2 flake, WS-44) · WI-1655
(device smoke batch) · WI-1656 (GC1 checker false-positives on `requireActual<T>(path)`).
Findings log: `working/program/codex-pilot-2026-07-05/observations.md` (I am sole writer). Shepherd's
own findings: `working/lanes/coverage-debt/codex-pilot-shepherd-findings.md`. Both committed to main
(`e9cb98d21`) + observations updated further since (uncommitted working-tree edits present).

## Pending orchestrator actions (next turn)
1. **Watch for WI-1409 / WI-1410 / WI-1654 PRs** with red-green proofs → verify proof + CI green +
   review verdict → land (option a) → return SHA.
2. Confirm WI-1401 re-`complete`s and the reviewer closes it (won't re-bounce — page comment posted).
3. Land any further green F35 PRs; the shepherd runs autonomously so expect bursts.
4. Gate discipline reminders that are WORKING: check-colour ≠ review-verdict (read the top-level PR
   comment via `gh api repos/cognoco/eduagent-build/issues/<n>/comments`, newest); `main` check runs
   `tsc --build` (catches project-ref errors local `--noEmit` misses); GC1 wants the `as`-cast form
   `const actual = jest.requireActual(path) as typeof import(path)`, NOT the `<generic>` form.
5. Known unrelated red to adjudicate-over on api PRs until WI-1654 lands: family-v2 row-order flake.

## Tooling gotchas (this host)
- Every Bash call prints harmless bashrc/host.env noise — ignore.
- Notion: header `Notion-Version: 2025-09-03`; Stage/Priority/Type/ExecPath are **select**
  (`.properties.X.select.name`). Build JSON with `jq -nc` + `--data-binary @file` (NO backslashes in
  description strings — capture.ts JSON-parses and rejects `\`). capture soft-inherits Workstream from
  `--origin-wi` → clear it after for cross-lane items (3+ mis-homings already).
- Dedup judge broken (codex judge returns prose) — `triage --dedup` unreliable; manual title-scan.
- bun at `C:\Tools\bun\bun.exe`; cosmo skills at
  `C:\Users\ZuzanaKopečná\.claude\plugins\cache\zdx-marketplace\cosmo\0.6.46\skills\`.
