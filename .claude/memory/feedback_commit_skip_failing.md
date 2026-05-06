---
name: Commit what passes, skip failing files
description: Diagnose pre-commit hook failures by relatedness before deciding to skip-and-ship; never silently ship related failures.
type: feedback
originSessionId: d5bd725c-61cb-4654-84b6-de8cbc2737c4
---

When pre-commit hooks fail, classify the failure before deciding what to do:

- **Tooling noise** (stale snapshot, lint config glitch, pre-existing failure in code you didn't touch): unstage the failing files, commit the rest, push. The failing files remain in the working tree to address in a separate commit.
- **Unrelated failures** (the failing files are in a different logical scope from your commit — different feature, different layer): same as above. Skip-and-ship is appropriate.
- **Related failures** (the failing file is a test for code you're committing, or is in the same logical scope as your commit, or is a typecheck failure in code your committed change depends on): **do NOT skip-and-ship.** Either fix the failure inline (it's part of the work), or split the commit so each commit represents a logically complete change. Shipping half a feature with the other half left in the working tree degrades commit integrity and breaks `git bisect`.

If you're unsure whether a failure is related: assume related. The cost of a slightly larger commit is lower than the cost of an unverified one.
