---
name: project_prg14_agent_instructions_lane
description: "Repo CI/merge gotchas (extracted from the graduated PRG-14 lane): docs-only PRs unmergeable via path-filtered required checks; merge-on-UNSTABLE for advisory-red; a known mobile session flake."
metadata: 
  node_type: memory
  type: project
  created: 2026-06-14
  last_confirmed: 2026-06-20
  status: active
  originSessionId: ddf01474-2cc5-46b4-bfbb-b0e613b97ff8
---

> The PRG-14 "Agent Instructions" lane (WS-17) GRADUATED 6/6 (2026-06-14); its reusable *shepherding* lessons were extracted to the Quartet learning tracker (`_wip/umbrella-program/quartet-learning-tracker.md` §E9). Only the repo-level CI/merge facts remain here. (Filename is legacy — rename to a repo-CI-gotchas slug when convenient.)

- **Docs-only PRs can be structurally unmergeable via path-filtered required checks.** `ci.yml` `pull_request: paths-ignore: ['**.md','docs/**','.claude/**',…]` AND a branch-protection-**required** `main` check → docs-only PRs never trigger it → required `main` never reports → `mergeStateStatus=BLOCKED` forever. Fix (operator-owned, landed `d790e04eb`): drop the paths-ignore so CI runs on docs PRs. Same class as the AGENTS.md "required check stuck" pattern. (`claude-review` is NOT required and legitimately skips docs PRs via its own paths-ignore — absent ≠ red there.)
- **Merge on `UNSTABLE` is correct when the only non-green is an intentional advisory non-required check.** E.g. `run-smoke` red because `DOPPLER_TOKEN_STG` is unprovisioned in CI (seed 403/auth-timeout) while the required `Playwright web smoke` passes → `mergeStateStatus=UNSTABLE` (not CLEAN) but still mergeable. Don't gate on CLEAN-only.
- **Ambient flake:** `apps/mobile/src/app/(app)/session/index.test.tsx` "BUG-234 escape hatch" is an intermittent timeout flake; a root/`scripts` change pulls `apps/mobile` into the nx-affected set so it can fail the required `main` check — re-run, don't bounce. See [[project_known_bug_patterns]].
