# WI-1761 implementation plan

## Goal

Produce a counsel-independent, code-grounded audit of the current consent-denial path. Do not change product behavior.

## Acceptance mapping

1. Trace the API, database, mobile, retention, reachability, and timer behavior with exact source citations.
2. Compare current behavior with the ruled Item 4-D2 dormant-denied direction.
3. Define implementation-sized gaps for the post-counsel work item.
4. Flag GDPR-relevant risks without presenting legal conclusions.

## Files

- Add `docs/audit/2026-07-11-consent-denial-behavior.md` and index it in `docs/audit/INDEX.md`.
- No runtime or schema changes.

## Verification

- Re-run every cited source search after drafting.
- Run Markdown formatting and repository documentation checks that cover the file.
- Obtain an independent adversarial review; resolve all valid findings before PR creation.
