---
name: commit
description: Use when the user asks to commit, save changes, commit staged files, commit specific files, or commit and push in the EduAgent repo.
---

# Commit

You are handling git for this repo. Commit intentionally, preserve unrelated user work, and push after a successful commit unless the user explicitly asks you not to push.

## Critical Rules

1. Push after successful commits unless the user explicitly says not to push. Never force-push unless explicitly requested.
2. Never use `--no-verify`.
3. Never stage files beyond the user's requested scope.
4. Never edit source files as part of this skill. If hooks fail because code needs fixes, report the failure and leave changes staged/unstaged as appropriate.
5. Exclude secrets and accidental large binaries from commits.

## Scope Modes

Classify the user's request:

- Staged mode: "staged", "staged only", or "commit staged" means commit only the current index. Do not run `git add`.
- Files mode: explicit file paths mean stage only those paths.
- Own-work mode: if the user asks for your changes only, stage only files you changed in this session.
- All mode: if no scope is specified, stage all safe changes with `git add -A`.

Use literal pathspecs for Expo Router bracket paths, for example:

```bash
git add ':(literal)apps/mobile/src/app/session/[sessionId].tsx'
```

## Workflow

1. Snapshot:

```bash
git status --short --branch
git diff --cached --stat
git log --oneline -5
```

2. In staged mode, stop if `git diff --cached --stat` is empty. In all mode, stop if there are no changes.

3. Safety scan the staged/pending set. Exclude `.env`, `.dev.vars`, `credentials.json`, `*.pem`, `*.key`, tokens, and unintended large binaries. If a dangerous file is already staged, unstage it.

4. Stage according to the selected scope.

5. Draft a conventional commit from `git diff --cached --stat`. Read the full diff only when the stat is ambiguous.

Allowed types:

```text
feat, fix, docs, chore, refactor, cfg, plan, zdx
```

Subject format:

```text
<type>(<scope>): <summary>
```

Keep the subject under 72 characters. Include finding IDs in the subject when the diff fixes tracked findings, for example `[CR-1C.1]`.

For 3+ distinct finding IDs, include a non-empty Verified By table in the body with `test:`, `manual:`, or `N/A:` entries.

When claiming a sweep, include:

```text
Sweep audit:
  rg 'pattern' path/
  -> N hits; all N now have the fix.
```

Use `(no-sweep)` if a sweep keyword is incidental.

If staged files touch `apps/api/src/services/**/*-prompts.ts` or non-test `apps/api/src/services/llm/*.ts`, ensure the matching `apps/api/eval-llm/snapshots/**` updates are staged unless this is a pure rename/comment/type-only refactor.

6. Commit:

```bash
git commit -m "$(cat <<'EOF'
<message>
EOF
)"
```

7. If hooks fail:

- Lint/format auto-fix: re-stage auto-fixed files and retry once.
- Stale NX graph: run `pnpm exec nx reset`, re-stage intended files, retry once.
- Type/test failure in related files: stop and report; do not unstage-and-ship a related broken change.
- Type/test failure in unrelated unstaged files: use `git stash push --keep-index -u -m "temp: unstaged WIP"`, commit, then `git stash pop`. If the stash entry is kept, inspect before proceeding.

Maximum two commit attempts.

8. Push after a successful commit unless explicitly asked not to. Do not force-push or rebase unless explicitly requested.

9. Report commit hash, message, committed files, excluded files, and whether push was performed.
