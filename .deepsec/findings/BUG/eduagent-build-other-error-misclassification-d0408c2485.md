# [BUG] JWKS response shape is unvalidated; a malformed upstream response is misclassified as a token error (wrongful 401/sign-out)

**File:** [`apps/api/src/middleware/jwt.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/middleware/jwt.ts#L124-L185) (lines 124, 125, 178, 185)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-error-misclassification`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

fetchJWKS casts the upstream body with `(await res.json()) as JWKS` (L124) and stores `jwks.keys` with no schema/shape validation. If the JWKS endpoint (or an intermediary) returns malformed JSON lacking a `keys` array, lookupJWKByKid's `jwks.keys.find(...)` (L178/L185) throws a TypeError like 'Cannot read properties of undefined (reading find)'. That message does NOT match auth.ts's infra-failure regex `/fetch|JWKS|network|abort/i` (auth.ts L166), so the request is treated as a token-validation failure and returns 401 — which the mobile client treats as session-expired and signs the user out. This partially defeats the explicit BUG protection in auth.ts (L176-192) that returns 503 (not 401) on JWKS infra problems precisely to avoid mass forced sign-out during a Clerk hiccup. Low confidence because it requires the upstream to return a malformed-but-200 body, which is rare for Clerk.

## Recommendation

Validate the JWKS response shape (e.g. a small Zod schema requiring `keys` to be an array) before caching/using it, and throw an error whose message includes 'JWKS' so auth.ts classifies it as an infra failure (503 + Retry-After) rather than a token error (401/sign-out). Do not cache an invalid response.

## Revalidation

**Verdict:** true-positive

Verified as a real latent bug. fetchJWKS L124 does `(await res.json()) as JWKS` with no shape validation, then L125 caches `{ keys: jwks.keys, … }`. If the upstream returns a valid-JSON-but-malformed body lacking a keys array, jwks.keys is undefined; lookupJWKByKid L178 (`jwks.keys.find(...)`) throws a TypeError 'Cannot read properties of undefined (reading find)'. That message does not match auth.ts's infra-failure regex /fetch|JWKS|network|abort/i (L166), so isInfraFailure is false and the request falls to the 401 branch (L211-214) — which the mobile client treats as session-expired and signs the user out, partially defeating the explicit 503 protection (auth.ts L176-192) designed to prevent mass sign-out during a Clerk hiccup. It is worse than a transient blip: L125 caches the poisoned `{ keys: undefined }` entry, and the cache-hit branch (L107-108) keeps serving it for the 10-minute TTL, so a single malformed 200 response can 401 every request on that isolate for the window. This is not attacker-controllable (it requires Clerk or an intermediary to return a malformed-but-200 body, which is rare), so it is a robustness/correctness bug rather than an exploitable security vulnerability — consistent with the finding's BUG severity and low confidence. The recommended Zod shape-check + 'JWKS'-tagged error message is the correct fix. Distinct from the other jwt.ts finding (forced re-fetch / negative cache) in root cause, lines, and remedy — not a duplicate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
