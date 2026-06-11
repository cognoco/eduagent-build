---
name: Don't create PRs unless asked
description: Never create a PR automatically — only when the user explicitly requests it
type: feedback
---

Do not create pull requests unless the user explicitly asks for one.

**Why:** User wants to control when PRs are created. Creating a PR is a visible action to others and the user may want to review, add more commits, or adjust the branch before opening a PR.

**How to apply:** After pushing a branch, stop. Do not run `gh pr create`. Only create a PR when the user says "create a PR", "open a PR", "make a PR", or similar explicit request.
