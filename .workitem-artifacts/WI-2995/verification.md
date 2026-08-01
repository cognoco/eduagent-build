# WI-2995 verification

Date: 2026-08-01
Reviewed base: `764748015d460b08449d3b6898cd1188f8552d93`
Runtime: Node `22.16.0`

## Focused contract

- Command: `pnpm exec jest --config apps/api/jest.config.cjs --runInBand --silent apps/api/src/routes/assessments.test.ts`
- Exit code: `0`
- Suites: 1 / 1 successful
- Cases: 34 / 34 successful
- The malformed UUID case proves no session lookup, consent enforcement,
  topic-context lookup, or LLM dispatch occurs. The same suite preserves valid
  missing, scoped-hidden, withdrawn-consent, topic-scoped active-consent, and
  topicless active-consent behavior.

## Routed validation

```sh
DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 \
bash scripts/check-change-class.sh --run --fast
```

- Exit code: `0`
- Routed gates: 4 successful, 0 failed, 1 sanctioned slow integration lane
  skipped by `--fast`.
- Full incremental TypeScript build: successful.
- API unit lane: all 506 suites successful; 10,154 cases successful, 9 skipped,
  and 3 snapshots successful.
- Whole-tree no-Gemini runtime ratchet: clean with 76 grandfathered sites and
  zero new sites.
- Test-only exports ratchet: 1 suite / 6 cases successful.

## Static checks

- ESLint on both touched files: successful (standalone invocation emitted only
  the repository's known uncached Nx graph warning).
- Prettier check: successful.
- `git diff --check`: successful.

The diff is limited to the two authorized route/test files plus lifecycle
evidence. No schema, ownership policy, response schema, LLM routing, prompt,
metering, secret, environment, or deployment changed.

