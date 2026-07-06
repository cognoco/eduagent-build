# WI-1405 Researcher Brief

Runtime: Codex executor.
Type: Researcher.
Model/effort requested by shepherd dispatch: `gpt-5.5`, `high`.
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
- `WI-1405` — Billing v2 live-path + child-facing + top-up test coverage gaps
- Description: billing-v2 handlers are LIVE in prod (identity-v2 flag gone), yet the live quota hot path and family-seat billing have no real-DB tests, and the child-facing + top-up surfaces are largely uncovered. Risk: untested live billing code (quota decrement, family seat add/remove, top-up confirmation) can misbill or mis-provision with no safety net. Start: add integration twins for quota-provision-v2 and family-v2, an e2e for the child in-chat quota card, and a top-up success->poll test + e2e.
- Current lane context: Coverage Debt, WS-44. P2, high miss-cost because it touches money/subscription/quota provisioning. Device-dependent assertions must be split from code-level assertions if they require Maestro/emulator evidence.

Goal:
Identify the affected API/mobile/e2e code and test surfaces, confirm the real coverage gaps, and propose Definition-of-Ready content for refining WI-1405.

Deliverable:
1. Affected surfaces with `file:line` citations.
2. Existing adjacent coverage with `file:line` citations.
3. Confirmed gaps and any stale premise in the WI wording.
4. Draft Acceptance Criteria suitable for Cosmo refine, including red-green-revert clauses where appropriate.
5. Recommended execution path (`Assisted` or `Auto`) and why.
6. Device/e2e parts that should be marked verify-at-e2e-run instead of claimed by a headless Codex executor.

Search hints, not limits:
- `billing-v2`
- `quota-provision-v2`
- `family-v2`
- `top-up`
- `topup`
- `RevenueCat`
- `in-chat quota`
- `quota card`
- `subscription`
