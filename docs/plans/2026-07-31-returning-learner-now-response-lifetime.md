---
title: Returning-learner Now-response lifetime — Implementation Plan
date: 2026-07-31
profile: code
work_items: [WI-2961]
status: in-progress
---

# Returning-learner Now-response lifetime — Implementation Plan

**Goal:** Keep the returning-learner Playwright proof from reading a self-scoped Now response body after Chromium can release it.
**Approach:** Attach payload parsing to the already-armed response promise so body consumption begins as soon as Playwright observes the exact response, before the Back navigation can complete. Preserve the existing request-attempt, rejected/aborted, bounded-unsettled, freshness, identity-binding, and Mentor-return proof; make no product, timeout, retry, quarantine, or staging changes.

## Scope

In scope:
- `apps/mobile/e2e-web/helpers/now-refresh-observation.ts` — immediate response/payload capture seam.
- `apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts` — mutation-sensitive success, rejection/abort, bounded non-settlement, and navigation-release regression proof.
- `apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts` — consume the captured payload instead of reading a retained Playwright `Response` after navigation.
- `docs/plans/2026-07-31-returning-learner-now-response-lifetime.md` — execution plan and verification record.

Out of scope:
- `apps/mobile/src/**`, `apps/api/**`, schemas, migrations, and all other product behavior.
- Playwright timeout/retry/quarantine configuration.
- Staging data, environment configuration, and deployment behavior.
- Work Item landing, merge, `execute complete`, review, or closure lifecycle mutations.

## Tasks

- [x] T1: Add `captureNowRefreshPayload(responsePromise, readPayload)`, returning `{ response, payload }` while invoking `readPayload` immediately when the response promise settles — done when: focused Jest coverage fails because the helper/export is absent and specifically exercises successful capture, response rejection/abort, bounded non-settlement, and a response whose body becomes unavailable on navigation release.
- [x] T2: Implement the minimal capture helper and wire the post-Back self-scoped `/v1/now` observation through it before `chat-shell-back` is clicked — done when: the focused helper suite passes and the flow reads only the captured payload after Back while retaining request-attempt, success/freshness, and Mentor/card assertions.
- [x] T3: Prove mutation sensitivity and focused flow behavior — done when: reverting the helper/flow lifetime repair makes the WI-2961 regression fail for the expected released-body reason, restoring it returns green, and the helper plus returning-learner Playwright flow pass with Playwright retries explicitly set to zero.
- [x] T4: Publish review evidence without landing — done when: repo-required validation and hooks pass, branch `WI-2961` is committed/pushed through the commit protocol, the PR references WI-2961, sibling WI-2833, run `30608972409`, and job `91134508997`, all deterministic required checks and automated review are strict green, and a fresh hosted `Playwright web smoke` run is green for the PR head.

## Tests

- **T1/T2:** `pnpm exec jest apps/mobile/e2e-web/helpers/now-refresh-observation.test.ts --runInBand`
- **T3 focused flow:** `doppler run --project mentomate -c stg -- pnpm exec playwright test -c apps/mobile/playwright.config.ts apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts --project=v2-release --retries=0`
- **T4 change class:** `bash scripts/check-change-class.sh --branch` followed by the routed commands required for the final diff.
