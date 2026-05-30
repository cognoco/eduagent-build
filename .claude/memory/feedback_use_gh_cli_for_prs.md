---
name: Use GitHub CLI For PRs
description: Prefer gh CLI for GitHub pull request, check, and review workflows.
type: feedback
---

Use the GitHub CLI (`gh`) for PR status, check inspection, review status, run logs, reruns, PR updates, and merge-conflict triage unless the user explicitly asks for another path.

For small PR conflict fixes, start with the lightweight CLI path: `gh pr view`, `gh pr diff`, `gh pr checkout` or a direct branch fetch, resolve the narrow conflict, then push. Do not create a worktree or run broad setup just because a PR has conflicts; use isolation only when the current checkout is genuinely risky to touch or the user asked for it.

**Why:** The user requested `gh` as the default workflow on 2026-05-23 after PR #379, then reinforced on 2026-05-30 after PR #617 that small conflict fixes should not become heavyweight worktree/setup exercises.

**How to apply:** For PR/check work, use commands such as `gh pr checks`, `gh pr view`, `gh pr diff`, `gh run view`, and `gh api` instead of browser-first inspection. Keep conflict-resolution setup proportional to the visible change.
