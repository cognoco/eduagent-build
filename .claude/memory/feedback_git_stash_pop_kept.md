---
name: git stash pop "kept" message means partial apply
description: When git stash pop says "stash entry is kept", the apply was INCOMPLETE — never run git stash drop without first verifying with git stash show --stat
type: feedback
originSessionId: 3ca3bc6c-e69a-4250-8557-cd875464f121
---
After `git stash pop`, if the output ends with **"The stash entry is kept in case you need it again,"** it does NOT mean "apply succeeded but couldn't drop." It means apply was **incomplete** — git silently skipped some files (often when working-tree state diverges in ways apply can't reconcile cleanly) and is keeping the stash as a safety net.

**Why:** During a BUG-913 commit recovery (2026-04-29), `git stash pop` applied only 4 of ~45 file modifications + 5 untracked, then "kept" the stash. I misread the message as "apply succeeded, drop failed," ran `git stash drop`, and would have permanently lost ~41 file mods except git keeps dropped stashes as dangling commits for ~14 days. Recovered via SHA, but it was a **destructive-action-without-confirmation** near-miss against the user's guardrails.

**How to apply:** After `git stash pop`:
1. If output mentions "stash entry is kept," DO NOT immediately drop.
2. Verify with `git stash show --stat 'stash@{0}'` and compare file count vs `git status --short`.
3. If counts diverge significantly, the apply was partial — investigate before dropping.
4. The "kept" message most often appears when working-tree files conflict with stash content but git couldn't surface the conflict markers (e.g., concurrent file modifications by parallel sessions, husky/lint-staged side effects during commit hooks).

**Recovery if already dropped:** `git fsck --no-reflogs --lost-found` finds dangling commits, or use the SHA from the drop message: `git stash apply <sha>`. Resolve any per-file conflicts with `git checkout HEAD -- <conflicting-file>` then re-apply.
