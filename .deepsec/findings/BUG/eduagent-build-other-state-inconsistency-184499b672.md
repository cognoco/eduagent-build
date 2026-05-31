# [BUG] Proxy mode not cleared when saved profile is removed server-side (sticky contradictory state)

**File:** [`apps/mobile/src/lib/profile.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/lib/profile.ts#L279-L311) (lines 279, 280, 281, 282, 283, 284, 293, 305, 306, 307, 308, 309, 310, 311)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-state-inconsistency`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

On cold start two independent effects restore state: one restores the explicit proxy flag from SecureStore (L279-289: `setProxyMode(restoredProxy)` + `setIsExplicitProxyMode(restoredProxy)`), the other restores the saved active profile id (L258-274). The validation effect (L293-313) then checks whether the saved id still exists; if not (child profile removed server-side via consent denial/auto-delete), it sets `profileWasRemoved` and falls back to the owner profile (L305-311) — but it never clears the proxy flag, PARENT_PROXY_KEY, or calls setProxyMode(false)/setIsExplicitProxyMode(false). Result: when PARENT_PROXY_KEY was 'true' and the saved (child) id is stale, the app ends up with activeProfile = owner while isExplicitProxyMode = true and the api-client emits `X-Proxy-Mode: true` for the owner's own profile. This is a contradictory 'owner is in proxy-as-child mode' state. Because assertNotProxyMode() is the write guard for proxy sessions, the most likely effect is that the owner's writes are blocked and a 'viewing as child' banner shows on their own profile — and it is sticky: PARENT_PROXY_KEY is only cleared by an explicit switchProfile() (L379-387) or sign-out (GLOBAL_KEYS), so it survives restarts until then. The direction is fail-safe for security (writes blocked rather than mis-attributed), so this is a correctness/availability bug, not an auth bypass.

## Recommendation

In the profile-removed fallback branch (L297-312), also reset proxy state when falling back to the owner: call setProxyMode(false), setIsExplicitProxyMode(false), and delete PARENT_PROXY_KEY (mirroring the else-branch of switchProfile at L383-387). Proxy mode should never outlive the child profile it was entered for.

## Revalidation

**Verdict:** true-positive

The code asymmetry is real and accurately described. The cold-start effect at lines 279-289 unconditionally restores proxy state from PARENT_PROXY_KEY (setProxyMode + setIsExplicitProxyMode), while the profile-removed fallback at lines 297-312 sets profileWasRemoved and falls back to the owner profile but never clears proxy state. I confirmed the downstream impact: api-client.ts line 198 emits `X-Proxy-Mode: true` whenever the module flag is set, and the server guard apps/api/src/middleware/proxy-guard.ts lines 68-73 rejects any request carrying `X-Proxy-Mode: true` with a 403 PROXY_MODE *even when the resolved profile is the owner* (it 'can only tighten'). So the sticky state would indeed block the owner's own writes and show a contradictory 'viewing as child' banner, and it survives restarts until an explicit switchProfile or sign-out — exactly as described. CRUCIAL CAVEAT on reachability: no production flow currently enters proxy mode. Every production caller of switchProfile (LearnerScreen, ConsentGates, profiles.tsx:205 `handleSwitch(profile.id)`, create-profile, _layout switch-back) omits options or passes none, so proxyMode defaults to false; only tests and the deliberately-retained internal path pass `proxyMode: true`. Therefore PARENT_PROXY_KEY is never written 'true' in the shipping app today and the sticky state is currently latent. It is a genuine correctness bug (fail-safe in direction — writes blocked, never mis-attributed) that is one wiring-change away from manifesting because the proxy capability is intentionally retained; the fix (clear proxy state in the fallback, mirroring switchProfile's else-branch) is correct and cheap. I keep it at BUG severity to reflect the latent, non-security nature.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
