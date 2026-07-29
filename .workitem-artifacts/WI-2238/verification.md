# WI-2238 final current-main verification

- Integrated base: WI-2741 governed squash `6f30c6cbbb5342cb7793150ab2ce9edb929d4980`
  on the then-current `origin/main`.
- Directly affected mobile suites: 15/15 suites, 394/394 tests, 20.985 s.
- Structural mutation gate: 5/5 focused WI-2238/WI-2741 tests and 167/167
  complete structural tests passed.
- Maestro static validation: 7/7 checks, zero violations across 198 flows and
  34 setup helpers.
- V2 Playwright catalog: 22 tests in 10 files, including all six named
  WI-2238 browser cases.
- TypeScript: `pnpm exec tsc --build` passed.
- Canonical mobile: 515/515 suites, 6,806/6,806 tests, 329.215 s, exit 0.
- Changed-file ESLint: zero errors; one inherited `react-hooks/exhaustive-deps`
  warning on a May-authored unchanged line in Session.
- Changed-file Prettier and `git diff --check`: passed.
- First post-prerequisite hosted head `ee7a3dde7cfc8f14e113d85204d3e6142149a101`:
  20/20 PR checks green; fresh Claude APPROVED with zero must/should findings;
  browser run `30239971545` passed V2 22/22 and stable legacy 24/24.
- Native diagnostic run `30239971576`: API integration green; V2 shard reached
  case 10/15 and failed only because the exact Biology Topic 1 General row was
  below the 360x760 viewport after Back. Artifact `8643295547` and screenshot
  are preserved under `hosted/native-30239971576/`.
- Post-diagnostic repair: focused structural RED before YAML change; then 4/4
  focused and 167/167 complete structural tests green, Maestro validator 7/7,
  changed-file Prettier and diff integrity green.
- Repaired exact-head browser, release-APK, ordinary CI, automated-review, and
  governed merge receipts: required before landing.
