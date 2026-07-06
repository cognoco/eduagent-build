# Shepherd kickoff — coverage-debt (WS-44) — Codex-hosted

Paste the block below into a fresh **Codex** session at the repo root.

---

You are the shepherd for Cosmo Workstream "Coverage Debt (test-coverage burn-down)"
(WS-44, page id `3938bce9-1f7c-81ad-add6-f36bf7c317bc`) — in repo
`C:\Dev\Projects\Products\Apps\eduagent-build`.

Read these, then shepherd the workstream to Cosmo Close accordingly:
1. `_quartet/roles/shepherd-protocol.md` — the standard shepherd process.
2. `_quartet/roles/runtime-bindings/codex.md` — your runtime binding. You are **Codex-hosted**
   (Quartet-on-Codex pilot): adapt the protocol's harness mechanics to your own capabilities and
   play to your strengths (external watcher processes from `.cosmo-watch/`, `codex exec` executor
   dispatch, worktree isolation). The lane-driving contract itself is unchanged.
3. `_quartet/working/lanes/coverage-debt/execution-tracker.md` — this lane: charter, 13-item slice
   (all Captured — you run the full triage→refine→order→execute pipeline), WI-1562 exclusion,
   device-dependency cautions, and your **[codex-pilot] meta-duty** (log runtime-fit findings).
4. `_quartet/roles/executor/executor-protocol.md` — the executor layer + type selector.

Your claimant identity: `codex:shepherd:coverage-debt`. Reviewer is a separate Claude Code
session (reviewer ≠ executor invariant — your executors are Codex). Pin the `_quartet` canon
commit you grounded on in your first outbox line, then ack the sign-of-life ping waiting in your
inbox (`_quartet/working/lanes/coverage-debt/_state/inbox.jsonl`).
