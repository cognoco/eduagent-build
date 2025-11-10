# Testing Reference – Core Summary

## TL;DR
- Use Jest for unit/integration suites with co-located test files; use Playwright for E2E journeys.
- Always follow the documented configuration patterns (workspace preset, test environments, coverage, MSW) before adding new tests.
- Load the relevant modules below based on the testing layer you are working on.

## Critical Rules
- Maintain co-located `src/**` test placement and naming conventions (`.spec`/`.test`).
- UI projects must include jest-dom, user-event, and MSW per the adopted patterns.
- Playwright suites live in `apps/web-e2e` and must abide by the provided fixtures and CI expectations.
- Any new testing guidance must cite the governing `docs/` artefact (document + section) and explain how the update supports that guidance.

## Module Index
- [Overview](module-01-overview.md)
- [Table of Contents](module-02-table-of-contents.md)
- [Test File Location](module-03-test-file-location.md)
- [Unit Tests (Jest)](module-04-unit-tests-jest.md)
- [Integration Tests](module-05-integration-tests.md)
- [E2E Tests (Playwright)](module-06-e2e-tests-playwright.md)
- [Jest Configuration Patterns](module-07-jest-configuration-patterns.md)
- [Coverage Testing](module-08-coverage-testing.md)
- [Related Documentation](module-09-related-documentation.md)

## Usage Notes
- Consult configuration modules before modifying project-level Jest or Playwright settings.
- Update the manifest and run coverage checks whenever you introduce new test layers or tooling.

