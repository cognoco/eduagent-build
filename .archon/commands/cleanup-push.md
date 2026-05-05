---
description: Push the cleanup branch to origin
argument-hint: (no arguments)
---

# Push Cleanup Branch

Push the current branch to origin. Use PowerShell for git commands (bash on Windows
routes through WSL which breaks git worktree path resolution).

## Execute

Run these commands using PowerShell (not bash):

```powershell
git branch --show-current
git log --oneline origin/consistency..HEAD
git push -u origin HEAD
```

If the push fails, report diagnostics:

```powershell
git remote get-url origin
git branch --show-current
git config credential.helper
```

## Output

Report the branch name and push result.
