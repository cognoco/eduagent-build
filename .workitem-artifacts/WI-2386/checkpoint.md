# WI-2386 executor checkpoint

## 2026-07-22 — claim gate blocked

- Workspace: `/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2386`
- Branch: `WI-2386`
- HEAD: `9a4ae7c06357925969beee66d482b4cca4dbb3a0`
- Deterministic command attempted:
  `bun /home/vetinari/.codex/plugins/cache/zdx-marketplace/cosmo/0.8.27/skills/execute/execute.ts fetch WI-2386 .workitem-artifacts/WI-2386 --supervised`
- Result: failed before mutation because the sandbox refused the Notion REST connection (`ConnectionRefused` for `https://api.notion.com/v1/databases/f170be9e04ae45d4961828f2438666bd/query`).
- Read-only connector verification: WI-2386 was `Stage=Ready`, `State=Active`, with empty `Claimed By` and `Fixed In`; page body and the two visible lifecycle comments were read.
- Overlap verification: WI-2127 and WI-2128 were both `Stage=Refining`, `State=Active`, with empty `Claimed By` and `Fixed In`.
- No claim or implementation mutation was made. No `_plan-WI-2386.md` or production change was created.

Resume only after the deterministic Cosmo CLI can reach Notion REST; rerun fetch, claim, and direct REST proof from the worktree root.

## 2026-07-22 22:17+02:00 — claim gate complete

- Deterministic supervised fetch passed all preconditions and the repository
  binding (`MentoMate` → `cognoco/eduagent-build`).
- Deterministic claim succeeded as `builder:codex:WI-2386`; Stage moved to
  `Executing`.
- A direct Notion REST re-read proved `Claimed By=builder:codex:WI-2386`, empty
  `Fixed In`, and future `Claim Expires=2026-07-22 23:17+02:00`.
- WI-2127 and WI-2128 remained `Stage=Refining`, unclaimed, and without
  `Fixed In`; overlapping family-join surfaces are not live elsewhere.

## 2026-07-22 22:25+02:00 — design phase complete

- Read the required executor/builder/runtime canon, repository context and
  architecture, project memory, TDD, database/atomicity, commit, verification,
  and deterministic execution instructions.
- Read the complete live item, all eight acceptance criteria, and visible
  page comments.
- Mapped the request/grant/read/withdraw/restore/reminder/deletion consumers.
- Created `_plan-WI-2386.md` with the AC checklist, file map, concurrency and
  atomicity model, existing-data disposition, red-green-revert matrix, and
  schema rollback procedure before any production edit.

## 2026-07-23 — implementation and regression checkpoint

- Added canonical typed `CONSENT_PURPOSES` (`platform_use`,
  `llm_disclosure`) and removed the whole-workflow default/literal proxy.
- Guardian pending/direct/email approval, revoke, bearer withdrawal, restore,
  refresh, reads, scans, accountability, deletion, reminders, archive and
  fixture surfaces now operate on the complete set or take an explicit purpose.
- Approval/revoke/restore are transactionally serialized with the existing
  per-person advisory lock; dual-connection integration tests are green.
- Added metadata-only migration 0152 to drop the request-purpose default; no
  existing row or grant is rewritten or inferred.
- Whole-repo guard and its 8 tests are green.
- Full API unit gate: 473 suites passed; 8,971 tests passed, 11 skipped.
- Full API integration-api gate: 142 suites passed, 4 skipped; 1,024 tests
  passed, 44 skipped. Two independent shared-DB failures reproduce outside the
  WI surfaces: filing concurrent shelf creation and a residue collision on
  static billing subscription id `sub_webhook_001`.
- Full cross-package integration first pass: 60 suites passed, 10 failed.
  All consent fixture failures were corrected to seed the complete typed set.
  The repaired targeted batch has 8/8 consent suites green; the remaining
  `profile-isolation` failures reproduce as shared-DB permission denial for
  `SET LOCAL ROLE`.
- Required red-green-revert matrix is recorded in `red-green-revert.md`.
- REST proof at 2026-07-23 00:13+02:00: Stage=Executing, State=Active,
  Claimed By=`builder:codex:WI-2386`, Fixed In empty, Claim Expires=
  2026-07-23 01:13+02:00, Claim Expired=false.

## 2026-07-23 — adversarial review round 1 resolution

- Fresh-context different-runtime review found valid legacy-event deletion,
  withdrawal, restore, and request-window gaps.
- Added failing regression coverage first; all findings were then fixed without
  fabricating the missing purpose.
- Full consent state-machine integration suite: 77/77 passing.
- Consent-purpose executable guard self-test: 10/10 passing, including raw SQL
  and `inArray` selector regressions.
- Detailed finding dispositions are in `adversarial-review.md`.
- Adversarial review round 2: **NO VALID FINDINGS**; no round 3 required.
- Direct REST proof at 2026-07-23 01:11+02:00: Stage=Executing,
  State=Active, Claimed By=`builder:codex:WI-2386`, Fixed In empty,
  Claim Expires=`July 23, 2026 01:54`, Claim Expired=false.

## 2026-07-23 — final local gate matrix

- `api:integration-api`: 142 suites passed, 4 skipped; 1,030 tests passed,
  44 skipped. The only two failures are independently reproducible shared-DB
  residue outside WI-2386: concurrent filing shelf identity and the static
  billing subscription id `sub_webhook_001`. All consent suites passed.
- `api:test:integration`: 69/70 suites passed; 553 tests passed, 3 skipped.
  The only failing suite is `profile-isolation.integration.test.ts`, whose two
  cases fail before application logic because the shared database user cannot
  `SET LOCAL ROLE rls_test_*`. Every consent and consent-adjacent suite passed,
  including self-withdraw, web/email, archive/restore, learner-profile gating,
  write-IDOR, and guardian-credentialed revocation coverage.
- Restored `apps/api/project.json` after the local pnpm-version shim; it has no
  tracked diff.
- Deterministic fresh-claim renewal correctly refused an already-live claim,
  while extending the lease. Direct REST proof at approximately
  2026-07-23 01:51+02:00: Stage=Executing, State=Active,
  Claimed By=`builder:codex:WI-2386`, Fixed In empty, Claim Expires=
  `July 23, 2026 02:38`, Claim Expired=false.

## 2026-07-23 — current-main reconciliation

- `origin/main` advanced from the dispatched base through `a153dcd55`; neither
  WI-2127 nor WI-2128 landed in that interval.
- Merged current `origin/main` without rewriting branch history.
- Re-generated the consent migration as 0152 after main claimed 0151 for the
  mentor-notice status change. The regenerated SQL remains the same
  metadata-only `DROP DEFAULT`, while snapshot 0152 now incorporates both the
  landed mentor-notice schema and this consent schema change.
