# Story 5b.9: Final Validation and Merge to Main

**Status:** ready-for-dev

---

## User Story

As a team lead,
I want to validate the complete upgrade before merging,
So that main branch remains stable with upgraded infrastructure.

---

## Acceptance Criteria

**Given** all upgrade stories are complete
**When** I perform final validation
**Then** the following are verified:
  - Fresh clone + install works
  - All apps start correctly (web, server)
  - All test suites pass
  - E2E tests pass
  - No TypeScript errors
  - CI pipeline green

**And** PR is approved by reviewer
**And** Branch is merged to main
**And** Post-merge CI confirms stability

---

## Implementation Details

### Tasks / Subtasks

- [ ] **Task 1:** Fresh clone validation
  - [ ] Clone repo to new directory
  - [ ] Run `pnpm install`
  - [ ] Verify no installation errors
  - [ ] Verify no peer dependency warnings

- [ ] **Task 2:** Run full quality gates
  - [ ] `pnpm exec nx run-many -t lint`
  - [ ] `pnpm exec nx run-many -t typecheck`
  - [ ] `pnpm exec nx run-many -t test`
  - [ ] `pnpm exec nx run-many -t build`
  - [ ] `pnpm exec nx run-many -t e2e`

- [ ] **Task 3:** Manual smoke testing
  - [ ] Start web app: `pnpm exec nx run web:dev`
  - [ ] Verify health check page loads
  - [ ] Start server: `pnpm exec nx run server:serve`
  - [ ] Verify API health endpoint responds

- [ ] **Task 4:** Create PR
  - [ ] Write comprehensive PR description
  - [ ] Include before/after version comparison
  - [ ] Link to analysis document
  - [ ] Tag with appropriate labels (e.g., "infrastructure", "nx-upgrade")

- [ ] **Task 5:** PR review
  - [ ] Request review from team
  - [ ] Address any feedback
  - [ ] Ensure all checks pass

- [ ] **Task 6:** Merge to main
  - [ ] Use squash merge for clean history
  - [ ] Delete feature branch after merge

- [ ] **Task 7:** Post-merge validation
  - [ ] Verify CI passes on main
  - [ ] Verify Nx Cloud dashboard shows healthy state
  - [ ] Announce upgrade in team channel

### Technical Summary

**Final Validation Checklist:**

```
Pre-Merge Checklist:
├── [ ] Fresh install works (pnpm install)
├── [ ] All lint checks pass
├── [ ] All typecheck passes
├── [ ] All unit tests pass
├── [ ] All builds succeed
├── [ ] All E2E tests pass
├── [ ] Web app starts and works
├── [ ] Server starts and works
├── [ ] CI pipeline green
├── [ ] PR approved by reviewer
│
Post-Merge Checklist:
├── [ ] CI passes on main
├── [ ] Nx Cloud healthy
└── [ ] Team notified
```

**PR Description Template:**

```markdown
## Summary

Infrastructure upgrade to enable Expo SDK 54 mobile development.

## Changes

- Nx: 21.6.5 → 22.2.0+
- React: 19.0.1 → 19.1.0
- Added: @nx/expo plugin
- Added: Expo CLI and EAS CLI tooling

## Analysis

See [Epic 5b Analysis](docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md)

## Testing

- [ ] All local tests pass
- [ ] CI pipeline green
- [ ] Fresh clone + install verified
- [ ] Manual smoke testing completed

## Unblocks

- Epic 6: Mobile Walking Skeleton
```

### Project Structure Notes

- **Files to modify:** None (validation and merge only)
- **Expected test locations:** All test files across workspace
- **Estimated effort:** 2 story points (~2-4 hours)
- **Prerequisites:** Stories 5b.1-5b.8 complete

### Key Code References

- All project files (validation scope)
- `.github/workflows/ci.yml` - CI to verify
- PR to be created on GitHub

---

## Context References

**Tech-Spec:** See `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` for:
- Complete upgrade context for PR description

**Architecture:**
- `docs/epics.md` - Epic 6 dependency on 5b

---

## Handover Context

- **Assigned Persona:** 🏃 SM (Rincewind) | All personas for sign-off
- **From:** 📚 Tech Writer (Twoflower) - Story 5b.8 (docs complete)
- **Artifacts produced:** Merged PR, main branch stable, team notified
- **Handover to:** Epic 6 (Mobile Walking Skeleton) - unblocked
- **Context for next:** Nx 22.x + @nx/expo + React 19.1.0 ready; proceed with `nx g @nx/expo:app`
- **Sign-off required:** 🏗️ Architect (Vimes), 🧪 TEA (Vetinari), 💻 Dev (Mort)

---

## Dev Agent Record

### Agent Model Used

<!-- Will be populated during dev-story execution -->

### Debug Log References

<!-- Will be populated during dev-story execution -->

### Completion Notes

<!-- Will be populated during dev-story execution -->

### Files Modified

<!-- Will be populated during dev-story execution -->

### Test Results

<!-- Will be populated during dev-story execution -->

---

## Review Notes

<!-- Will be populated during code review -->
