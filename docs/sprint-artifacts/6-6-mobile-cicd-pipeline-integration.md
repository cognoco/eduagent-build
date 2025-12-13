# Story 6.6: Mobile CI/CD Pipeline Integration

Status: review

## Story

As a DevOps engineer maintaining the monorepo,
I want the mobile app integrated into the CI/CD pipeline,
So that mobile code quality is automatically validated and preview builds are generated.

## Acceptance Criteria

1. **AC-6.6.1**: Mobile-specific CI workflow file created (`.github/workflows/mobile-ci.yml`)
2. **AC-6.6.2**: Mobile lint runs on PR/push when mobile code affected: `pnpm exec nx run mobile:lint`
3. **AC-6.6.3**: Mobile test runs on PR/push when mobile code affected: `pnpm exec nx run mobile:test`
4. **AC-6.6.4**: Mobile type check included in workspace typecheck target
5. **AC-6.6.5**: Nx affected detection correctly identifies mobile as affected when relevant files change
6. **AC-6.6.6**: EAS Build configured for preview builds (Android-only for PoC)
7. **AC-6.6.7**: Mobile-specific secrets (EXPO_TOKEN) documented and configured
8. **AC-6.6.8**: CI workflow passes with new mobile project

## Tasks / Subtasks

- [ ] **Task 1: Create Mobile CI Workflow File** (AC: 1)
  - [ ] 1.1 Create `.github/workflows/mobile-ci.yml` with appropriate triggers
  - [ ] 1.2 Configure workflow to trigger on PR/push with mobile-related path filters
  - [ ] 1.3 Add job dependency on affected check to skip when mobile not affected
  - [ ] 1.4 Configure Node.js, pnpm, and Nx setup steps

- [ ] **Task 2: Implement Nx Affected Detection** (AC: 5)
  - [ ] 2.1 Add `check-affected` job using `nx show projects --affected`
  - [ ] 2.2 Set job output for conditional execution
  - [ ] 2.3 Configure fetch-depth for proper git history

- [ ] **Task 3: Configure Mobile Lint Job** (AC: 2)
  - [ ] 3.1 Add lint job depending on affected check
  - [ ] 3.2 Run `pnpm exec nx run mobile:lint`
  - [ ] 3.3 Ensure lint failure blocks PR merge

- [ ] **Task 4: Configure Mobile Test Job** (AC: 3)
  - [ ] 4.1 Add test job depending on affected check
  - [ ] 4.2 Run `pnpm exec nx run mobile:test`
  - [ ] 4.3 Ensure test failure blocks PR merge

- [ ] **Task 5: Validate Type Check Integration** (AC: 4)
  - [ ] 5.1 Verify mobile project is included in `nx run-many -t typecheck`
  - [ ] 5.2 Confirm typecheck target exists in mobile project.json
  - [ ] 5.3 No changes needed if already configured by @nx/expo generator

- [ ] **Task 6: Configure EAS Build Integration** (AC: 6)
  - [ ] 6.1 Verify `eas.json` exists with build profiles (development, preview, production)
  - [ ] 6.2 Add EAS build job triggered on merge to main
  - [ ] 6.3 Use `expo/expo-github-action@v8` for EAS CLI
  - [ ] 6.4 Configure Android-only build (`--platform android`)
  - [ ] 6.5 Add `--non-interactive` flag for CI environment

- [ ] **Task 7: Document and Configure Secrets** (AC: 7)
  - [ ] 7.1 Document EXPO_TOKEN generation process in README or docs
  - [ ] 7.2 Add instructions for configuring GitHub repository secret
  - [ ] 7.3 Reference `docs/mobile-environment-strategy.md` for complete secrets documentation

- [ ] **Task 8: Test CI Pipeline** (AC: 8)
  - [ ] 8.1 Push branch with mobile changes to trigger CI
  - [ ] 8.2 Verify affected detection works correctly
  - [ ] 8.3 Verify lint and test jobs execute
  - [ ] 8.4 Verify EAS build triggers on merge (or manual trigger for testing)
  - [ ] 8.5 Confirm no regression in existing web/server CI

- [ ] **Task 9: Update Sprint Status** (AC: all)
  - [ ] 9.1 Update sprint-status.yaml: set 6-6 status to done
  - [ ] 9.2 Document completion notes in Dev Agent Record

## Dev Notes

### CI/CD Architecture Overview

> **Primary Reference:** `docs/mobile-environment-strategy.md` → CI/CD Integration section
> **Tech Spec Reference:** `docs/sprint-artifacts/tech-spec-epic-6.md` → CI/CD Implementation section

Mobile CI uses a **separate workflow file** to keep mobile builds independent from web/server CI. This is important because:
- EAS builds can take 10-30 minutes (shouldn't block web/server PRs)
- Nx affected detection enables smart triggering
- Separation allows independent optimization

### Workflow Architecture

```
.github/workflows/
├── ci.yml              # Existing: web + server (lint, test, build, e2e)
└── mobile-ci.yml       # NEW: mobile-specific workflow
```

### Smart Triggers with Nx Affected

The workflow uses `nx show projects --affected` to determine if mobile CI should run:

```yaml
on:
  pull_request:
    paths:
      - 'apps/mobile/**'
      - 'packages/api-client/**'
      - 'packages/schemas/**'
  push:
    branches: [main]
```

### CI Flow Diagram

```
PR Created (touches apps/mobile/)
    │
    ▼
Check if mobile affected (Nx)
    │
    ├── No ──► Skip mobile CI (fast path)
    │
    └── Yes ─► Run lint + test
                    │
                    ▼
              PR Merged to main
                    │
                    ▼
              EAS Preview Build (Android)
                    │
                    ▼
              Build available on Expo dashboard
```

### EAS Build Profiles

| Profile | Purpose | Distribution | Trigger |
|---------|---------|--------------|---------|
| `development` | Dev builds with Metro connection | EAS Internal | Manual |
| `preview` | QA testing, production-like | EAS Internal | PR merge to main |
| `production` | Play Store release | Play Store | Manual/release tag |

### Expected CI Timing

| Stage | Duration | Notes |
|-------|----------|-------|
| Check affected | ~30 seconds | Nx graph analysis |
| Lint + Test | ~2-3 minutes | Jest with Nx caching |
| EAS Preview Build | ~10-20 minutes | Cloud build, cached layers help |
| **Total (with build)** | ~15-25 minutes | Runs in parallel with web CI |

### Secrets Documentation

| Secret | Purpose | Where to Configure |
|--------|---------|-------------------|
| `EXPO_TOKEN` | EAS Build authentication | GitHub Settings → Secrets |

**To generate EXPO_TOKEN:**
1. Run `npx eas login` locally (or verify already logged in)
2. Go to https://expo.dev/accounts/[username]/settings/access-tokens
3. Create a new access token with appropriate permissions
4. Add to GitHub repository as secret named `EXPO_TOKEN`

### Platform Constraint

**Android-only for PoC/Phase 2.** iOS build configuration deferred until hardware available.

### Project Structure Notes

- Mobile CI workflow should be in `.github/workflows/mobile-ci.yml`
- EAS configuration should already exist in `apps/mobile/eas.json` (from Story 6.1)
- Path filters should include shared packages that mobile depends on

### Learnings from Previous Story

**From Story 6-5-document-mobile-development-setup (Status: done)**

- **Documentation complete**: `apps/mobile/README.md` and `docs/mobile-environment-strategy.md` are comprehensive
- **Practical validation performed**: All documented commands work correctly
- **Tiered connectivity model**: Emulator→localhost, device→staging approach fully explained
- **Android-only constraint**: Documented clearly in all relevant places

[Source: docs/sprint-artifacts/6-5-document-mobile-development-setup.md#Dev-Agent-Record]

### References

- [Source: docs/mobile-environment-strategy.md] - Primary CI/CD documentation
- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#CI/CD-Implementation] - Detailed implementation spec
- [Source: docs/epics.md#Story-6.6] - Original story definition
- [Source: apps/mobile/eas.json] - EAS build profiles
- [Expo GitHub Action](https://github.com/expo/expo-github-action)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Nx Affected Commands](https://nx.dev/nx-api/nx/documents/affected)

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/6-6-mobile-cicd-pipeline-integration.context.xml` (Generated 2025-12-13)

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | SM Agent (Rincewind) | Initial draft created from workflow in yolo mode |
