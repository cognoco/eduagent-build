---
name: project_prg14_agent_instructions_lane
description: "PRG-14 Agent-Instructions shepherd lane (WS-17) — graduated 6/6; reusable shepherding lessons (Type=Bug DoD guard, docs-PR ci.yml block, merge-on-UNSTABLE)"
metadata: 
  node_type: memory
  type: project
  created: 2026-06-14
  last_confirmed: 2026-06-14
  status: active
  originSessionId: ddf01474-2cc5-46b4-bfbb-b0e613b97ff8
---

PRG-14 "Agent Instructions" (Cosmo Workstream `WS-17`, `37f8bce9-1f7c-811d-b22f-e5d97d4b1951`) — **GRADUATED 6/6 Closed 2026-06-14**. Entry point: `_wip/agent-instructions/execution-tracker.md`. First run of the `/cosmo:prime` standby pattern (shepherd primed on the progress channel, released by a GO directive on `_state/inbox.jsonl`). WIs: WI-741 (skill-desc hygiene + hook), WI-742 (sync-skills `--report-orphans` guard + orphan PROMOTE + AGENTS.md cite), WI-743 (CI hardening F-151/F-157), WI-744/745/746 (`tech-eduagent-schemas`/`-db`/`gha-hardening` skills). Reviewer = separate Codex; DoD = Cosmo Close.

**Reusable shepherding lessons (the durable payload):**
- **Type=Bug DoD needs a red-green-revert regression guard.** ZDX `/cosmo:review` bounced WI-743 (a `Type=Bug`) for shipping the fix without a *durable* regression guard + cited red-green-revert evidence — even though AC/symptoms passed. **Dispatch Bug-type executors WITH "add a persistent guard + demonstrate it RED on pre-fix code, GREEN on fixed, cite it" in the brief up front** to avoid a guaranteed rework cycle. Hygiene/Documentation WIs don't hit this.
- **Docs-only PRs can be structurally unmergeable via path-filtered required checks.** `ci.yml` had `pull_request: paths-ignore: ['**.md','docs/**','.claude/**',…]` AND produced the branch-protection-required `main` check → docs-only PRs never triggered it → required `main` never reported → `mergeStateStatus=BLOCKED` forever. Fix (operator-owned, landed `d790e04eb`): drop the paths-ignore so CI runs on docs PRs. Same class as the AGENTS.md "required check stuck" pattern. (`claude-review` is NOT required and legitimately skips docs PRs via its own paths-ignore — absent ≠ red there.)
- **Merge on `UNSTABLE` is correct when the only non-green is an intentional advisory non-required check.** WI-743's required `Playwright web smoke` is an honest pass-through; the real `run-smoke` is advisory (red because `DOPPLER_TOKEN_STG` is unprovisioned in CI → seed 403/auth-timeout). `mergeStateStatus=UNSTABLE` (not CLEAN) purely from that advisory red — still mergeable. Don't gate the lane on CLEAN-only.
- **Adjudicate reviewer/Codex findings against the WI's AC, not in the abstract.** A Codex P1 pushed WI-743 toward a hard smoke gate; the WI AC said "real smoke registered optional-only" (because the smoke can't run in CI) — rejected the P1 with that factual basis (`prg14-004`). Codex P2s that ARE valid (guard-coverage gaps, namespace-descent in the orphan scanner) were fixed.
- **Operator can clear a content gate + defer polish.** `prg14-in-005`: "merge skills as-is, no rework; lean-pointer rework → Stream 2." The separate reviewer honored deferred Codex P2 content findings (did NOT bounce on them). Logged the deferrals on the outbox (`prg14-008`) for Stream 2.
- **Ambient flake:** `apps/mobile/src/app/(app)/session/index.test.tsx` "BUG-234 escape hatch" is an intermittent timeout flake; a root/`scripts` change pulls `apps/mobile` into the nx-affected set so it can fail the required `main` check — re-run, don't bounce. See [[project_known_bug_patterns]].

**Carry-forwards:** Of the 3 deferred Codex P2 content items, `tech/eduagent-db/SKILL.md` (a) false "lint-enforced" write-ownership claim and (b) TOCTOU child-write example were **RESOLVED by the orchestrator directly on main (commit `25ed39a20`, no reopen)** — (a) corrected to review-enforced (G1/G5 = route-service boundaries, not write-ownership), (b) replaced with inline-`EXISTS`-subquery ownership + a locked-transaction alternative. **Only (c) remains** for Stream 2: `tech/gha-hardening/SKILL.md` eval-live labeled-PR-code inventory accuracy nit (folded into the lean-pointer rework). Cosmo hygiene: WI-743 has no `Project` relation (was `State=""` at claim).

Related: [[project_prg11_arch_cleanout_lane]] (sibling shepherd lane), [[project_cosmo_shepherd_finalization]], [[project_playwright_e2e_setup]], [[project_claude_review_self_referential_401]].
