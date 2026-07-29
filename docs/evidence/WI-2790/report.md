# WI-2790 portable API integration target — verification evidence

Date: 2026-07-26

Machine: Lancre (Linux)

Branch: `wi-2790-portable-integration-target`

## Scope and result

The API co-located integration suite now has one guarded launcher,
`scripts/run-api-integration.mjs`. The documented command
`corepack pnpm run test:api:integration` explicitly selects Doppler
`mentomate/integration`, checks Corepack's pnpm against the repository's
`pnpm@10.19.0` declaration, validates a dedicated/disposable database identity,
and then enters the Nx target. The Nx target delegates back to the same launcher
before Jest, so a raw target cannot bypass the package-manager or database gates.

No database-backed command was run for this work item. All evidence below uses
fake process binaries, static wiring checks, or non-DB repository checks.

## Red-green proof

The focused test suite was authored before the launcher or wiring changes.

RED command:

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/run-api-integration.test.ts --runInBand --no-coverage
```

Initial result: 1 suite failed, 9 tests failed. The failures showed the existing
Nx target still called bare `pnpm`, the package script still used implicit
`doppler run`, and the requested launcher did not exist.

GREEN command (after the implementation and argument-forwarding cycle):

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/run-api-integration.test.ts --runInBand --no-coverage
```

Result: 1 suite passed, 11 tests passed. The cases include:

- a hostile bare `pnpm` first on `PATH` while Corepack resolves `10.19.0`;
- Corepack resolving `11.10.0`, which stops before Jest;
- a raw target with no `DATABASE_URL`, which stops before Jest;
- the former `mentomate/stg` injection, which stops before Jest;
- ambient staging metadata on a local URL, which stops before Jest;
- a staging endpoint identity and non-disposable metadata, both of which stop
  before Jest;
- matching local disposable and remote dedicated identities, which reach only a
  fake Corepack/Jest boundary.

## Fresh non-DB verification

```text
pnpm exec jest --config scripts/jest.config.cjs --runInBand --no-coverage
  PASS (full scripts test surface)

pnpm exec tsc --build
  exit 0

pnpm exec eslint scripts/run-api-integration.mjs scripts/run-api-integration.test.ts apps/api/jest.integration.config.cjs
  exit 0

env -u DATABASE_URL <other contract vars...> NX_DAEMON=false corepack pnpm exec nx run api:integration-api --skip-nx-cache
  expected exit 1: "API integration launch refused before Jest: DATABASE_URL is required"

bash scripts/check-change-class.sh --run --fast
  9 passed, 0 failed, 0 skipped

pnpm exec prettier --check <changed files>
  all matched files use Prettier code style
```

The machine currently runs Node `24.18.0` while the repo declares Node `22.x`, so
pnpm emitted the existing unsupported-engine warning during the change-class
checks. The checks themselves passed.

## Acceptance-criteria map

1. Portable pinned pnpm: `scripts/run-api-integration.mjs`, `package.json`, and
   `apps/api/project.json`; regression cases in
   `scripts/run-api-integration.test.ts`.
2. Dedicated database contract: launcher checks explicit Doppler source,
   endpoint identity, database name, disposable marker, and protected staging /
   production host identities before Jest. Operator contract is documented in
   `docs/runbooks/local-db-testing.md`.
3. Three launch variants: named subprocess tests in
   `scripts/run-api-integration.test.ts` cover wrong PATH pnpm, missing URL, and
   the staging wrapper injection.
4. Existing gates preserved: `package.json#packageManager` remains
   `pnpm@10.19.0`; `packages/test-utils/src/lib/load-database-env.ts` was not
   changed, and the launcher refuses a missing explicit URL before its fallback
   could run.
5. Non-DB local/CI surfaces are verified above. Live execution against a remote
   database remains intentionally unclaimed pending the operator action below.

## Operator action required for live proof

1. Provision a dedicated disposable integration database/branch that is not the
   existing dev, staging, or production endpoint.
2. Create/update Doppler project `mentomate`, config `integration`, under the
   `dev` Doppler environment with the six values listed in
   `docs/runbooks/local-db-testing.md`.
3. Run `corepack pnpm run test:api:integration` from a clean Lancre worktree and
   attach the passing receipt. Do not reuse or copy the staging `DATABASE_URL`.

This operator-owned live proof is the only remaining unverified portion of AC 5.
