# C1 Mock Inventory Artifacts

Generated from repo state with `pnpm exec tsx scripts/generate-c1-mock-inventory.ts`.

- Commit: `a0ce9751`
- Branch: `cleanup`
- Total `jest.mock()` rows: **969**
- Test files with at least one row: **264**

Rows are classified with a mix of exact overrides from the Phase 1 plan and
repeatable heuristics. The `basis` column in each TSV shows which path was
used for that row.

## Category Counts

| Category | Count |
| --- | ---: |
| `auth/middleware-bypass` | 32 |
| `EXTERNAL` | 351 |
| `pure-data-stub` | 454 |
| `rate-limit-bypass` | 1 |
| `service-stub-with-business-logic` | 131 |

## Slice Counts

| Slice | Surface | Count |
| --- | --- | ---: |
| `slice-A` | apps/api/src/services (unit) | 77 |
| `slice-B` | apps/api/src/routes (unit) | 160 |
| `slice-C` | apps/api/src/middleware + apps/api/src/inngest (unit) | 154 |
| `slice-D` | apps/mobile/src/app | 387 |
| `slice-E` | apps/mobile/src/components | 85 |
| `slice-F` | apps/mobile/src/hooks + apps/mobile/src/lib | 89 |
| `slice-G` | apps/api/src local integration tests | 6 |
| `slice-H` | tests/integration cross-package | 9 |
| `slice-I` | apps/api/eval-llm | 1 |
| `slice-J` | packages/* | 1 |
