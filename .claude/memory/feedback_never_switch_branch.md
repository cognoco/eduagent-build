---
name: Never switch branches without explicit permission
description: NEVER run git checkout/switch to change branches unless the user explicitly asks — this has caused repeated frustration
type: feedback
---

NEVER switch git branches (git checkout, git switch, or any equivalent) unless the user explicitly asks to change branches.

**Why:** This has happened repeatedly and the user finds it extremely annoying. Switching branches silently can lose staged changes, confuse the working state, and disrupt the user's flow. Agents and subagents have been the main offenders.

**How to apply:**
- Before ANY git checkout/switch command, ask yourself: "Did the user ask me to change branches?" If not, DON'T.
- This applies to the main agent AND all subagents/parallel agents.
- If a task seems like it needs a different branch, ASK the user first — never assume.
- When dispatching subagents, explicitly instruct them to stay on the current branch.
- The only exception is if the user literally says "switch to X branch" or "checkout X".
