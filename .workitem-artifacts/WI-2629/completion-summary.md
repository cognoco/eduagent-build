# WI-2629 — Retain mentor-notice evidence identity after transcript purge (AC-4 rework)

## What was done

Reopened the original mentor-notice evidence-identity fix after final audit found that the shared LLM envelope still rejected otherwise-valid proposals when `learnerQuote` was omitted. The envelope contract now matches the ratified optional transient-input rule without weakening durable answer-event provenance.

## What changed

- The existing forward migration, scalar `answerEventId`, partial unique indexes, transcript-purge survival, profile/session cascades, required-write boundary, legacy nullable reads, and rollback warning remain unchanged.
- `noticedGapSignalSchema` now makes only `learnerQuote` optional; when present it remains a non-empty bounded string, and `answerEventId` remains a required UUID.
- Focused schema tests prove omitted and present non-empty quotes are accepted while a missing `answerEventId` and an empty present quote are rejected.
- Existing service tests continue to prove quote mismatch rejection and profile/session/user-message provenance enforcement when the quote is absent.

## Verification

The focused envelope regression failed before the schema correction, passed after it, failed again when the correction was reverted, and passed after exact restoration. The complete envelope suite and focused mentor-notice evidence and creation suites passed. The routed fast shared-schema gate passed full incremental type checking, the complete API and mobile unit suites, and the test-only-export ratchet. Database-backed API and cross-package integration suites were also run as the routed slow checks.

## Caveats / Follow-ups

No contract expansion or persistence change was made. The LLM prompt may still normally supply a quote, but omission no longer drops an otherwise-valid proposal before the server can perform authoritative provenance validation.
