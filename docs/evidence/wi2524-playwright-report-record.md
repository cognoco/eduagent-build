# WI-2524 — durable sanitized record of the Playwright report artifacts

Successor evidence record created under **WI-2595 (Preserve WI-2524 closed evidence as a durable
in-repo record before artifact purge)**, itself raised from **WI-2593** (Playwright HTML report
artifacts embed reusable seeded staging credentials).

**Why this file exists.** `docs/evidence/wi2524-staging-navshell-verification.md` — the closed
evidence for WI-2524 — cited the CI artifact `playwright-web-v2-29862030418-1` as its AC-3 record.
CI artifacts are ephemeral and are scheduled to be purged under WI-2593, which would have left a
closed item's acceptance evidence pointing at something deleted: a permanent, unrecoverable
`POINTER_ABSENT`. Both `review-steward` and `pm:claude:zdx` ruled **preserve then purge**. This file
is the durable in-repo replacement, so the citation resolves to a committed artifact rather than a
purgeable CI id.

**Sanitization scope.** This record carries *only* run/head/attempt identifiers, report totals,
named-test identity and outcome, the required post-Back assertions, and artifact metadata including
the original name / id / digest. It deliberately excludes credentials, email addresses, request
bodies, request headers, input values, storage state, traces, screenshots and video. No sensitive value from
the source reports — none of the excluded classes listed above — has been printed, logged, quoted or
committed at any point, including while proving that such values were present. The report-derived
totals, run/head identifiers and named-test identity recorded here are, by design, the non-sensitive
provenance fields the record is built from.

## 1. Artifact provenance (originals — PENDING PURGE UNDER WI-2593)

The three source artifacts are retained here by identity for provenance. They are **not** the
evidence of record any more; this file is. Their eventual purge does not invalidate anything below.

> **Status is `PENDING PURGE`, deliberately — these artifacts are NOT yet purged.** At the time this
> record was committed all three verified `expired=false`, i.e. still present and still
> credential-bearing. Writing `PURGED` here would be a false completion signal: a reviewer working
> the purge could read it as done and skip the actual deletion, leaving the reports available. The
> status flips to `PURGED UNDER WI-2593` **only after the GitHub artifacts are verified gone**, and
> that flip is the purge owner's step, not this record's.

| Artifact name | Artifact id | Bytes | sha256 digest | Created (UTC) | Status |
|---|---|---|---|---|---|
| `playwright-web-v2-29856034716-1` | 8505395256 | 204959 | `c831e693f1bbc8f8077710a6b70f4c5e581a596814886d699cf880958325cd40` | 2026-07-21T18:13:17Z | PENDING PURGE UNDER WI-2593 |
| `playwright-web-v2-29859015027-1` | 8506591973 | 213188 | `5ca0bc711b0168145c080ef14f43668cbfca92a91d5820c9154e0a057352c5a2` | 2026-07-21T18:55:27Z | PENDING PURGE UNDER WI-2593 |
| `playwright-web-v2-29862030418-1` | 8507767965 | 205255 | `ee3df6d4b16f726e28460e6e9c211448aa3430e66c012ac282c0a40dcf4e5164` | 2026-07-21T19:37:08Z | PENDING PURGE UNDER WI-2593 |

## 2. Run identity and report totals

Totals were read from the reports' own decoded payloads in an isolated remediation process.

| Artifact id | Workflow run | Head sha | expected | unexpected | flaky | skipped | Suite duration (ms) |
|---|---|---|---|---|---|---|---|
| 8505395256 | 29856034716 | `f346ee16` | 5 | 0 | 0 | 0 | 135169 |
| 8506591973 | 29859015027 | `233fd5d54` | 5 | 0 | 0 | 0 | 137378 |
| 8507767965 | **29862030418** | **`79f22774a`** | 5 | 0 | 0 | 0 | 133366 |

`unexpected=0`, `flaky=0` and `skipped=0` in every case, and every run is GitHub `run_attempt = 1`
(read from the Actions API, not inferred from the artifact-name suffix): nothing failed, nothing was
retried into green, and the named case was not skipped.

## 3. Named-test identity and outcome (the AC-3 record)

The named case is present in all three reports:

> `V2 nav shell: real Back from the support-hub Mentor surface keeps the supporter-hub surface, no
> learner-surface bleed-through`

**Operative result** — artifact `8507767965`, run `29862030418`, head `79f22774a` (exact-main, an
ancestor of `origin/main`): the case ran and its outcome is expected/passed, within a suite of five
where `unexpected=0`. The exact `Playwright web smoke` check-run for that run concluded `success`
(`actions/runs/29862030418/job/88742989182`).

## 4. The post-Back assertions this evidences

The behaviour proven by that run is the AC-2 requirement of WI-2524, for the two real browser-Back
transitions the named case exercises after the active scope is supporter-hub (b1 and b2 below): the
resulting route renders the supporter-hub surface and never a learner or person-scope surface. The
run evidences these two exercised transitions, not every conceivable Back transition in the app. The assertions live in-repo, and this is the
durable statement of what passed:

| b | Path | Assertions after Back |
|---|---|---|
| b1 | landing `/mentor` → tap `tab-subjects` → `/subjects` → **Back** | `support-hub-mentor-tab` visible **and** `mentor-screen` count 0 |
| b2 | person scope → tap `tab-journal` → `/journal` → ScopeChip to supporter-hub → **Back** | URL `/mentor` **and** `support-hub-mentor-tab` visible **and** `mentor-screen` count 0 **and** `person-scope-journal-placeholder` not visible |

Source of truth for these assertions remains the committed spec,
`apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts` — which, unlike a CI artifact, is durable.

## 5. Verification performed (WI-2595 AC-2)

Carried out in an isolated `0700` temporary workspace, destroyed afterwards. Secret-pattern scanning
printed **counts only**; no matched value was printed, logged, quoted, committed or retained.

A method finding worth recording, because it inverts the obvious conclusion:

- Scanning the report HTML as **plaintext** returned `email=0, credkey=0, bearer=0, storageState=0`
  on all three artifacts — which reads as clean and **is not**.
- The reports embed their data as a **base64 payload** (`playwrightReportBase64`, zipped JSON
  inside), so a plaintext regex inspects the wrapper rather than the data. A known-positive control
  string confirmed the scanner itself was working, so the zero described the layer scanned, not the
  contents.
- Scanning the **decoded** payload returned, per artifact: `email` 6 / 5 / 6 and
  `storageState|cookies` 6 / 6 / 6.

**Therefore a plaintext grep of a Playwright HTML report yields a false all-clear.** Any audit that
certifies such a report clean without decoding has established nothing. The correct posture for
non-remediation lanes remains: do not open these reports at all.
