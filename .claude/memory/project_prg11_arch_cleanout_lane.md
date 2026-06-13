---
name: project_prg11_arch_cleanout_lane
description: "PRG-11 Architecture Clean-Out shepherd lane — Tier-1 dispatch state, demotion decision, live handles"
metadata: 
  node_type: memory
  type: project
  created: 2026-06-13
  last_confirmed: 2026-06-13
  status: active
  originSessionId: ba439275-5698-46fe-956a-37624fda76db
---

Shepherding PRG-11 "Architecture Clean-Out" (Workstream `37e8bce9-1f7c-81fe-be97-e063ce8f17e8`), **Tier 1 ONLY** (WI-717/718/719/720). Entry point: `_wip/architecture/execution-tracker.md`. Reviewer = SEPARATE Codex session; DoD = Cosmo Close. Tiers 2/3 await operator decomposition gate — do NOT touch.

**Trigger gate (resolved):** start-gate WI-721 was DELETED (not moved to Executing); operator confirmed deletion = the go-ahead (option b). Started 2026-06-13.

**Demotion decision:** WI-717/718/720 were sliced WP but each executes as a SINGLE PR and `/cosmo:bundle` is not installed (no brief+children authoring). Per shepherd-protocol "a WP that won't decompose into children gets demoted to Item, not forced" → demoted all three to **Item** altitude (reversible Notion prop write). Refined all four to Ready, Execution Path=**Assisted** (framing DoR bar). WI-719 was already Item.

**Dispatch (session-scoped handles, valid this session only):** 4 background executors, executor-protocol.md phases, claim via `claude:wiNNN-executor:WI-NNN`, worktree `.worktrees/WI-NNN` from origin/main, one PR each base main, STOP at green+triage (await my merge confirm before `/cosmo:execute complete`). WI-717 on **Opus** (concurrency reasoning), rest Sonnet. Stage-change monitor watches review verdicts.

**Key lane notes:** F-097 evidence B1-stale → executor re-greps orchestrate-round.ts. WI-720 GC6 sweep EXCLUDES cutover-surface test files (identity/consent/family-access/billing/metering/auth/session-exchange/sessions/stripe-webhook/revenuecat-webhook). WI-717 needs red-green concurrency break tests (revert-to-RED evidence mandatory).

**STATUS 2026-06-13: Tier 1 COMPLETE — all four Closed/Done, no rework.** Landed: WI-717 `d99562583`, WI-718 `f70c02164`, WI-719 `15f388414`, WI-720 `620cca77b`. Claude review APPROVED 0/0 on all (after PR #1121/WI-698 workflow-hardening broke claude-review repo-wide → reverted on main → each PR's claude-code-review.yml re-synced to match main, which is the fix when claude-review fails). Fixed In corrected to squash SHAs (operator-authorized). **Tiers 2/3 still await the operator decomposition gate — lane NOT graduated.** Open hygiene: merged remote branches WI-717..720 + local .worktrees/WI-7xx not yet cleaned.
