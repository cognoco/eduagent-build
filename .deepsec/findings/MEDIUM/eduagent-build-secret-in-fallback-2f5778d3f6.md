# [MEDIUM] Hardcoded default password used as fallback for seed-created Clerk users

**File:** [`apps/api/src/services/test-seed.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/test-seed.ts#L62-L252) (lines 62, 252)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secret-in-fallback`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

DEFAULT_SEED_PASSWORD = 'Mentomate2026xK' (L62) is used at L252 as `const password = env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD;` and applied to real Clerk users created via the seed flow (createClerkTestUser → Clerk Backend API user create/PATCH with this password and `skip_password_checks: true`). The accompanying comment confirms it is a genuine, sign-in-capable credential ('Must NOT appear in HaveIBeenPwned — Clerk blocks sign-in for breached passwords'). Because the value is committed to source, anyone who reads the repo knows the password for every seeded test account whose email is also known/guessable (e.g. the default 'test-e2e@example.com', and other deterministic seed emails). On a staging environment that points at a reachable Clerk instance, an attacker could attempt direct Clerk sign-in as those seeded accounts WITHOUT needing the /__test/* endpoint or the X-Test-Secret — the route guard does not protect the Clerk login surface itself. Blast radius is bounded: the /__test/* seed routes are hard-blocked in production (fail-closed on ENVIRONMENT, L68-73 of routes/test-seed.ts), so production accounts are never created with this password, and seeded accounts contain only synthetic data. If SEED_PASSWORD is set in staging/CI (as the e2e docs imply via Doppler), the hardcoded value is not used there — the exposure depends on whether any reachable environment relies on the fallback. Severity is therefore mid/low rather than HIGH.

## Recommendation

Remove the hardcoded fallback and require SEED_PASSWORD to be provided explicitly (throw if absent on non-development environments, mirroring the TEST_SEED_SECRET fail-closed pattern already in routes/test-seed.ts). For local development, generate a random per-run password instead of a static literal. Confirm no staging/CI environment relies on the fallback, and rotate any seeded Clerk test accounts that were created with this password on an internet-reachable Clerk instance.

## Revalidation

**Verdict:** true-positive

The weakness is real and present in current code. `DEFAULT_SEED_PASSWORD = 'Mentomate2026xK'` (L62) is committed, and `createClerkTestUser` uses `env.SEED_PASSWORD ?? DEFAULT_SEED_PASSWORD` (L252) when creating real Clerk Backend-API users with `skip_password_checks: true` (L283-289) — a genuinely sign-in-capable credential (the comment confirms it is deliberately non-breached so Clerk permits sign-in). I verified SEED_PASSWORD is OPTIONAL everywhere: the /__test/* route guard requires only TEST_SEED_SECRET, not SEED_PASSWORD (routes/test-seed.ts L75-89), and no env-validation enforces it — so a staging environment can create seed accounts with the committed fallback by design. The attack does not need the /__test/* endpoint or X-Test-Secret: Clerk's hosted login surface is internet-reachable, seed emails are guessable (default `test-e2e@example.com`, L54), and the password is in the repo — so an attacker could sign in directly as those accounts. Blast radius is correctly bounded: /__test/* is fail-closed in production (ENVIRONMENT must be development|staging, L68-73), so production accounts are never created with this password and seeded data is synthetic — which is why MEDIUM (not HIGH) is appropriate; I leave severity unchanged. The one thing that would neutralize it (every reachable env setting SEED_PASSWORD) is an unguaranteed operational control, and depending on an optional override of a committed working credential is exactly the fragility flagged. The recommendation (require SEED_PASSWORD explicitly on non-dev, randomize per-run locally) is sound and unimplemented.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
