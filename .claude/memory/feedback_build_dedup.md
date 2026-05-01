---
name: Build deduplication — wait and verify before triggering
description: After merging a PR or triggering a build, wait 3 minutes and check EAS dashboard before triggering another. Merges auto-trigger CI builds.
type: feedback
---

NEVER trigger a build immediately after merging a PR. The merge itself triggers CI workflows (including `build-manual` via Mobile CI). Manually dispatching a workflow on top creates duplicate EAS builds.

**Why:** On 2026-04-01, merging PR #90 auto-triggered a Mobile CI run. Then `gh workflow run "Mobile CI"` was called manually, resulting in 3 duplicate EAS builds on the same commit. EAS builds cost money and credits are limited.

**How to apply:**
1. After merging a PR, **wait 3 minutes** before doing anything build-related
2. Run `gh run list --workflow="Mobile CI" --limit 3` to check if a build is already in progress
3. Only trigger `gh workflow run` if NO build is running for that commit
4. After triggering ANY build, wait 3 minutes and run `eas build:list --limit 3` to verify only one build was created
5. If duplicates appear, cancel the extras immediately via the EAS dashboard
6. NEVER trigger more than one build attempt — if it fails, stop and report to the user
