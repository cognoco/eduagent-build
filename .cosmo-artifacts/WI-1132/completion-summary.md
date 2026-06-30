**What was done:** WI-1132 (restore Subjects richness — status grouping, urgency sort, book count, skeleton loading) is fully present on origin/main, landed via PR #1634 (squash f41b342b1, tagged WI-1132). A second branch/PR (#1643) was opened during the crowka backlog cleanup but is redundant — its net diff vs origin/main carries zero WI-1132 feature content.

**What changed:** The Subjects screen richness is restored on main: status grouping, urgency sort, book count, and skeleton loading state. Verified present at f41b342b1.

**Verification:** `git branch -r --contains f41b342b1` confirms the commit is on origin/main; `git diff origin/main...WI-1132` shows no remaining WI-1132 feature delta (the branch's only non-main content was an incidental ci.yml gate fix, since extracted to standalone hotfix #1664). The redundant #1643 PR is being closed.

**Caveats / Follow-ups:** #1643 closed as redundant (feature already merged via #1634). The incidental CI gate-fix found on that branch (the `@inngest-admin` guard step was missing the `docs_only` skip gate, causing spurious `pnpm: command not found` on near-empty diffs) is extracted to no-WI standalone hotfix #1664. None outstanding.
