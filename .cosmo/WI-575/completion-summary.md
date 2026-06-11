## Completion Summary — WI-575 (WP-W2-proxy-authority)

**What was done:** Applied the central proxy-authority guard contract (MMT-ADR-0008, inv 7/8) to the two remaining unguarded proxy mutation surfaces named by the bundle brief. F-023: `POST /sessions/:sessionId/quick-check` invoked `evaluateQuickCheckAnswer` (LLM via `routeAndCall`) with no quota metering — added a UUID-scoped pattern to `LLM_ROUTE_PATTERNS_POST_ONLY` so the route is billed and fast-paths 402 when quota is exhausted. F-126: the three library-filing write endpoints (`keep-out` / `add` / `restore`) carry the server-derived central authority check (`assertNotProxyMode`, keyed on `profileMeta.isOwner`) from the W0 patch; added an explicit finding-linked break-test suite proving the guard fires for a non-owner caller with the `X-Proxy-Mode` header absent (the exact F-126 attack vector) and that the DB is never touched. The W0 patches were NOT re-implemented — built on them, per the regression AC.

**What changed:**
- `apps/api/src/middleware/metering.ts` — F-023 quick-check pattern added to `LLM_ROUTE_PATTERNS_POST_ONLY`
- `apps/api/src/middleware/metering.test.ts` — quick-check row added to `POST_METERED_ROUTES` (asserts both decrement-at-boundary and 402 quota-exhausted fast-path)
- `apps/api/src/routes/sessions.test.ts` — new `[F-126 / WI-575]` suite: 3 break tests, 403 PROXY_MODE with no header, recording-Proxy db asserts zero DB access
- PR #882 (2 commits: `e40556543` implementation, `04e954af7` self-review fix wiring the dbCalled spy), merged to main by the shepherd as `a325f0380`

**Verification:**
- Regression ACs (mandated): the WI-549 / WP-W0-patch-api break-tests for F-117 (`apps/api/src/middleware/proxy-guard.test.ts` — server-derived proxy-mode suite, 21 tests) and F-144 (`apps/api/src/routes/snapshot-progress.test.ts` — milestones backfill fail-closed suite) were run explicitly and PASS against the rebuilt model — combined targeted run post-rebase: 214 pass / 0 fail.
- Full API unit suite: 6521 pass / 0 fail / 3 skipped. `nx run api:lint` clean; `nx run api:typecheck` clean.
- PR #882: 6/6 CI checks green on final commit `04e954af7`; Claude review APPROVED with zero findings; CodeRabbit pass.
- Branch rebased onto latest origin/main (post #832/#874/#875) before PR; no file overlap with the 36 intervening commits.

**Caveats / Follow-ups:**
- Local integration-test run (`nx test:integration api`) could not exercise DB-backed suites on this runner (no `DATABASE_URL`/Doppler configured — pre-existing environment limitation, unrelated to the diff; the 3 non-DB suites passed). CI's integration gate ran with DB credentials and is green on the merged PR.
- Metering quick-check has the known allowlist-pattern false-positive characteristics of its siblings (path-regex based); the route is the trust boundary, consistent with the existing `[WI-149]` precedent noted in `metering.ts`.
- No follow-ups required for this WP. The deeper replacement of `assertNotProxyMode` by a schema-backed guardianship-edge resolver (persons/guardianship tables from WI-570) is W2/W3 follow-on work that rides the consent-deletion and later units, not this bundle.
