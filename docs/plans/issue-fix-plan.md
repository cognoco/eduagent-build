# Issue Fix Plan — Living Review Follow-Up

**Author:** Codex
**Created:** 2026-03-31
**Last updated:** 2026-04-01
**Purpose:** Keep a compact running record of code-review follow-up work that has already been addressed, plus a place to append future review rounds.

---

## Current Status

Review Round 1 follow-up remains complete.

Review Round 2 follow-up is partially complete.

Current open items:
- API routes still retain `account.id` fallbacks when `profileId` is missing, so a failed owner-profile resolution can still degrade into incorrect profile scoping.

---

## Addressed Issues

### Review Round 1 — Session Recovery and Validation

| Area | Status | Short summary |
|------|--------|---------------|
| Session buildability and shared type contracts | completed | Removed session-flow compile blockers, refreshed stale shared declarations, and restored API/mobile typecheck stability. |
| Account lifecycle truthfulness | completed | Improved account deletion error handling so failed background event dispatches do not falsely look successful. |
| Subscription error truthfulness | completed | Stopped child paywall flows from masking subscription fetch failures. |
| Summary state integrity | completed | Restored persisted summary skip/submit state and Casual Explorer prompt behavior. |
| Milestone resume safety | completed | Preserved milestone state across resume and recovery flows so progress is not lost or duplicated. |
| System prompt transcript recovery | completed | Included persisted `system_prompt` events in transcript recovery and restored them in learner session resume flows. |
| Validation path repair | completed | Added direct Jest `.cjs` configs and stable unit test scripts for API and mobile flows. |
| Regression checklist pass | completed | Covered close/skip/submit, stale auto-close, milestone recovery, transcript restore, and celebration visibility paths. |

---

## Validation Notes

- `pnpm test:api:unit` is currently passing.
- `pnpm test:mobile:unit` is currently passing again after re-scoping the mobile Jest config to mobile tests and restoring schema import compatibility.
- Nx plugin-worker startup may still be unreliable in this environment, so direct Jest remains the preferred targeted validation path.

---

## Next Review

### Review Round 2

Status: completed on 2026-04-01

Scope:
- New project-wide code review against the current repository state.
- Focus on correctness, regressions, missing tests, and any newly introduced risky patterns.

Finding summary:
- Found and repaired a test-harness regression in the mobile direct Jest path.
- Found a remaining profile-scope fallback pattern in API routes that can still turn a missing owner profile into incorrect account-scoped behavior.

Open items:
1. Remove `?? account.id` route fallbacks for profile-scoped endpoints and replace them with an explicit missing-profile failure path.
2. Add tests for the no-owner / owner-resolution-failure branch in `profileScopeMiddleware` and at least one representative route.

---

## Change Log

- 2026-03-31: Initial issue-fix plan created from code-review findings.
- 2026-04-01: Converted into a living follow-up document with completed-item summary and next-review section.
- 2026-04-01: Added Review Round 2 findings and reopened active follow-up items.
- 2026-04-01: Repaired the mobile Jest config boundary so `pnpm test:mobile:unit` is reliable again.
