**What was done:** Fixed WI-955 by preventing the MentorInputBar mic button from submitting the current typed draft as a fake transcript when no speech-to-text flow is wired.

**What changed:** Updated `MentorInputBar` so the mic affordance no longer calls `onTranscript(value.trim())`; it is disabled and exposes `accessibilityState={{ disabled: true }}`. Updated the focused MentorInputBar test so typed submit still works while mic press does not call `onTranscript`, including the unavailable-state path.

**Verification:** Red focused Jest run failed before the fix because mic press called `onTranscript` with `"show topic"` / `"continue session-1"`. After the fix, `pnpm exec jest src/components/mentor/MentorInputBar.test.tsx --runInBand --no-coverage` passed: 3 tests, 1 suite. `pnpm exec eslint apps/mobile/src/components/mentor/MentorInputBar.tsx apps/mobile/src/components/mentor/MentorInputBar.test.tsx` passed with the known Nx ProjectGraph cache warning.

**Caveats / Follow-ups:** The mic button remains visible but disabled until real STT is wired for MentorInputBar. Cosmo complete was intentionally not run.
