---
name: Use GitHub CLI For PRs
description: Prefer gh CLI for GitHub pull request, check, and review workflows.
type: feedback
---

Use the GitHub CLI (`gh`) for PR status, check inspection, review status, run logs, reruns, and PR updates unless the user explicitly asks for another path.

**Why:** The user requested this as the default workflow on 2026-05-23 after PR #379.

**How to apply:** For PR/check work, use commands such as `gh pr checks`, `gh pr view`, `gh run view`, and `gh api` instead of browser-first inspection.
