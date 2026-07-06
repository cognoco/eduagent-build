# WI-1407 Researcher Brief

Runtime: Codex executor.
Type: Researcher.
Model/effort requested by shepherd dispatch: `gpt-5.5`, `low`.
Sandbox: read-only.

Read these process files first:
- `AGENTS.md`
- `_quartet/roles/executor/executor-protocol.md`
- `_quartet/roles/executor/researcher.md`

Hard rails:
- Do not modify files.
- Do not read or write `_quartet/working/lanes/**/_state/*`.
- Do not read or write Clacks channel files (`inbox.jsonl`, `outbox.jsonl`) or monitor manifests.
- If `_state` content is surfaced passively by tooling, ignore it and do not use it.
- Report only in your final response to the spawner.

WI substance:
- `WI-1407` — Consent/profile gate coverage gaps (save-wizard adult gate + mentor-memory screen-wiring privacy writes)
- Description: The save-wizard's minor-owner adult gate is untested at every layer, and the mentor-memory privacy writes are untested at the screen level. Risk: a regression to a legal/safety gate or a privacy-write control (consent grant, injection toggle, delete-all) would pass CI. Start: add a minor-owner rejection test to `ProfileBasicsStep` plus a wizard e2e; drive the consent-prompt/toggle/delete-all through the screen because hooks are already tested.
- Current lane context: Coverage Debt, WS-44. This is P2 and first in order because it touches consent/minor/privacy gates. Device-dependent assertions must be split from code-level assertions if they require Maestro/emulator evidence.

Goal:
Identify the affected code/test surfaces and propose Definition-of-Ready content for refining WI-1407.

Deliverable:
1. Affected surfaces with `file:line` citations.
2. Existing coverage that already exercises adjacent behavior, with `file:line` citations.
3. Coverage gaps confirmed by source inspection.
4. Draft Acceptance Criteria suitable for Cosmo refine, including a red-green-revert regression-test clause.
5. Recommended execution path (`Assisted` or `Auto`) and why.
6. Any device-dependent part that should be marked verify-at-e2e-run instead of claimed by a headless Codex executor.

Search hints, not limits:
- `ProfileBasicsStep`
- `save-wizard`
- `mentor-memory`
- `consent-prompt`
- `delete-all`
- `injection`
- `Maestro`
