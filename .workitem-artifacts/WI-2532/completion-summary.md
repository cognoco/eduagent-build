## What was done

Added a durable Me-or-someone-else fork after an adult completes family-intent
profile creation.

## What changed

- The adult profile is created without an automatic family-context write or
  child-profile redirect.
- Me continues ordinary learner onboarding.
- Someone else opens an own-login question; credentialed learners reach the
  existing family-join invitation form, while the unavailable managed path is
  explicit.
- The unfinished fork is stored per profile and restored after remount or
  relaunch. Me durably clears it before synchronous `onComplete`
  mounts/reveals the learner shell; the existing-account destination clears
  only after its real route mounts, whether that route shows the V2 invitation
  form or the older-shell unavailable gate. Sign-out also clears it.
- Storage failures fail closed with retry; a failed handoff after profile
  creation retries only the durable marker and never repeats the profile POST.
- Successful initial and retry persistence complete through the current shell:
  V2 lands at Mentor and older shells retain Home. Cancel, pending-consent, and
  ordinary add-child exits retain their existing close behavior.
- Dedicated translated copy, focused mobile coverage, and a preview browser
  journey were added.

## Verification

The merge-forward union passed 470 tests across thirteen suites: durable state,
both branches, profile creation, app-layout restoration, invitation routing,
sign-out cleanup, session routing, consent routing, link resubmit-generation
guards, and first-Mentor language confirmation. The durable family-intent probe
now resolves before the first-Mentor language gate can render. The full mobile
unit stage, full API unit stage under the sanctioned development database
boundary, TypeScript build, i18n ratchets, teen-consent claims ratchet,
test-only export guard, GC1 mock-governance ratchet, warning-free touched-file
lint, exact-file Prettier, and whitespace check passed.
Review-bounce coverage also verifies stale-read rejection, recovery-primary
repair, all-mode terminal destination consumption, and a
mounted-but-inaccessible blocked navigator. The dedicated preview journey
passed in 1.7 minutes and reached the invitation form without a supportership
write.

## Caveats / Follow-ups

The managed learner without an independent login remains intentionally
unavailable and is presented as such. This change does not activate or authorize
that path. The branch was merge-forwarded with landed WI-2231 routing, WI-2399
resubmit-generation guards, and WI-1556 first-Mentor language confirmation; no
history was rewritten. The Work Item remains Executing until its PR lands;
lifecycle completion must not run while the PR is open.
