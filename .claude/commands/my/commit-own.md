# Commit Own Changes — Session-Scoped Commit

Commit only the files YOU changed during this session — not pre-existing
unstaged changes from other work.

## Instructions for the coordinator

You are the coordinator. Follow these steps exactly. Do NOT commit inline.

### 1. Identify your session's changes

Review which files you created, modified, or deleted during this
conversation. Use your conversation history — you know what you touched.

If you are unsure which files are yours, run `git status` and compare
against your memory of what you worked on. When in doubt, ask the user.

### 2. Stage only those files

```bash
git add <file1> <file2> ...
```

Do NOT run `git add -A`. Do NOT stage files you did not touch.

Bracket files (e.g. `[sessionId].tsx`) need `:(literal)` pathspec:
```bash
git add ':(literal)apps/mobile/src/app/session/[sessionId].tsx'
```

### 3. Invoke the commit skill

After staging, invoke the `commit` skill with the argument "staged only":

```
Skill(skill: "commit", args: "staged only")
```

The skill runs in a fresh subagent and commits only what you staged.
It will NOT add more files. It will NOT push.

### 4. Do NOT do any of the following

- Do NOT run `git commit` yourself — the skill handles it
- Do NOT run `git push` — push is a separate action
- Do NOT stage files you didn't change this session
- Do NOT skip step 3 and commit inline "because it's faster"
