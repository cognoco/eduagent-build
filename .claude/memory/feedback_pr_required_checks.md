---
name: PR Required Check Triage
description: Lessons from PR #233 where green CI was still blocked by a missing required API Quality Gate.
type: feedback
---

When a PR shows an expected required check stuck on "Waiting for status to be reported", first search workflows for the exact check/job name. A required check can be configured in branch protection even if its workflow only runs on `push` or `workflow_dispatch`, so the fix may be workflow trigger drift rather than failing code.

**Why:** PR #233 had passing CI and Playwright, but `API Quality Gate` was required and never reported because it lived in `deploy.yml`, which did not run on pull requests.

**How to apply:** Prefer a small PR-only workflow/job that reports the required check name without starting deploy machinery. If adding a PR trigger to an existing deploy workflow is unavoidable, explicitly guard deploy/build jobs so pull requests cannot deploy. In deploy workflows, do not rely on skipped `needs` results alone; include an event guard such as `github.event_name == 'push' || github.event_name == 'workflow_dispatch'` on deploy jobs.

For Playwright web smoke failures, inspect `error-context.md` plus the trace network log before changing selectors. If the UI shows offline/profile fallbacks and `0-trace.network` has `net::ERR_FAILED`/CORS failures, fix the staging/API target or workflow configuration instead of weakening the assertion. A missing shelf row can be a real user-visible symptom while the root cause is still staging network/CORS failure in the trace.

After pushing a PR fix, `gh pr checks --watch` may briefly say no checks are reported. Wait a few seconds or inspect `gh pr view --json statusCheckRollup` before assuming the push failed to trigger workflows.

Automated review comments can arrive after checks turn green. Treat "ready to merge" as current checks plus a fresh review/comment sweep, not checks alone.
