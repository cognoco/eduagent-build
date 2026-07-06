**WI-1407 — Consent/profile gate coverage gaps; Researcher brief result**

**1. Affected Surfaces**

Save-wizard adult owner gate:

- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:79` — adult-age gate comment states this is the client-side protection for child/both flows.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:88` — `parentIsAdult` derives adult status from `computeAgeBracket(Number(parentBirthYear))`.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:91` — `adultGateRequired = FEATURE_FLAGS.ADULT_OWNER_GATE_ENABLED && needsChild`.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:95` — `canSubmit` includes `adultGatePasses`.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:323` — warning renders as `save-basics-adult-required`.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx:131` and `:165` — parent POST then child POST; regression risk is submitting under-18 parent into owner+child creation.

Mentor-memory self-screen privacy writes:

- `apps/mobile/src/app/(app)/mentor-memory.tsx:55` — `useDeleteAllMemory()` wired into the screen.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:57` — `useToggleMemoryInjection()` wired into the screen.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:59` — `useGrantMemoryConsent()` wired into the screen.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:134` — `handleDeleteAll()` opens confirmation.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:145` — confirmed clear-all calls `deleteAll.mutateAsync({})`.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:178` — `handleToggleInjection(value)` begins the screen-level toggle path.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:182` — injection toggle calls `toggleInjection.mutateAsync({ memoryInjectionEnabled: value })`.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:433` — self consent prompt renders when `consentStatus === 'pending' && isOwnerSelf`.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:442` — grant button calls `grantConsent.mutateAsync({ consent: 'granted' })`.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:460` — decline button calls `grantConsent.mutateAsync({ consent: 'declined' })`.
- `apps/mobile/src/app/(app)/mentor-memory.tsx:790` — clear-all pressable is the user-facing privacy control.

Adjacent child mentor-memory surface:

- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:387` — child consent prompt render.
- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:395` — child grant includes `childProfileId`.
- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:410` — child decline includes `childProfileId`.

**2. Existing Adjacent Coverage**

Save wizard:

- `apps/mobile/src/app/(app)/_layout.test.tsx:1881` — already tests under-18 parent with `target=child`.
- `apps/mobile/src/app/(app)/_layout.test.tsx:1910` — asserts Continue disabled.
- `apps/mobile/src/app/(app)/_layout.test.tsx:1912` — asserts `save-basics-adult-required` visible.
- `apps/mobile/src/app/(app)/_layout.test.tsx:1915` — exactly-18 boundary passes.
- `apps/mobile/src/app/(app)/_layout.test.tsx:1961` — self target skips adult gate.
- `apps/mobile/src/app/(app)/_layout.test.tsx:2003` — flag-off bypass is covered.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.test.tsx:104` — component test covers PROFILE_LIMIT child-create behavior.
- `apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.test.tsx:144` — component test uses adult parent year only; no minor rejection case there.
- `apps/mobile/src/app/(app)/_components/save-wizard/SaveWizardGate.test.tsx:146` — gate test fills adult parent + child path.

Maestro save-wizard:

- `apps/mobile/e2e/flows/onboarding/preview-parent.yaml:61` — parent+child save-wizard field entry.
- `apps/mobile/e2e/flows/onboarding/preview-parent.yaml:70` — parent birth year `1985`.
- `apps/mobile/e2e/flows/onboarding/preview-parent.yaml:85` — submits successful adult parent path.
- `apps/mobile/e2e/flows/onboarding/preview-both-child-first.yaml:70` — parent birth year `1982`.
- `apps/mobile/e2e/flows/onboarding/preview-both-child-first.yaml:85` — submits successful both path.
- No existing Maestro hit for `save-basics-adult-required`.

Mentor-memory:

- `apps/mobile/src/components/memory-consent-prompt.test.tsx:39` — shared prompt invokes `onGrant`.
- `apps/mobile/src/components/memory-consent-prompt.test.tsx:52` — shared prompt invokes `onDecline`.
- `apps/mobile/src/components/memory-consent-prompt.test.tsx:65` — pending state disables prompt buttons.
- `apps/mobile/src/hooks/use-learner-profile.test.ts:379` — hook DELETEs all memory for active profile.
- `apps/mobile/src/hooks/use-learner-profile.test.ts:515` — hook PATCHes active-profile injection toggle.
- `apps/mobile/src/hooks/use-learner-profile.test.ts:571` — hook POSTs active-profile consent grant.
- `apps/mobile/src/hooks/use-learner-profile.test.ts:596` — hook POSTs child-profile consent decline.
- `apps/mobile/src/app/(app)/mentor-memory.test.tsx:573` — screen asserts injection switch disabled in proxy mode.
- `apps/mobile/src/app/(app)/mentor-memory.test.tsx:585` — screen asserts clear-all disabled in proxy mode.
- `apps/mobile/e2e/flows/parent/child-memory-consent-prompt.yaml:58` — child consent prompt visible.
- `apps/mobile/e2e/flows/parent/child-memory-consent-prompt.yaml:69` — taps grant button.
- `apps/mobile/e2e/flows/account/learner-mentor-memory.yaml:41` — self mentor-memory screen-load assertion only.
- `apps/mobile/e2e/flows/account/learner-mentor-memory-populated.yaml:47` — populated self screen-load assertion only.

**3. Confirmed Coverage Gaps**

- `ProfileBasicsStep.test.tsx` lacks a direct component-level test for minor owner rejection: `rg` only found adult years and PROFILE_LIMIT cases, while under-18 adult-gate assertions live in the broader `_layout.test.tsx`.
- Save-wizard Maestro flows cover successful adult parent/both paths but no device flow asserts under-18 parent cannot continue or sees `save-basics-adult-required`.
- `mentor-memory.test.tsx` covers disabled write controls for proxy mode and error-formatting branches, but does not press the self-screen consent prompt, injection switch, or clear-all confirmation through to mutation calls.
- Hook tests prove API payloads, and `MemoryConsentPrompt` tests prove button callbacks, but the self screen wiring between UI controls and hooks is not covered.
- Existing child consent Maestro flow exercises child route grant, not self `/(app)/mentor-memory` owner consent prompt.

**4. Draft Acceptance Criteria For Refine**

1. Add a focused `ProfileBasicsStep` component regression test for target `child` or `both` where parent birth year resolves under 18: the Continue control remains disabled, `save-basics-adult-required` renders, and no `client.profiles.$post` request is made after pressing Continue.

2. Add or update a save-wizard Maestro flow for the minor-owner rejection path: enter a child/both save target, enter an under-18 parent birth year plus otherwise-valid child data, assert `save-basics-adult-required` is visible, and assert the flow does not advance to `save-confirm-land`.

3. Add self `MentorMemoryScreen` screen-level tests that drive `memoryConsentStatus: 'pending'`, press `memory-consent-grant` and `memory-consent-decline`, and assert `useGrantMemoryConsent().mutateAsync` receives `{ consent: 'granted' }` / `{ consent: 'declined' }` without `childProfileId`.

4. Add self `MentorMemoryScreen` screen-level test that toggles “Use saved notes in lessons” and asserts `useToggleMemoryInjection().mutateAsync` receives `{ memoryInjectionEnabled: <new value> }`.

5. Add self `MentorMemoryScreen` screen-level test that presses clear-all, confirms the destructive alert action, and asserts `useDeleteAllMemory().mutateAsync({})` is called.

6. Red-green-revert clause: before finalizing, prove at least one new regression test fails when the protected behavior is reverted locally: either remove `adultGatePasses` from `ProfileBasicsStep.canSubmit`, or disconnect one mentor-memory screen handler from its mutation; capture failing test name/output, restore the code, rerun, and record green output.

7. Verification commands for code-level work: run the relevant Jest targets directly on Windows, at minimum `ProfileBasicsStep.test.tsx`, `mentor-memory.test.tsx`, and any touched `SaveWizardGate` / `_layout` tests. Do not claim Maestro verification unless the emulator/device run actually executed.

**5. Recommended Execution Path**

**Assisted**.

Reason: the code-level coverage is straightforward and can be done headlessly, but the WI explicitly asks for a wizard e2e. The device-dependent Maestro assertion should not be claimed by a read-only/headless Codex executor unless an emulator/dev-client run is available and actually executed. If Cosmo wants an Auto slice, split it: Auto for Jest/component/screen coverage, separate verify-at-e2e-run for Maestro evidence.

**6. Device-Dependent Verification**

Mark these as `verify-at-e2e-run` unless a device/emulator runner executes them:

- New save-wizard minor-owner Maestro flow visibility/non-advance assertions.
- Any claim that the soft keyboard, scroll, or disabled CTA behavior is correct on a real device.
- Existing learner mentor-memory Maestro flows only assert screen presence/empty/populated state; expanding them to press privacy controls would require seeded state reset and should be verified in a device run, not inferred from Jest.

---
**[ BOTTOM LINE ]** `WI-1407` should refine to add component/screen Jest coverage plus a separate Maestro verification item; existing `_layout.test.tsx` already partially covers the save-wizard adult gate, but direct `ProfileBasicsStep` and self mentor-memory write wiring coverage is still missing.

**[ FYI ]**
- The brief’s “untested at every layer” is no longer literally true for save-wizard: `_layout.test.tsx:1881` already covers the under-18 child-target gate.
- The mentor-memory hook and shared prompt tests are solid adjacent coverage, but they do not prove the self screen wires privacy controls to those hooks.