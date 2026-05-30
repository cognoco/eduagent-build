# [BUG] staleMs parsed without a finite-number guard, unlike its sibling screen

**File:** [`apps/mobile/src/app/dev-only/seed-pending-redirect.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/dev-only/seed-pending-redirect.tsx#L76-L85) (lines 76, 85)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-input-validation`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

L76 computes `const staleMsNum = parseInt(staleMs ?? '0', 10)` and passes it straight to seedPendingAuthRedirectForTesting at L85. A non-numeric query value (e.g. ?staleMs=abc) yields NaN, and pending-auth-redirect.ts:134 then computes `savedAt: Date.now() - NaN = NaN`; isFreshRecord (pending-auth-redirect.ts:32) evaluates `Date.now() - NaN < TTL` => `NaN < TTL` => false, so the seeded record is silently treated as already-expired. The sibling seed-preview-state.tsx guards exactly this at L94 with `Number.isFinite(parsedStaleMs) ? parsedStaleMs : 0`. Impact is low and E2E-only: for the deep-link-redirect-ttl-expired flow the NaN happens to coincide with the intended 'expired' outcome, but any future flow that passes a malformed staleMs expecting a fresh record would silently get an expired one, masking a real regression behind a green test.

## Recommendation

Mirror the sibling's guard: `const staleMsNum = Number.isFinite(parseInt(staleMs ?? '0', 10)) ? parseInt(staleMs ?? '0', 10) : 0;` (or parse once into a variable and validate it). Factor the shared parse into the dev-only helper alongside the unified IS_E2E_BUILD constant.

## Revalidation

**Verdict:** true-positive

Verified end-to-end. Line 76 computes `const staleMsNum = parseInt(staleMs ?? '0', 10)` with no finite-number guard and passes it to seedPendingAuthRedirectForTesting at line 85. A non-numeric query value (e.g. ?staleMs=abc) yields NaN; pending-auth-redirect.ts:134 then sets `savedAt: Date.now() - NaN = NaN`, and isFreshRecord (line 32) evaluates `Date.now() - NaN < TTL` → `NaN < TTL` → false, so the seeded record is silently treated as already-expired. The sibling seed-preview-state.tsx guards exactly this at line 94 with `Number.isFinite(parsedStaleMs) ? parsedStaleMs : 0`, which seed-pending-redirect lacks. Impact is genuinely low and dev/E2E-only — and for the deep-link-redirect-ttl-expired flow NaN happens to coincide with the intended 'expired' outcome — but it is a real divergence that could mask a future regression (a flow expecting a fresh record would silently get an expired one behind a green test). Distinct defect from finding 5a (different line/issue: parse-time validation vs. the build gate), so not a duplicate. Matches the finding; BUG severity / low confidence are correct.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
