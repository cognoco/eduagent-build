# Batch 6 verification results

Branch: codex/h1-isowner-navigation-contract-sweep @ 343b0502f
Verified: 2026-05-23

### #76 — [LEARN-04/CC-01] Book session crashes after first assistant response
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/session/session-crud.ts (and session-import-guard tests)
- **Evidence:** Commit `e5fc843a5` ("fix(flows): repair red-row mobile flows") explicitly addresses LEARN-04/CC-01 with "remove session self-barrel imports that could trip bundled init order" — the exact root cause of the `Cannot access 'wt' before initialization` ReferenceError observed in the Playwright probe. Commit is an ancestor of HEAD. Mobile session-import-guard focused jest verification cited in commit body.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed in e5fc843a5)

### #351 — [CR-2026-05-19-H1] isOwner gate missing on 31+ administrative routes
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/family-access.ts:121-138; apps/api/src/routes/billing.ts:312,387,594,749,799; apps/api/src/routes/consent.ts:285,331,382; apps/api/src/routes/learner-profile.ts (11 sites tagged CR-2026-05-19-H1, L90-426); apps/api/src/routes/dashboard.ts (14 sites tagged CR-2026-05-19-H1, L94-367); apps/api/src/routes/account.ts:59,108,140; apps/api/src/routes/profiles.ts:77,145,180
- **Evidence:** Helper `assertOwnerAndParentAccess` exists at family-access.ts:121-138 (checks `profileMeta?.isOwner !== true` then delegates). All sites listed in the Notion body carry inline `[CR-2026-05-19-H1]` markers and explicit isOwner gates. Sweep is complete across billing (cancel/top-up/portal/family), consent (status/revoke/restore), learner-profile (all `:profileId` parent variants), dashboard (all assertParentAccess sites), account (delete/cancel-deletion/export), and profiles (create + read/update self-vs-owner gate).
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (fixed by sweep tagged CR-2026-05-19-H1)

### #397 — [CR-2026-05-19-M13] CI / dev-experience gaps
- **Verdict:** STILL_OPEN
- **File(s):** .github/workflows/deploy.yml:106,110,259; .github/workflows/api-quality-gate.yml:34-38; .github/workflows/ci.yml (no eval:llm step)
- **Evidence:** (1) `grep eval:llm .github/workflows/` returns zero hits — harness still not wired into CI. (2) deploy.yml:106,110 still gate unit + integration tests on `if: github.event_name == 'workflow_dispatch'` — push-to-main deploy runs lint+typecheck only. (3) deploy.yml:259 still reads `${{ secrets.SKIP_DOPPLER_SYNC }}` (not `vars.`). (4) api-quality-gate.yml L34-38 lint/typecheck steps remain bare `pnpm exec nx run api:lint` with no rule-code/recovery echo.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #463 — [CR-2026-05-21-058] vocabulary-extract & subject-classify greedy JSON regex
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/api/src/services/vocabulary-extract.ts:3,68; apps/api/src/services/subject-classify.ts:9,127,203; apps/api/src/services/subject-resolve.ts:2,99
- **Evidence:** All 4 sites now import `extractFirstJsonObject` from `./llm` and call it instead of the prior `result.response.match(/\{[\s\S]*\}/)` greedy regex (e.g., vocabulary-extract.ts:68 `const jsonStr = extractFirstJsonObject(result.response);`). Exactly the fix proposed in the Notion body.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved

### #512 — [CR-2026-05-21-107] Profiles screen 20s switch timeout false alert
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/profiles.tsx:170-209
- **Evidence:** L170-174 still uses `setTimeout(() => { switchInFlightRef.current = false; setIsSwitching(false); platformAlert('Taking longer than expected', 'Please try again.'); }, 20_000)` with no AbortSignal threaded into `switchProfile(...)` at L178/179 and no `timedOutRef` guard on the post-await success path at L181-197. If the in-flight request resolves after 20s, the alert has already fired and `handleClose()` runs anyway. None of the recent commits to this file (343b0502f, 7f48c31bf, 008030820) address the timeout race.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #554 — [CR-2026-05-21-149] secure-storage.sanitizeSecureStoreKey collision risk
- **Verdict:** ALREADY_FIXED
- **File(s):** apps/mobile/src/lib/secure-storage.ts:132-170
- **Evidence:** Function now carries explicit `[CR-2026-05-21-149]` tag at L153 and implements the "warn when sanitization actually replaces a char" branch of the suggested fix: a `_sanitizeWarnedKeys` Set latch at L138 plus a `console.warn` block at L157-160 fires once per substituted key. The lossy `.replace(/[^a-zA-Z0-9._-]/g, '_')` remains (documented as intentional at L145-148 — profileIds/sessionIds are UUID-like), but unexpected collisions now surface in dev logs as the Notion fix proposed.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (warn-on-substitution variant of suggested fix)

### #589 — [CR-2026-05-21-184] signTestJwt overwrites caller's iat/exp via spread order
- **Verdict:** STILL_OPEN
- **File(s):** packages/test-utils/src/auth/test-jwt.ts:114-136
- **Evidence:** L123-129 still spreads `...payload` AFTER the defaults: `const claims = { sub: 'user_test', email: ..., iat: now, exp: now+3600, ...payload };`. L132-136 then deletes any key whose value is `undefined`. Passing `{ sub: undefined }` for a "missing sub" negative-path test still overrides the default with undefined and then deletes the key — inverse semantics, matching the bug description exactly. No "filter payload for undefined BEFORE spread" change has been applied.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #604 — [PARENT-13] Weekly report row no longer opens weekly report detail
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(app)/child/[profileId]/reports.tsx:328-330
- **Evidence:** `onPressWeekly` handler at L328 still calls `setSelectedWeeklyReportId(reportId)` (inline state update — swaps the summary header) instead of navigating. The monthly handler immediately above (L321-326) DOES use `router.push({ pathname: '/(app)/child/[profileId]/report/[reportId]', ... })`. The detail route file exists at `apps/mobile/src/app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx` and is unreachable from this list. Mark-viewed-on-mount path therefore never runs.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

### #617 — [AUTH-06] Forgot-password reset request can spin indefinitely
- **Verdict:** STILL_OPEN
- **File(s):** apps/mobile/src/app/(auth)/forgot-password.tsx:61-78
- **Evidence:** `onSendCodePress` (L61-78) wraps `signIn.create({ strategy: 'reset_password_email_code', ... })` in try/finally with `setLoading(true)` at L65 and `setLoading(false)` at L76. There is no timeout, no `AbortController`, no `Promise.race` with a timer, and no visible error/retry path if Clerk's request hangs — the spinner stays mounted forever (matching the screenshot evidence). `onResetPress` at L80-125 has the same shape. The recent commit `5d210ac2b` ("wave-7 i18n hardening — error classification ... auth screens") touched this file for i18n but did not add a timeout.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open

---

## Summary

| BugId | CR | Verdict | Confidence |
|---|---|---|---|
| #76 | LEARN-04/CC-01 | ALREADY_FIXED | HIGH |
| #351 | CR-2026-05-19-H1 | ALREADY_FIXED | HIGH |
| #397 | CR-2026-05-19-M13 | STILL_OPEN | HIGH |
| #463 | CR-2026-05-21-058 | ALREADY_FIXED | HIGH |
| #512 | CR-2026-05-21-107 | STILL_OPEN | HIGH |
| #554 | CR-2026-05-21-149 | ALREADY_FIXED | HIGH |
| #589 | CR-2026-05-21-184 | STILL_OPEN | HIGH |
| #604 | PARENT-13 | STILL_OPEN | HIGH |
| #617 | AUTH-06 | STILL_OPEN | HIGH |

**Fixed: 4 / 9** (#76, #351, #463, #554)
**Still open: 5 / 9** (#397, #512, #589, #604, #617)
