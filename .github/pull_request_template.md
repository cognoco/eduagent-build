<!--
  Keep this template short and honest. Every section below is required for
  non-trivial PRs (anything that touches tests, services, or routes). For a
  pure-comment / typo PR, "Verified-By: N/A — comment only" is acceptable.
-->

## Summary

<!-- One paragraph. What changed and why. Link the issue/spec if relevant. -->

## Verified-By

<!--
  REQUIRED for any PR that touches code. List the exact commands you ran
  locally and their outcome. "CI will verify" is not acceptable — CI fails
  fast at the first layer and hides downstream breakage. PR #257 shipped
  with 189 broken mobile tests because the author skipped this step.

  Examples:
    - pnpm exec jest --config apps/mobile/jest.config.cjs --findRelatedTests apps/mobile/src/path/to/file.tsx --runInBand --no-coverage --forceExit — related mobile Jest tests passed
    - pnpm exec nx run api:test       — 229 passed, 0 failed
    - bash scripts/check-change-class.sh --run    — all green
    - pnpm eval:llm / pnpm eval:llm --live        — if LLM prompts or eval harness touched
-->

- [ ] `pnpm exec tsc --build` — pass
- [ ] `pnpm lint` — pass on affected projects
- [ ] Tests — list the exact command and result:
    - `<command>` — `<N passed, 0 failed>`
- [ ] `pnpm eval:llm` (Tier 1 snapshot) — *(if LLM prompt files or eval harness changed)*
- [ ] `pnpm eval:llm --live` (Tier 2 live) — *(if prompt behavior change expected)*

## Failure modes considered

<!--
  For non-trivial features/fixes: fill in the table. Required by AGENTS.md
  "UX Resilience Rules" — if the Recovery column can't be filled, the design
  isn't complete. Delete this block only for pure-infra / refactor PRs.

  State             | Trigger              | User sees            | Recovery
  ------------------|----------------------|----------------------|-----------------------------------
  Network failure   | fetch times out      | ErrorFallback        | Retry button + back
  Quota exhausted   | 429 from API         | upsell screen        | Upgrade or wait until reset
-->

| State | Trigger | User sees | Recovery |
|---|---|---|---|
|   |   |   |   |

## Sweep audit (if claiming a sweep)

<!--
  If your commit message or PR title claims "swept all sites" / "everywhere"
  / "remaining surfaces", paste the grep query and result list here.
  AGENTS.md "Sweep when you fix": fix one of N without either sweeping all or
  documenting a tracked deferral is not acceptable.
-->

## CCR findings addressed

<!--
  If automated code review (Claude Code Review) ran, triage findings here.
  HIGH (must fix before merge) / MEDIUM (should fix) / LOW (deferred with note).
  "No findings" or "N/A — no CCR run" are valid entries.
-->

- **HIGH:** <!-- list or "none" -->
- **MEDIUM:** <!-- list or "deferred: <reason>" -->
- **LOW:** <!-- list or "noted, deferred" -->

## Code quality guard check

<!--
  Confirm each guard that applies. Delete rows that don't apply to this PR.
-->

- [ ] **GC1** — No new relative-path `jest.mock('./...')` / `jest.mock('../...')` added. Any exception annotated with `// gc1-allow: <reason>`.
- [ ] **GC6** — Any test file I edited was scanned for internal mocks; internal mocks removed or `// gc1-allow` annotated.
- [ ] **No `eslint-disable`** — All lint errors fixed in code; no suppression comments added.
- [ ] **`safeSend` vs `core-send`** — Non-core Inngest dispatches use `safeSend()`; bare `inngest.send(...)` sites carry `// core-send: <reason>` comment. *(if Inngest code touched)*
- [ ] **Envelope for LLM signals** — State-machine decisions use `llmResponseEnvelopeSchema` + `parseEnvelope()`; no `[MARKER]` tokens or free-text JSON blobs. *(if LLM prompt/handler touched)*

## Notes for reviewers

<!-- Optional. Anything that helps the reviewer skip dead-end paths. -->
