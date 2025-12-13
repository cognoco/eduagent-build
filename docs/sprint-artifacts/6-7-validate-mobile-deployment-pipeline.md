# Story 6.7: Validate Mobile Deployment Pipeline

Status: ready-for-dev

## Story

As a stakeholder reviewing mobile CI/CD implementation,
I want to verify the mobile CI pipeline works correctly,
So that I have confidence mobile app quality is maintained automatically.

## Acceptance Criteria

1. **AC-6.7.1**: PR touching only `apps/web/` does NOT trigger mobile CI workflow
2. **AC-6.7.2**: PR touching `apps/mobile/` triggers mobile lint and test jobs
3. **AC-6.7.3**: Intentional lint failure blocks PR merge
4. **AC-6.7.4**: Intentional test failure blocks PR merge
5. **AC-6.7.5**: Merge to main triggers EAS preview build (Android)
6. **AC-6.7.6**: Build artifact accessible from Expo dashboard
7. **AC-6.7.7**: Nx Cloud shows mobile task caching working
8. **AC-6.7.8**: No regression in existing web/server CI pipeline
9. **AC-6.7.9**: Mobile CI timing documented (expected: ~15-25 min with EAS build)

## Tasks / Subtasks

- [ ] **Task 1: Validate Smart Trigger Behavior** (AC: 1, 2)
  - [ ] 1.1 Create test branch modifying only `apps/web/` file (e.g., update a comment)
  - [ ] 1.2 Open PR and verify mobile-ci.yml workflow does NOT run
  - [ ] 1.3 Create second test branch modifying `apps/mobile/` file
  - [ ] 1.4 Open PR and verify mobile-ci.yml workflow DOES run
  - [ ] 1.5 Test with `packages/api-client/` change to verify path filter includes shared packages
  - [ ] 1.6 Document results in this story file

- [ ] **Task 2: Validate Lint Gate** (AC: 3)
  - [ ] 2.1 Create branch with intentional ESLint violation in `apps/mobile/`
  - [ ] 2.2 Open PR and verify lint job fails
  - [ ] 2.3 Verify PR is blocked from merge (required status check)
  - [ ] 2.4 Fix lint error and verify job passes on re-run
  - [ ] 2.5 Document behavior in this story file

- [ ] **Task 3: Validate Test Gate** (AC: 4)
  - [ ] 3.1 Create branch with intentional test failure in `apps/mobile/`
  - [ ] 3.2 Open PR and verify test job fails
  - [ ] 3.3 Verify PR is blocked from merge (required status check)
  - [ ] 3.4 Fix test and verify job passes on re-run
  - [ ] 3.5 Document behavior in this story file

- [ ] **Task 4: Validate EAS Build Integration** (AC: 5, 6)
  - [ ] 4.1 Merge a PR with mobile changes to main branch
  - [ ] 4.2 Verify EAS preview build job triggers automatically
  - [ ] 4.3 Wait for build completion (expect 10-20 minutes)
  - [ ] 4.4 Verify build artifact accessible from Expo dashboard
  - [ ] 4.5 Download and verify APK is installable (optional: install on emulator)
  - [ ] 4.6 Document EAS build timing and URL in this story file

- [ ] **Task 5: Validate Nx Cloud Integration** (AC: 7)
  - [ ] 5.1 Run mobile lint twice in CI (separate commits)
  - [ ] 5.2 Check Nx Cloud dashboard for mobile task entries
  - [ ] 5.3 Verify cache hit on second run (reduced execution time)
  - [ ] 5.4 Document cache behavior in this story file

- [ ] **Task 6: Validate No Regression** (AC: 8)
  - [ ] 6.1 Review main ci.yml workflow logs during validation period
  - [ ] 6.2 Verify web and server lint, test, build, e2e still pass
  - [ ] 6.3 Confirm no new warnings or errors introduced
  - [ ] 6.4 Document any observations in this story file

- [ ] **Task 7: Document CI Timing and Summary** (AC: 9)
  - [ ] 7.1 Record timing for each CI stage (check-affected, lint, test, EAS build)
  - [ ] 7.2 Create summary table in this story file
  - [ ] 7.3 Update README or docs with mobile CI documentation
  - [ ] 7.4 Note any recommendations for optimization

- [ ] **Task 8: Update Sprint Status** (AC: all)
  - [ ] 8.1 Update sprint-status.yaml: set 6-7 status to done
  - [ ] 8.2 Update epic-6 status if all stories complete
  - [ ] 8.3 Document completion notes in Dev Agent Record

## Dev Notes

### Validation Story Context

This is a **validation story** - the goal is to verify that Story 6.6's mobile CI/CD implementation works correctly, not to create new infrastructure. The validation approach:

1. **Positive testing**: Verify expected behavior when mobile code changes
2. **Negative testing**: Verify gates block bad code (intentional failures)
3. **Boundary testing**: Verify non-mobile changes don't trigger mobile CI
4. **Performance testing**: Document timing characteristics
5. **Integration testing**: Verify EAS Build and Nx Cloud work together

### Workflow Architecture (Reference)

```
.github/workflows/
├── ci.yml              # Web + Server (unchanged by this epic)
└── mobile-ci.yml       # Mobile-specific (created in Story 6.6)
```

### Expected CI Flow

```
PR Created (touches apps/mobile/)
    │
    ▼
Check if mobile affected (Nx)
    │
    ├── No ──► Skip mobile CI (fast path) [AC-6.7.1]
    │
    └── Yes ─► Run lint + test [AC-6.7.2]
                    │
                    ├── Fail ──► Block PR [AC-6.7.3, AC-6.7.4]
                    │
                    └── Pass ──► Allow merge
                                    │
                                    ▼
                              PR Merged to main
                                    │
                                    ▼
                              EAS Preview Build [AC-6.7.5]
                                    │
                                    ▼
                              Build on Expo dashboard [AC-6.7.6]
```

### Expected CI Timing (From Tech Spec)

| Stage | Expected Duration | Notes |
|-------|-------------------|-------|
| Check affected | ~30 seconds | Nx graph analysis |
| Lint + Test | ~2-3 minutes | Jest with Nx caching |
| EAS Preview Build | ~10-20 minutes | Cloud build, cached layers help |
| **Total (with build)** | ~15-25 minutes | Runs in parallel with web CI |

### Platform Constraint

**Android-only for PoC/Phase 2.** All validation is performed on Android builds only.

### Prerequisites

- Story 6.6 must be implemented (mobile-ci.yml workflow created)
- `EXPO_TOKEN` secret configured in GitHub repository
- EAS project initialized and linked

### Project Structure Notes

- Test branches should be created from `main` for accurate affected detection
- Use `--base=origin/main` in Nx commands for consistent baseline
- Path filters should include: `apps/mobile/**`, `packages/api-client/**`, `packages/schemas/**`

### Learnings from Previous Story

**Story 6.6 (Mobile CI/CD Pipeline Integration)** is the prerequisite:
- Creates `.github/workflows/mobile-ci.yml`
- Configures Nx affected detection
- Sets up EAS Build integration for preview builds
- Documents secrets management (EXPO_TOKEN)

This validation story verifies all of Story 6.6's deliverables work correctly.

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#CI/CD-Implementation] - Detailed validation checklist
- [Source: docs/mobile-environment-strategy.md#CI/CD-Integration] - CI flow and architecture
- [Source: docs/epics.md#Story-6.7] - Original story definition
- [Expo Dashboard](https://expo.dev/) - Build artifact location
- [Nx Cloud Dashboard](https://cloud.nx.app/) - Task caching verification

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/6-7-validate-mobile-deployment-pipeline.context.xml` (Generated 2025-12-13)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

### File List

## Validation Results

*To be filled during implementation:*

### Smart Trigger Test Results

| Test Case | Branch | Expected | Actual | Pass? |
|-----------|--------|----------|--------|-------|
| Web-only change | TBD | Mobile CI skipped | | |
| Mobile change | TBD | Mobile CI runs | | |
| Shared package change | TBD | Mobile CI runs | | |

### Gate Test Results

| Test | Expected Behavior | Actual | Pass? |
|------|-------------------|--------|-------|
| Lint failure | PR blocked | | |
| Test failure | PR blocked | | |
| Both passing | PR mergeable | | |

### EAS Build Results

| Metric | Value |
|--------|-------|
| Build triggered | |
| Build duration | |
| Artifact URL | |
| APK installable | |

### CI Timing Summary

| Stage | Actual Duration | Notes |
|-------|-----------------|-------|
| Check affected | | |
| Lint | | |
| Test | | |
| EAS Build | | |
| **Total** | | |

### Nx Cloud Cache Verification

| Run | Cache Status | Notes |
|-----|--------------|-------|
| First run | | |
| Second run | | |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | SM Agent (Rincewind) | Initial draft created from workflow in yolo mode |
