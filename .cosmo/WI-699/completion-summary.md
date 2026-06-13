## WI-699 (WP-secapi-dos-race) — completion summary

Landed as one squash-merged PR (#1122, commit `825f354615d318a1502db660bc1534607e90eefe`).
Absorbed children **WI-711** and **WI-712** (provenance) are Closed/Done against the same Fixed In.

**What was done:**
Closed one unauthenticated DoS vector and three race/atomicity defects in a single PR:
F-181 (HIGH, DoS), F-120 (data-loss), F-164 (lost-update), F-167 (non-atomic write).

**What changed:**
- **F-181 — JWKS forced-refetch cooldown** (`apps/api/src/middleware/jwt.ts`). `lookupJWKByKid`
  runs on every verification keyed on the attacker-controlled `kid` before the signature check;
  a kid-miss against a warm cache forced an upstream Clerk fetch, and the existing in-flight dedup
  only collapsed *concurrent* misses — so a *sequential* bogus-kid stream amplified 1 unauthenticated
  request → 1 upstream fetch, unbounded. Added a per-URL cooldown (`JWKS_FORCED_REFETCH_COOLDOWN_MS = 60s`)
  armed ONLY on a successful re-fetch (a failed re-fetch propagates its JWKS-classified infra error
  rather than being masked as an invalid token — Codex P1 review fix). Bounds forced re-fetches to
  ≤1/min/URL/isolate while still picking up genuine key rotation once the window elapses.
- **F-120 — non-destructive same-day dictation writes** (`packages/database/src/{repository.ts,schema/dictation.ts}`
  + migration `0116`). The upsert used the legacy `(profile_id, date, mode)` unique index as its
  conflict target, so two distinct same-day same-mode sessions collided and the second overwrote the
  first. Conflict target moved to `(profile_id, completion_key)`; migration drops the legacy unique
  index and promotes the completion-key index to UNIQUE. Legacy callers that omit `completionKey`
  still collapse via a derived per-day key (intended idempotency for old clients).
- **F-164 — CAS on `updateInterestsContext`** (`apps/api/src/services/onboarding/index.ts`). The version
  bump was decorative (UPDATE filtered only on `profileId`); concurrent picker submits were
  last-writer-wins. Now `UPDATE … WHERE version = expected` + rowCount check + bounded 3-retry, then
  `ConflictError` (typed escalation — no silent recovery).
- **F-167 — transaction around regenerate** (`apps/api/src/services/language-curriculum.ts`).
  `regenerateLanguageCurriculum` ran ownership-check → delete-all → insert curriculum → insert topics
  on the bare `db`; wrapped in `db.transaction` (ownership check inside, so check→delete is atomic),
  mirroring the already-transactional sibling in `curriculum.ts`.

**Verification:**
- F-181: red-green-revert-restore recorded (sequential 5-bogus-kid burst: pre-fix 6 upstream fetches →
  post-fix 2); rotation-after-cooldown test; infra-failure test (failed re-fetch propagates, not masked).
- F-120: dictation result integration test — distinct-completionKey same-day rows both persist;
  same-key retry dedups in place (CI-verified; locally migration-gated by design).
- F-164: two-connection `Promise.all` concurrency integration test — no torn/lost state, version
  advances per landed write.
- F-167: concurrent-regeneration integration test — exactly one complete curriculum survives.
- typecheck + lint clean (api + database); GC6 clean (no internal mocks in touched test files);
  all required CI gates green on the merged commit (`claude-review` red = advisory token-exhaustion).
- Codex P1 (jwt cooldown infra-failure) + P2 (migration single-step) both resolved in-thread.

**Caveats / Follow-ups:** migration `0116` (drops legacy `uniq_dictation_results_profile_date_mode`, adds unique `(profile_id, completion_key)`) is committed but applied to staging/prod only at deploy time via `drizzle-kit migrate` — a worker deploy does not migrate Neon — and carries a `## Rollback` note (recreating the legacy unique index requires de-duplicating same-day rows first; no data destroyed by the forward migration); the resulting seconds-long migrate→deploy window where old Worker code's legacy ON CONFLICT target errors affects only the non-core, client-retryable `POST /dictation/result` endpoint and was accepted with single-step `0116` retained per shepherd ruling.
