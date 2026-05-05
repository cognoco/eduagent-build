---
description: Install dependencies in the worktree
argument-hint: (no arguments)
---

# Install Dependencies

Install project dependencies so pre-commit hooks and validation commands work.
Use PowerShell for all commands.

## Execute

```powershell
pnpm install --frozen-lockfile
```

If that fails (e.g. lockfile mismatch from rebase), try:

```powershell
pnpm install
```

## Verify

```powershell
Test-Path node_modules
```

Report whether install succeeded.
