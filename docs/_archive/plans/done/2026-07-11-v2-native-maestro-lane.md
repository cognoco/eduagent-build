---
title: V2 Native Maestro Lane — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-1400]
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: done
---

# V2 Native Maestro Lane — Implementation Plan

**Goal:** Add an explicit native Android Maestro publish-readiness lane that builds the V2 shell and exercises Mentor, Subjects, and Journal beyond landing assertions.
**Approach:** Extend the existing trusted, secret-backed Maestro workflow with a manually selected `v2` suite and a V2-baked JS bundle. Keep the suite isolated from V0/V1 flows, reuse the existing `learning-active` seed, and add one deterministic flow that verifies the V2-only tab shape plus a route/action and return path from each tab.

## Scope

In scope:
- `apps/mobile/e2e/flows/v2/v2-shell-navigation.yaml`
- `apps/mobile/e2e/flows/_setup/seed-and-sign-in.yaml`
- `apps/mobile/e2e/flows/_setup/return-to-home-safe.yaml` and its guard chain only if required to recognize the V2 Mentor landing
- `apps/mobile/e2e/ci-maestro-manifest.json`
- `apps/mobile/e2e/scripts/ci-maestro-plan.mjs`
- `.github/workflows/e2e-ci.yml`
- `scripts/e2e-ci-injection-and-smoke-gate.test.ts`
- `apps/mobile/e2e/CONVENTIONS.md` and `apps/mobile/e2e/README.md`

Out of scope:
- Product behavior or screen implementation under `apps/mobile/src/`
- V0/V1 flow semantics or the existing `pr` and `nightly` suite contents
- Automatic production deployment or OTA publication
- Fixture-dependent MFA coverage owned by WI-1406

## Tasks

- [x] T1: Add structural regression tests for the V2 suite before implementation — done when the focused `scripts/e2e-ci-injection-and-smoke-gate.test.ts` run fails because the V2 manifest entry, planner mode, workflow flag posture, V2 interaction flow, and Mentor landing guard do not yet exist.
- [x] T2: Add the V2 interaction flow and make shared post-auth setup recognize `mentor-screen` as a valid landing — done when the flow asserts exactly the Mentor/Subjects/Journal tab IDs, rejects legacy tab IDs, opens and returns from Mentor homework capture, a seeded Subject hub, and Journal Practice, and the Maestro validator passes.
- [x] T3: Add a one-shard manual `v2` suite to the trusted Maestro planner/workflow — done when `ci-maestro-plan.mjs --suite v2 --all --format json` emits the V2 flow with the `learning-active` scenario, the release bundle receives `EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true` only for that suite, and existing `pr`/`nightly` selection remains unchanged.
- [x] T4: Document and verify the publish-readiness command and lane boundaries — done when the E2E docs name the manual dispatch procedure and V2-only build posture, the focused workflow regression suite passes, flow validation passes, workflow YAML parses, formatting/diff checks pass, and the branch contains no out-of-scope source edits.

## Tests

- **T1:** Extend `scripts/e2e-ci-injection-and-smoke-gate.test.ts` with assertions over the parsed manifest, planner source/output, workflow input/matrix/environment, V2 flow commands, and shared landing guards; run it before implementation and retain the expected failure output.
- **T2:** Run `pnpm validate:e2e` or the repository's canonical Maestro validator against the new YAML; statically assert stable testID selectors and required route-return pairs.
- **T3:** Execute the planner for `pr`, `nightly`, and `v2`; compare existing suite counts before and after and require the V2 suite to select exactly its declared manifest entries.
- **T4:** Run the focused scripts Jest project, Prettier, `git diff --check`, and the repository workflow syntax/security checks selected by the change-class guard.
