# Issue Fix Plan — Living Review Follow-Up

**Author:** Codex
**Created:** 2026-03-31
**Last updated:** 2026-04-02
**Purpose:** Keep a compact running record of code-review follow-up work that has already been addressed, plus a place to append future review rounds.

---

## Current Status

Review Round 1 follow-up remains complete.

Review Round 2 follow-up is partially complete.

Review Round 3 integration-hardening follow-up is open.

Current open items:
- API routes still retain `account.id` fallbacks when `profileId` is missing, so a failed owner-profile resolution can still degrade into incorrect profile scoping.
- Speech-to-text wiring still needs a proper integration pass; the current transcript flow looks under-connected and may not receive real native recognition results reliably.
- Native-bound test coverage is still too mock-heavy to reliably catch device-only regressions in auth, animation, and voice flows.
- Mobile E2E coverage is still too shallow and too non-blocking to protect the learner experience from release-only regressions.

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

## Runtime Regression Pass

### 2026-04-02 — Latest Expo Build Triage

Status: code fixes applied on 2026-04-02; awaiting confirmation in the next fresh device build

Priority bugs reported from the latest learner build:
- Email/password sign-in unexpectedly triggered a verification-code flow that users experience as forced two-factor authentication.
- Learner Home rendered the header but no actionable cards.
- Learning Book stayed blank or appeared to hang on loading.
- Learner screens looked washed out compared with auth screens, including a hazy bottom navigation bar.
- Persona switching was still exposed inside the learner More tab.

Findings:
1. Root learner shell opacity was being animated from a partially transparent state in [app/_layout.tsx], which could leave post-auth screens washed out in device builds and make the tab bar look like it was sitting behind a haze.
2. Home content sections were wrapped in a reusable animated entry component that started at opacity `0`; on release/device builds that created a credible failure mode where the header rendered but the card stack never became visible.
3. Learning Book treated per-subject topic-retention fetches as blocking for the whole screen, so subjects could already exist while the UI still showed only a loading state.
4. The sign-in flow automatically prepared and sent email/phone verification codes whenever Clerk returned `needs_first_factor` or `needs_second_factor`, turning an optional continuation path into an unprompted code-send.
5. The learner More screen still exposed persona switching under an Appearance section, which no longer matches the intended learner navigation model.

Fixes applied:
- Removed the root opacity fade from the authenticated app shell so learner surfaces render at full opacity immediately.
- Replaced the risky `AnimatedEntry` release animation with a safe pass-through wrapper and added a Home fallback card path so Home never renders as a blank content area.
- Changed Learning Book to unblock on subject/progress data, show inline topic-history loading/fallback states, and keep subject context visible even before retention data finishes.
- Changed sign-in so verification-code continuation is explicit and opt-in instead of being auto-started after a password submit.
- Removed persona switching from the learner More tab.

Verification completed locally:
- Targeted mobile Jest coverage passed for sign-in, Home, Learning Book, and More.
- Mobile TypeScript passed after the changes.

Follow-up to defer:
- Broader mock/test-hardening work around native integrations and auth continuation paths should happen in a separate pass after the priority runtime regressions are stabilized.

---

## Deferred Quality Follow-Up

### 2026-04-02 — Wiring, Mocks, and Missing Coverage

Status: open

Scope:
- Follow-up from the post-fix code review focused on runtime wiring gaps, over-mocked tests, and missing integration coverage.

Key findings:
1. Speech-to-text looks insufficiently wired for production use. The recognition hook owns transcript state, but the current path does not clearly show native result events flowing back into that transcript, while the chat UI depends on it for preview/send behavior.
2. Unit coverage around auth and voice is too mock-heavy. Several tests replace the real boundary with fake hook state or mocked shells, which means CI can prove mocked contracts while missing real-device failures.
3. E2E coverage is too shallow for these risks. Current mobile flows do not verify that speech becomes transcript text or that audio behavior actually occurs on device.
4. E2E protection is also too weak at the workflow level because advisory runs can fail without blocking merge.
5. OAuth continuation paths still need more defensive handling and tests for cases where the provider returns without an immediately activatable session.

Concrete follow-up items:
1. Audit and, if needed, repair the speech-recognition result pipeline from native events into learner session transcript state.
2. Add at least one higher-fidelity integration path for voice mode that exercises the real hook/component boundary instead of replacing both sides with mocks.
3. Reduce mock substitution in learner-session and auth tests where it currently hides runtime behavior behind fake implementations.
4. Expand mobile E2E coverage to include post-sign-in learner smoke checks, voice transcript capture, and basic playback verification where feasible.
5. Tighten CI policy for critical E2E/auth smoke coverage so failures are visible and actionable instead of purely advisory.
6. Add sign-in and sign-up tests for non-immediate OAuth continuation branches.

Notes:
- This section is intentionally separate from the 2026-04-02 runtime regression pass because the runtime bugs above are fixed in code, while these quality-hardening items remain open.

---

## Change Log

- 2026-03-31: Initial issue-fix plan created from code-review findings.
- 2026-04-01: Converted into a living follow-up document with completed-item summary and next-review section.
- 2026-04-01: Added Review Round 2 findings and reopened active follow-up items.
- 2026-04-01: Repaired the mobile Jest config boundary so `pnpm test:mobile:unit` is reliable again.
- 2026-04-02: Added the current runtime/device regression pass covering sign-in, blank learner screens, washed-out theme rendering, and persona exposure in More.
- 2026-04-02: Added the deferred quality follow-up section for missing wiring, over-mocked tests, shallow E2E coverage, and remaining auth integration risks.
