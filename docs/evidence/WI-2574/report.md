# WI-2574 — mentor-notice MVP acceptance audit

## Verdict and inputs

**PASS for independent review/QA.** Product base `790a27c07e38e12e854bf6daff41fe6e247f658c`; ADR: [MMT-ADR-0036](../../adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md); [specification](../../specs/2026-07-19-homework-notice-felt-moments.md). Disposable target `811f580999ce`, endpoint fingerprint `f0ca05e6457965df023f9c88d3eeb3b821f4c02a119a8a793f41b49592425bd7`, ruling `BID-35-WI-2574-EXACT-DB-AUDIT-2026-08-03`. No unresolved ADR/safety finding; no rollout, cohort, deployment, OTA, release, or push authorization.

## Artifact index

[Report](report.md) · [completion summary](../../../.workitem-artifacts/WI-2574/completion-summary.md) · [evidence manifest](../../../.workitem-artifacts/WI-2574/evidence.json) · [PR body](../../../.workitem-artifacts/WI-2574/pr-body.md) · [bootstrap receipt](../../../.workitem-artifacts/WI-2939/WI-2574-final-audit-bootstrap-790a27c0.json)

## Native-flow waiver

The native Maestro/device flow was **required but not executed under a bounded host-capability waiver**: live comment `3b18bce9-1f7c-8147-8733-001d6b119696`, ruling `BID-35-WI-2574-NATIVE-FLOW-WAIVER-2026-08-03`. `adb`/Maestro were absent and Metro stopped; no implicit launch was authorized. Mandated substitutes passed: mobile 537/537 suites (7,148 tests), affected DB 51/51, cross-package DB 74/74 suites (one ADR-permitted default-off push skip), and exact-head `b8ec5d804` CI router/Playwright. This is not native-execution evidence and preserves the no-rollout boundary.

## Clause matrix

`A`=ADR; `S`=spec. Evidence codes: `C` creation/evidence/completion; `V` visibility/routes; `T` state/offer/recheck/learning-day; `M` mobile policy/SSE/UI; `D` schema/migrations/purge DB; `L` learning-text gate; `J` jobs/config; `E` evals. Each includes its tests.

|Keys|Positive evidence|Negative control / boundary|
|---|---|---|
|A1.1; S1|C/T/M: complete in-app loop|J: flag off; no activation|
|A1.2–1.3; S2|C/E: homework/ordinary; age-neutral|C: interleaved/re-check reject; no age branch|
|A1.4; S2|V/M: self projection|V: every proxy suppresses|
|A2.1; S3.1|T/D: oldest+ID projection|D: no visible queue|
|A2.2; S3.1|C/M: ack, receipt, card|C/M: rejection emits none; non-blocking|
|A2.3–2.5; S3.2|T: independent judge/outcomes/detachment|T: no tutor verdict; third `continue` open; unresolved-only failure|
|A2.6–2.7; S3.2|T/D: 04:00 defer; fade|T: `Not now` ≠ dismissal; stale hidden off|
|A3.1; S6–7|M/J: in-app only|J: delivery default-off before DB|
|A3.2; S1,6|J: internal QA → full friendly group|J: no cohorts|
|A3.3–3.4; S6|M/C: monotonic disabled-wins; eviction|M: stale/malformed/unreadable cannot expose|
|A3.5; S6|J: atomic flag+revision; increments|J: no production activation/deployment/release|
|A4.1–4.4; S3.1,4|C/E: server authority/shared completion/optional quote|C: malformed/fabricated/mismatch reject|
|A4.5–4.7; S4–5|C/L/T: scrubbed multilingual post-persist gate|L: protected/ambiguous failures close|
|A5.1–5.5; S4–5|C/T/D: one state machine; uniqueness; purge survival|M/D: no client state/event FK; cascades retained|
|A5.6; S5|C/D: required new identity; nullable legacy reads|D: rollback cannot erase identity|
|S8–9|C–M/J/E: reconciliation + ledger|J: dormant push bounded; native only by waiver|

## Blocker closure

Live `Blocked by` relation; every row is `Closed/Done`, and `Anc=yes` means Fixed In is an ancestor of `790a27c0`.

|Work Item|Status|Fixed In|Anc|
|---|---|---|---|
|WI-2498 (proxy privacy)|Closed/Done|`c43a07cc5ca8cf0e1f5d788a35eb68da6c3f7076`|yes|
|WI-2499 (actions/receipt)|Closed/Done|`1064163204183c1f1cc917b53f2a0f7ce519d116`|yes|
|WI-2500 (contracts)|Closed/Done|`b2f494b2bfeb2441776d36c34ded79c91c58cdbb`|yes|
|WI-2501 (`not_yet` idempotency)|Closed/Done|`da3a5ea2fedd4cb5e86a8082560359b8a4840aed`|yes|
|WI-2504 (flag-off cache)|Closed/Done|`b848f5557b1020aa4c01053dc88e190422d728f5`|yes|
|WI-2557 (learning day)|Closed/Done|`ec9435b09f1e9def8448c71deb07671a4f564483`|yes|
|WI-2573 (push off)|Closed/Done|`f346ee16ca4e700b48201f1f5c86d7417cbc0100`|yes|
|WI-2623 (canon)|Closed/Done|`f7e6d4fd61e3f674316627be8e4655d2513c056a`|yes|
|WI-2624 (judge exclusion)|Closed/Done|`24f5b514df25f6ff0bdd78f65d2eb0e93e90bb0e`|yes|
|WI-2625 (server judge)|Closed/Done|`f9424a787b49fa0683e16e2793429178127d08c0`|yes|
|WI-2627 (policy revision)|Closed/Done|`32ac33fde5ace6515cd80649f47223cb0477fe2b`|yes|
|WI-2628 (clinical gate)|Closed/Done|`5cec6b3765535edebe6986160ef65337576f3937`|yes|
|WI-2629 (evidence identity)|Closed/Done|`82d972341de60ec81694aaec08c38be110c4a599`|yes|
|WI-2670 (per-turn vendor)|Closed/Done|`ec9fc2faae6e9620ba111b152da99c012b2fc838`|yes|
|WI-2753 (text remediation)|Closed/Done|`d7da06962425d5689fadf466cdd37ba8d58c64cc`|yes|

## Command ledger

Every local test command below is prefixed by `rtk fnm exec --using=22.16.0 --`, with CWD `/Users/vetinari/nexus/_dev/eduagent-build/.worktrees/wi-2574-audit`, revision `790a27c0`, and no injected environment unless shown. Flags are literal; the `gh` row is remote metadata.

|Gate|Exact command|Result|
|---|---|---|
|Schemas|`pnpm exec jest --config packages/schemas/jest.config.cjs --runInBand --runTestsByPath packages/schemas/src/llm-envelope.test.ts packages/schemas/src/mentor-notices.test.ts`|2 suites; 129 pass|
|Affected API|`pnpm exec jest --config apps/api/jest.config.cjs --runInBand --runTestsByPath apps/api/src/services/llm/envelope.test.ts apps/api/src/services/mentor-notices/creation.test.ts apps/api/src/services/mentor-notices/evidence.test.ts apps/api/src/services/exchanges.test.ts apps/api/src/services/session/session-exchange.test.ts`|5; 403 pass|
|Full API|`pnpm test:api:unit`|525; 10,442 pass; 9 skip|
|Full mobile|`pnpm test:mobile:unit`|537; 7,148 pass|
|Affected DB|`doppler run -c dev_integration -- pnpm exec jest --config apps/api/jest.integration.remote.config.cjs --runInBand --runTestsByPath apps/api/src/services/session/session-exchange.integration.test.ts apps/api/src/services/mentor-notices/state.integration.test.ts`|2; 51 pass|
|Cross-package DB|`doppler run -c dev_integration -- pnpm test:api:integration:cross-package:ci`|74; 612 pass; 1 permitted skip|
|Migration immutability|`pnpm check:migration-immutability`|pass|
|Migration enum|`pnpm check:migration-enum-idempotency`|pass|
|Integration type|`pnpm typecheck:integration`|pass; 75 roots|
|Prompt snapshots|`pnpm eval:llm -- --flow homework-notice --flow recheck-judge --flow learning-text-safety-judge`|30; zero drift|
|Live prompts|`doppler run -c stg -- pnpm eval:llm -- --live --flow homework-notice --flow recheck-judge --flow learning-text-safety-judge`|30/30; 0 failures/quality failures; 3 warnings|
|Branch router|`BASE_REF=main bash scripts/check-change-class.sh --branch --run --fast`|5 evidence files; pass/no class|
|Exact-head CI/E2E|`gh pr view 2955 --json headRefOid,statusCheckRollup`|`b8ec5d804`; `changes` + Playwright success|
