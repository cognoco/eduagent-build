---
name: Production deploy approval gate not configured
description: GitHub Environment protection rules for 'production' environment are missing — deploy runs without manual approval
type: project
---

Production deploy workflow (`deploy.yml`) has an `api-confirm-production` job that uses `environment: production`, but the GitHub Environment protection rules are NOT configured in the repo settings. As a result, production deploys run straight through without pausing for approval.

**Why:** Discovered 2026-03-28 when a production deploy was triggered and completed without any approval prompt.

**How to apply:** Before the app goes live, configure the `production` environment in GitHub repo settings (Settings → Environments → production) with required reviewers. Until then, treat production deploys as unguarded.
