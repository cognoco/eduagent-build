# [MEDIUM] Clerk session/JWT tokens persisted to web localStorage via secure-storage fallback

**File:** [`apps/mobile/src/app/_layout.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/_layout.tsx#L58-L548) (lines 58, 59, 60, 61, 62, 63, 548)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-insecure-token-storage`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

On web, `tokenCache` is set to `webTokenCache` (L58-63), whose `saveToken`/`getToken` delegate to `SecureStore.setItemAsync/getItemAsync`. Per `lib/secure-storage.ts`, on web those functions fall back to plain `localStorage` (or an in-memory map). The cached values are Clerk's session/JWT tokens — confirmed by `lib/sign-out-cleanup.ts:168` ('Clerk tokenCache adapter — keys are Clerk-internal session/JWT tokens') and by `api-client.ts:193` reading them via `getToken()` for every authenticated request. `app.json` declares a `web` target, so this path ships to a real browser surface. This directly contradicts the security guidance in `secure-storage.ts`'s own header (L1-21): 'Sensitive material (auth tokens, child PII) should NOT be persisted via this module on web ... route those through Clerk's session cookie (which is HttpOnly and managed outside JS).' Tokens in localStorage are readable by any same-origin JavaScript (XSS, malicious browser extensions) and persist on disk across sessions, enabling session hijacking / account takeover if an injection sink ever appears. This is a defense-in-depth weakness rather than a directly exploitable bug: I found no `dangerouslySetInnerHTML`, `WebView`, `innerHTML`, or `eval` sink in the mobile bundle today, so exploitation currently requires a separate XSS, and it may partly reflect an unavoidable constraint of using `@clerk/clerk-expo` (rather than `@clerk/clerk-react`) on web. Impact is also reduced if the web target is used only for internal E2E rather than shipped to end users.

## Recommendation

On web, do not persist Clerk auth tokens through the localStorage fallback. Prefer Clerk's web SDK / HttpOnly-cookie-based session management for the web build, or restrict the web token cache to in-memory (sessionStorage at most) so tokens are not written to disk and do not survive a tab close. At minimum, document this as an explicit, risk-accepted deviation in `secure-storage.ts` so the implementation and its own header guidance stop contradicting each other, and ensure the web origin enforces a strict Content-Security-Policy to shrink the XSS surface that would make this exploitable.

## Revalidation

**Verdict:** true-positive

The facts are confirmed. On web, tokenCache = webTokenCache (_layout.tsx:58-63), whose saveToken/getToken delegate to SecureStore.setItemAsync/getItemAsync. On web those functions route to getWebStorage() which returns plain localStorage (or an in-memory map only if localStorage is blocked) — lib/secure-storage.ts:87-113, 57-81. The cached values are Clerk session/JWT tokens (the same cache api-client.ts reads via getToken() for every authenticated request). This directly contradicts secure-storage.ts's own header (lines 14-20): 'Sensitive material (auth tokens, child PII) should NOT be persisted via this module on web... route those through Clerk's session cookie (which is HttpOnly...)'. localStorage tokens are readable by any same-origin JS (XSS, malicious extensions) and persist on disk across sessions, enabling session hijacking. This is a genuine insecure-token-storage weakness. As the finding honestly scopes it, direct exploitation is defense-in-depth: I found no dangerouslySetInnerHTML/WebView/innerHTML/eval sink in the bundle today, so first-party exploitation needs a separate XSS; a no-XSS path still exists via a shared/public browser or a malicious extension reading localStorage. It may also partly reflect an unavoidable @clerk/clerk-expo-on-web constraint, and impact depends on whether the web target ships to end users vs. internal E2E. Severity MEDIUM is appropriate. The contradiction between the implementation and its own header should be resolved (in-memory/sessionStorage on web, Clerk web SDK/HttpOnly cookies, and a strict CSP) or explicitly risk-accepted.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-26)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
