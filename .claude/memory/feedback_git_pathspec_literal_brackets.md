---
name: git pathspec for filenames with literal brackets
description: When stashing/adding files whose names contain literal [ or ] (Expo Router dynamic segments), use :(literal) pathspec magic or git will treat brackets as a glob character class
type: feedback
---

When running `git stash push -- <path>` or `git add -- <path>` on a file whose name contains literal brackets — common with Expo Router dynamic segment files like `[sessionId].tsx`, `[bookId].tsx`, `[subjectId]/index.tsx` — git's pathspec parser interprets `[abc]` as a character-class glob, not a literal. This can cause the operation to silently match unintended files (e.g., pathspec for `[sessionId].tsx` matching both `[sessionId].tsx` and `[sessionId].test.tsx` when present together).

**Why:** Pre-commit stash/pop workflows using bracketed pathspecs have dropped or commingled changes silently. Specifically observed during the BUG-LIB-TOPICS commit: two sequential `git stash push -- '[sessionId].tsx'` and `'[sessionId].test.tsx'` calls coupled the wrong files into the wrong stashes, and the second `stash pop` failed on an already-present file because the first pop restored more than expected.

**How to apply:** Any time a pathspec targets a file in `apps/mobile/src/app/**` with a dynamic segment filename (contains literal `[` or `]`), prefix the pathspec with the literal magic:

```
git stash push -- ':(literal)apps/mobile/src/app/session-summary/[sessionId].tsx'
git add -- ':(literal)apps/mobile/src/app/shelf/[subjectId]/book/[bookId].tsx'
```

Alternatively, escape the brackets with `\[` and `\]` inside single quotes (behavior varies by git version — `:(literal)` is the reliable form).

**Recovery if it already happened:** Before dropping a stash whose contents look suspicious, diff the stash against the working tree per-file with `git diff stash@{N} -- '<path>'`. If the diff is empty for a given file, the working tree already has the stash's content for that file and dropping is safe for it. Extract any files that only live in the stash via `git checkout stash@{N} -- '<path>'` before `git stash drop`.
