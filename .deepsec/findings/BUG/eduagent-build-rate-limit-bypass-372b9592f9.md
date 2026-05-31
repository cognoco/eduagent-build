# [BUG] Unauthenticated forced JWKS re-fetch with no negative cache or cooldown (DoS amplification)

**File:** [`apps/api/src/middleware/jwt.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/middleware/jwt.ts#L134-L190) (lines 134, 159, 176, 184, 190)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `rate-limit-bypass`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

lookupJWKByKid() forces a TTL-ignoring upstream JWKS fetch (fetchJWKSForced, L134-159) whenever a token's header.kid is absent from the cached JWKS (L184-188). The kid is fully attacker-controlled and the signature is NEVER checked before this lookup — verifyClerkJWT (auth.ts L107-116) decodes the unverified header, extracts kid, and calls lookupJWKByKid before verifyJWT runs. So an UNAUTHENTICATED attacker who sends well-formed JWTs with random/unknown kids forces an outbound fetch to the Clerk JWKS endpoint on the lookup path. There is no negative cache ('this kid does not exist') and no per-kid/cooldown throttle, so a sustained stream of distinct bogus kids drives a roughly 1:1 inbound→outbound fetch ratio (each sequential request: fetchJWKS cache-hit, kid miss, then a forced network fetch). Secondary risk: if the upstream rate-limits the worker under this load, legitimate key-rotation re-fetches fail and auth.ts returns 503 to real users. NOTE (mitigation present, hence low confidence): the per-URL in-flight dedup (jwksRefetchInFlight, L135-138) collapses CONCURRENT forced fetches to a single request per isolate, which substantially blunts the realistic flood vector; residual amplification is the sequential/no-negative-cache case, and the Clerk JWKS endpoint is typically CDN-cached and resilient. Impact is therefore modest and bounded by the 5s timeout + dedup.

## Recommendation

Add a short-lived negative cache for unresolved kids (e.g. remember 'kid X not found after forced refetch' for ~30-60s) so repeated unknown-kid tokens do not each trigger an upstream fetch. Optionally add a small cooldown between forced refetches per URL even on cache-miss. As defense-in-depth, set `redirect: 'error'` (or 'manual') on both JWKS fetches (L115, L144) — a JWKS endpoint should never redirect, and following redirects on a key-fetch is an unnecessary trust surface.

## Revalidation

**Verdict:** true-positive

The code behavior is real and verified. lookupJWKByKid (L176-191) calls fetchJWKSForced (L184) whenever the token's kid is absent from the cached JWKS, and there is no negative cache for unresolved kids and no per-URL cooldown. The kid is attacker-controlled and is consumed BEFORE signature verification: auth.ts verifyClerkJWT decodes the unverified header (L107), extracts kid (L108), and calls lookupJWKByKid (L116) before verifyJWT runs. So an unauthenticated client sending well-formed JWTs with novel kids can force one outbound fetch per request. However, the MEDIUM 'amplification DoS' framing overstates the impact, and the finding's own body concedes the key facts: (1) the ratio is ~1:1 inbound→outbound — that is by definition NOT amplification, so the attacker gains nothing over hitting Clerk's CDN-backed JWKS endpoint directly; (2) the in-flight dedup map (jwksRefetchInFlight, L135-138) collapses concurrent floods to a single fetch per isolate, blunting the realistic high-volume vector; (3) failure of the forced fetch throws 'Failed to fetch JWKS…' which matches auth.ts's infra regex (L166) → 503 + Retry-After, not a forced sign-out; and (4) legitimate users whose kid is already cached never reach the forced-fetch path (cache hit at L178), so they are insulated even under attack. The residual harm — sequential distinct-kid requests each forcing a fetch, possibly leading Clerk to throttle the worker's egress — is speculative and self-healing. The mechanism is genuine and attacker-triggerable (so not a false positive), but it is a low-impact defense-in-depth hardening gap, not a MEDIUM exploitable DoS; severity corrected to BUG. The recommended negative cache is reasonable hygiene.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
