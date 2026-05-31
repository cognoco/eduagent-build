# [MEDIUM] issues: write granted at workflow scope leaks to every deploy job that does not need it

**File:** [`.github/workflows/deploy.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/deploy.yml#L37-L40) (lines 37, 38, 39, 40)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `excessive-permissions`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The top-level `permissions:` block (L37-40) sets `issues: write`, which every job in the workflow inherits: api-quality-gate, api-confirm-production, api-deploy, the mobile jobs, and the smoke-test jobs. Only the two failure-notification steps that call actions/github-script to open an issue (L312-343, L448-478) actually require it. Granting the issues:write-capable GITHUB_TOKEN to the build/deploy jobs means any step or dependency running there (even though all actions are SHA-pinned today) operates with more ambient authority than its task requires — a least-privilege deviation in a workflow that also holds production deploy secrets (CLOUDFLARE_API_TOKEN, DATABASE_URL_*, DOPPLER_TOKEN_*). Impact is bounded (issues:write cannot modify code, secrets, releases, or deployments), hence MEDIUM with modest practical risk.

## Recommendation

Reduce the top-level block to `contents: read` (plus `actions: read` if needed) and add `permissions: { issues: write }` only on the specific jobs that create issues (api-deploy, api-smoke-test, api-production-smoke-test). This keeps the failure-notification feature working while removing issues:write from the build/deploy/quality-gate jobs.

## Revalidation

**Verdict:** true-positive

Confirmed by both passes. The top-level `permissions:` block (lines 37-40) sets `actions: read`, `contents: read`, `issues: write`, and no job declares a per-job `permissions:` override (verified across api-quality-gate, api-confirm-production, api-deploy, api-smoke-test, api-production-smoke-test, mobile-confirm-production, mobile-deploy). Only three actions/github-script failure-notification steps (lines ~312/449/536) actually need issues:write; every build/deploy/quality-gate job — including jobs holding CLOUDFLARE_API_TOKEN, DATABASE_URL_*, DOPPLER_TOKEN_*, and EXPO_TOKEN — inherits it unnecessarily. This is a genuine least-privilege deviation. Impact is bounded (issues:write cannot read secrets, push code, or alter deployments), so practical risk is modest; the original MEDIUM is at the high end (a case could be made for a lower hygiene rating, but there is no lower tier in the rubric). Fix: scope issues:write to only the notification jobs.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-28)
