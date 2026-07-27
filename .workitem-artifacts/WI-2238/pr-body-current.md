## Summary

Completes WI-2238's V2 Subjects release proof without rebuilding the existing
product creation path: six browser cases, three release-APK journeys, exact
identity/ownership assertions, recovery states, and verified navigation
ancestry through browser and Android Back.

## What changed

- Covers multi-subject browse/search/no-results and exact row status.
- Covers World History active-session resume and Biology due review through
  their owning Subject Hubs.
- Covers API Retry, curriculum preparation, and zero-subject Photosynthesis
  creation with V2-only return destinations.
- Preserves genuine Hub ancestry through Topic and Session while consuming and
  rejecting crafted or mismatched provenance.
- Keeps inactive Subjects management-only and withholds every study/retry or
  curriculum-generation action.
- Registers bounded V2 Playwright and Maestro cases and mutation guards.

## Verification

- 15/15 affected mobile suites; 394/394 tests.
- Complete structural gate: 167/167; focused WI-2238/WI-2741 slice: 5/5.
- Maestro validator: 7/7, zero violations.
- TypeScript build: green.
- V2 Playwright catalog: 22 tests in 10 files.
- Canonical mobile: 515/515 suites; 6,806/6,806 tests; 329.215 s.
- Changed-file Prettier and diff integrity: green.
- Changed-file ESLint: zero errors; one inherited warning on an unchanged line.

## Hosted gates

The newly published exact head must pass ordinary CI, the six-case V2 browser
workflow, the three-case release-APK workflow, and a fresh zero-blocking Claude
review before governed landing. The prior native failure is diagnostic because
it stopped at the keyboard boundary now repaired by landed WI-2741.

## Failure modes

| State | Trigger | User-visible guarantee | Recovery |
|---|---|---|---|
| Subjects API failure | Initial fetch fails | Stable Retry, no false row | Retry restores exact seeded row |
| Curriculum preparing | Exact seeded Hub is incomplete | Preparing state names owning subject | Back restores same Subjects row |
| Inactive subject | Paused/archived Hub opened | Manage/Back only; no learning actions | Resume/restore through management |
| Crafted return token | Deep link lacks genuine provenance | Cannot claim Subject Hub ancestry | Ambient/direct navigation remains safe |

## Rollback

Commit revert only. No schema, external contract, deployment, or data change.

Refs: WI-2238
