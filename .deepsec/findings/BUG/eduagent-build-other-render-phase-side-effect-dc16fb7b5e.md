# [BUG] Impure side effect (sessionStorage write) executed unconditionally during render

**File:** [`apps/mobile/src/app/(auth)/_layout.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(auth)/_layout.tsx#L64-L74) (lines 64, 68, 74)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-render-phase-side-effect`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

In the component body (render phase), whenever `redirectTarget` is truthy, `rememberPendingAuthRedirect(resolvedRedirectTarget)` is called on every render (auth/_layout.tsx:64-76). That function mutates module-level state and writes to `sessionStorage` with a fresh `savedAt = Date.now()` (pending-auth-redirect.ts:83-92). Writing to storage and stamping a timestamp during render violates React's render-purity contract: under React 18 StrictMode/concurrent rendering, render can run without committing, so the pending-redirect TTL gets refreshed spuriously and redundant sessionStorage writes occur on re-renders that the user never triggered. The guarded `setEffectiveTarget` call (line 74) is fine because `rememberPendingAuthRedirect` returns a deterministic normalized path, so it does not loop — but the unconditional storage write next to it is the impurity. Impact is low (idempotent value; only the timestamp/TTL is refreshed and an extra write performed), no data loss or security consequence, but it is a genuine correctness smell. Note: the redirect value itself is safely constrained to internal `/(app)/...` paths by `toInternalAppRedirectPath`, so there is no open-redirect here.

## Recommendation

Move the `rememberPendingAuthRedirect` write into a `useEffect` keyed on `resolvedRedirectTarget` (effects run only after commit), or compute `effectiveTarget` purely during render and persist to sessionStorage in an effect. Keep the render body free of storage writes and `Date.now()` stamping.

## Revalidation

**Verdict:** true-positive

Confirmed accurate. In the component render body, when `redirectTarget` is truthy, line 68 calls `rememberPendingAuthRedirect(resolvedRedirectTarget)` on every render. That function (pending-auth-redirect.ts:83-92) constructs a record with `savedAt: Date.now()`, mutates module-level `pendingAuthRedirectRecord`, and calls `writeSessionRecord` (sessionStorage.setItem on web). All three — `Date.now()` stamping, module-state mutation, and storage I/O — execute during render, violating React's render-purity contract. Under React 18 StrictMode (dev double-invoke) or concurrent/aborted renders, this runs multiple times per commit, spuriously refreshing the 5-minute TTL and issuing redundant sessionStorage writes on renders the user never triggered. The finding correctly scopes impact as low: the path value is deterministic/idempotent so only the timestamp churns; `setEffectiveTarget` (line 74) is the React-sanctioned render-derived-state pattern and is guarded against looping (`remembered !== redirectTargetRef.current`); and the value is constrained to internal `/(app)/...` paths by `toInternalAppRedirectPath`, so there is no open-redirect. The note that line 74 is fine and only the line-68 write is the impurity is also correct. It is a genuine (if minor) correctness smell, BUG severity is right, no security consequence.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-22)
