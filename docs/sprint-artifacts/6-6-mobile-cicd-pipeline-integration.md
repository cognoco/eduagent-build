# Story 6.6: Mobile CI/CD Pipeline Integration

Status: drafted

## Story

As a **DevOps engineer**,
I want **the mobile app integrated into the CI/CD pipeline**,
So that **mobile builds and tests run automatically**.

## Acceptance Criteria

1. **Given** mobile app is generated and working locally
   **When** a PR is created or pushed
   **Then** the following run automatically:
   - Mobile lint: `pnpm exec nx run mobile:lint`
   - Mobile test: `pnpm exec nx run mobile:test`
   - Mobile type check: included in typecheck target

2. **Given** CI workflow includes mobile
   **When** mobile lint or tests fail
   **Then** PR is blocked from merging

3. **Given** mobile CI is working
   **When** documentation is updated
   **Then** mobile CI is documented in README or docs

4. **Given** (optional) EAS Build is configured
   **When** staging deployment occurs
   **Then** mobile preview build can be triggered

## Tasks / Subtasks

- [ ] **Task 1: Update CI workflow for mobile** (AC: #1)
  - [ ] Add mobile to lint target in `.github/workflows/ci.yml`
  - [ ] Add mobile to test target
  - [ ] Add mobile to typecheck target
  - [ ] Verify Nx affected correctly includes mobile

- [ ] **Task 2: Verify mobile CI targets work** (AC: #1, #2)
  - [ ] Run mobile:lint locally and fix any issues
  - [ ] Run mobile:test locally and fix any issues
  - [ ] Push a PR that touches mobile code
  - [ ] Verify CI runs mobile targets

- [ ] **Task 3: Configure EAS Build (optional)** (AC: #4)
  - [ ] Create Expo account if needed
  - [ ] Configure `eas.json` for preview builds
  - [ ] Add EAS credentials to GitHub secrets
  - [ ] Create workflow for EAS Build trigger

- [ ] **Task 4: Document mobile CI** (AC: #3)
  - [ ] Update README with mobile CI information
  - [ ] Document any mobile-specific CI quirks
  - [ ] Document EAS Build workflow if configured

## Dev Notes

### CI Workflow Update

```yaml
# .github/workflows/ci.yml
# Update run-many command to include mobile
- run: pnpm exec nx run-many -t lint test build typecheck e2e
# Mobile will be included automatically via Nx affected
```

### Mobile-Specific CI Considerations

1. **Metro Bundler**: Not needed for lint/test in CI
2. **Native dependencies**: May need iOS/Android SDKs for full builds
3. **Expo**: Most operations work without native SDKs
4. **EAS Build**: Offloads native builds to Expo's cloud

### EAS Build Configuration (Optional)

```json
// eas.json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "distribution": "store"
    }
  }
}
```

### GitHub Secrets for EAS (if configured)

```
EXPO_TOKEN  # Expo access token for EAS Build
```

### Dependencies

This story **MUST** be completed after:
- ✅ Stories 6.1-6.4: Mobile app exists and works locally
- ✅ Epic 5: CI/CD infrastructure in place

### Expected Outputs

1. Updated `.github/workflows/ci.yml` with mobile targets
2. Working mobile lint, test, typecheck in CI
3. Documentation of mobile CI
4. (Optional) EAS Build configuration

### References

- [Source: docs/epics.md#Story-6.6]
- Prerequisites: Stories 6.1-6.4, Epic 5 CI/CD

## Dev Agent Record

### Context Reference

N/A - Story created during Epic 5/6 extension

### Agent Model Used

<!-- To be filled by implementing agent -->

### Debug Log References

<!-- To be filled during implementation -->

### Completion Notes List

<!-- To be filled after implementation -->

### File List

<!-- To be filled after implementation -->

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-08 | SM Agent (Rincewind) | Initial story creation during Epic 5/6 extension |
