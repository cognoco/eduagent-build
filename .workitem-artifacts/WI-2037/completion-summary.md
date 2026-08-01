# Completion summary — WI-2037

## What was done

Defined the distinct authenticated-adult authority ceremony for a credentialed learner aged 13–16 who is below the current residence-policy consent age, rewrote the pre-live family-join ADR in place, and reconciled identity canon plus both operational roadmap mirrors.

## What changed

- Bound the ceremony to an authenticated adult Person, verified legal qualification at the required assurance/VPC level, current residence policy, the complete destination-purpose set, and a named `GuardianAttachEvidenceV1` envelope.
- Required one canonical-lock transaction to confirm or create Guardianship, write every fresh destination grant, terminalize requests, invalidate stale email tokens, and commit the audit evidence together.
- Preserved ordinary scoped email approval/denial/withdrawal while prohibiting email, invitation, role, payment, Membership, Supportership, or learner nomination from creating Guardianship or resuming the family join.
- Defined missing, stale, withdrawn, denied, expired, drifted, partial, replayed, cross-Organization, concurrent, and provider-unavailable states with user-visible recovery behavior.
- Assigned implementation and API/integration/mobile regressions to WI-2533 and kept WI-1753 at 17+ until that implementation lands without narrowing the existing beta recruitment criterion.
- Recorded Jørn's 2026-08-01 provisional approval in an explicit ADR rider and linked final Zuzka ratification to OPQ-160 without retaining a delivery blocker.

## Verification

See `.workitem-artifacts/WI-2037/verification.md`. Targeted decision-link, teen-consent, formatting, diff, JSON, change-class, moving-base, and open-PR collision checks passed. Independent Standards and Spec-axis re-reviews returned PASS after all findings were corrected.

## Caveats / Follow-ups

Final Architecture ratification remains tracked in OPQ-160; delivery and landing are authorized under the provisional-approval rider. WI-2533 must implement and regression-test the contract; if current consent-grant storage cannot retain the versioned evidence envelope, capture and land a schema prerequisite rather than weaken the contract.
