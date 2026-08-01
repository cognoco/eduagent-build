# WI-2990 red / green / production-revert / exact-restore evidence

Date: 2026-08-01
Initial implementation base: `dc27451ca77088ef64bf87544b61d1799e626ae1`
Current verification base: `021ab325bef0cb00d1d4a73da72542943090620c`
Scope: quick-check route consent ordering, focused route behavior, and the structural metering/consent boundary manifest.

## Repeated focused command

Every evidentiary phase used the exact live-AC command:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mentomate_test \
pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent \
  apps/api/src/routes/assessments.test.ts \
  apps/api/src/middleware/metering.coverage.guard.test.ts
```

An initial preflight invocation exited `254` because this fresh worktree did not
yet have Jest installed. `pnpm install --frozen-lockfile` completed with exit
code `0`. That harness-bootstrap failure is excluded from the behavioral RED
evidence below.

## Phase file hashes

| File | Production baseline SHA-256 | Test-first / candidate SHA-256 |
| --- | --- | --- |
| `apps/api/src/routes/assessments.ts` | `f7322a384f6453cda60acf6e157d94cfb88c80e668207b33ccc8d1dbbc316455` | `28ba500a8134b52332c4ac8c43103254d6c46bdf8f7782bf640c771687ba9743` |
| `apps/api/src/routes/assessments.test.ts` | `2444694e5b0992a57245152f169550144308504590a63c3d1b710e2f6c1230f6` | `8d65bee9e85274fa33dbf46c476eaf204d03ab4776638950dbc5c7384ed24241` |
| `apps/api/src/middleware/metering.coverage.manifest.ts` | `cc7d957fe0edb38f568d05ed9fae4a6dce6da21ac2c66b8cb257fc7443c6799` | `0ead26177ee8a12c7896c35389fdacbd8ff1ce05577813f0ad922ea70973d4cc` |
| `apps/api/src/middleware/metering.coverage.guard.test.ts` | `c4d736a50526de166752617772495175396a8617ac9a56d23d41db475f6f840` | `bbae1a438496788bfb0c8991bf34e13de7e64022aaf55d7ac6c743215d4342d5` |

The test-first phase changed only the route tests and structural guard. The
candidate production patch changed only the route and manifest. The final
production-diff SHA-256 is
`7b317bc365c942e4386060a4891ea0b687ce196879c12c74b9248b60493de92f`.

## Test-first RED

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `5 failed, 56 passed, 61 total`
- Expected failures: withdrawn consent masked missing and scoped-hidden sessions
  with `403` instead of `404`; existing topic and topicless sessions consulted
  consent before the scoped session lookup; and the manifest still classified
  quick-check as independent mixed residue instead of its final route-owned
  boundary.
- Failure class: behavioral and structural only; no setup, import, syntax, or
  database failure.

## Candidate GREEN

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `61 passed, 61 total`
- Snapshots: `0`
- Time: `0.727 s`

## Production-only REVERT RED

The route and manifest were restored to their exact production-baseline hashes
while all new tests remained. The repeated command then produced:

- Exit code: `1`
- Suites: `2 failed, 2 total`
- Cases: `5 failed, 56 passed, 61 total`
- Failure parity: the same two ownership-hiding status cases, two existing-session
  lookup-order cases, and one structural-classification case failed.

## Exact RESTORE GREEN

The identical route and manifest patch was reapplied. All four file hashes
matched the candidate hashes in the table above before the repeated command.

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `61 passed, 61 total`
- Snapshots: `0`
- Time: `0.744 s`

## Current-main verification

After `origin/main` advanced without touching the WI collision files, the branch
fast-forwarded to `021ab325bef0cb00d1d4a73da72542943090620c`. The focused command
remained green on that exact base:

- Exit code: `0`
- Suites: `2 passed, 2 total`
- Cases: `61 passed, 61 total`
- Snapshots: `0`
- Time: `0.836 s`

The routed fast validator on the same current-main tree completed the selected
TypeScript, full API unit, no-Gemini-runtime, and test-only-export gates with no
failures. Its only skip was the intentionally slow API integration lane excluded
by `--fast`. It completed 506 API suites with 10,149 passing and 11 skipped
cases plus 3 passing snapshots; detailed gate counts are preserved in
`verification.md`.

After routed validation, a type assertion made redundant by the new manifest
interface was removed from the structural test only. Its final SHA-256 became
`699fcdc73a2c721dcae357a100dd372a04891ded2d4a6a5e4d096eb8359a02f8`;
the production files and route-test hashes remained unchanged. The exact
focused command then exited `0` with 2 / 2 suites and 61 / 61 cases successful
in `0.872 s`.
