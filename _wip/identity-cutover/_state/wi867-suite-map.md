# WI-867 suite classification map (from suite-mapper, HEAD a85ca25d9, 2026-06-20)

Buckets: A=27 SEAM-CONTINUITY (add profile-v2/family-v2/billing-v2 continuity mock, dashboard pattern, gc1-allow=CONTINUITY)
B=21 CUSTOM-DB-RESOLVE (suite passes own db; ADD the missing db.query.<table> key — person/membership/guardianship/subscription — GC-CLEAN, no jest.mock)
C=3 OBSOLETE-DELETE (pure flag-off tests -> delete the case/suite)
D=13 BEHAVIORAL-DRIFT (update stale assertion; some are deep rewrites)
E=5 PRE-EXISTING (fail at base 7e0d75157, NOT this work — leave + note in PR)

Several suites span buckets (A+C, A+D, B+C, D+C) -> partition by DIRECTORY so each file is wholly owned by one builder.

## ROUTES (P1) — 27 files
A profile-v2 continuity: book-suggestions, bookmarks, coaching-card, consent, curriculum, dictation, feedback, filing, homework, library-search, notifications, nudges, onboarding, progress, quiz, retention, revenuecat-webhook, stripe-webhook, topic-suggestions, vocabulary
A billing-v2 continuity: billing
A family-v2 continuity + D callerPersonId opts: learner-profile (BOTH in one file)
A profile-v2 + C delete-flag-off: books, sessions (sessions: mock getPersonScope in useAutoFileProfile)
D behavioral: account (deletion flow: billing-v2 error codes, gracePeriodEnds, core-send-rollback vs core-send), profiles (re-mock listProfilesV2 + delete flag-off C), settings (provide callerPersonId in opts or mock requireCallerPersonId)

## INNGEST (P2) — 23 files
B add person.findFirst: daily-reminder-send, email-digest-channel, review-due-send, summary-regenerate, weekly-progress-push
B add membership.findFirst: consent-reminders, freeform-filing, post-session-suggestions, subject-retry-curriculum
B add guardianship.findMany: progress-summary
B add subscription key: notify-parent-child-cap-hit, trial-expiry
B seed v2 identity keys: monthly-report-cron, weekly-self-reports
B add person key + C delete-flag-off: daily-snapshot
C pure delete-flag-off: daily-reminder-scan, quota-reset
D behavioral: account-deletion (already_deleted vs cancelled), archive-cleanup (deleteProfile gate), consent-revocation (status restored vs deleted; deep rewrite to v2 consent setup), recall-nudge (toHaveBeenCalledTimes 7->8), review-due-scan (7->8 + delete flag-off C), session-completed (applyAnalysis short-circuit; rewrite v2 GDPR consent + delete flag-off C)

## MIDDLEWARE + SERVICES (P3) — 19 files
MW A continuity: metering.refund-on-throw (billing-v2), metering (billing-v2), profile-scope (profile-v2)
MW D: account (assert resolveIdentityV2 call, remove findOrCreateAccount), database (relax deep-eq -> toMatchObject; foundation adds query Proxy key)
MW E pre-existing: jwt (setTimeout not defined)
SVC B add key: family-access (guardianship + C delete flag-off dispatch), learner-profile (membership), monthly-report (guardianship.findFirst), notifications (guardianship.findMany), nudge (membership), profile (guardianship/person)
SVC C pure delete: family-bridge (flag-off)
SVC D: curriculum-topic-ownership.guard (lower EXPECTED_COUNTS['family-bridge.ts'] to 0), settings (provide callerPersonId; update error msg)
SVC E pre-existing: llm/providers/anthropic (fetch spy), llm/providers/gemini (fetch spy), snapshot-aggregation (setTimeout), support/spillover (relation accounts does not exist)

## account/* GUARDRAIL: account.test.ts + account-deletion.test.ts are BOTH D (update-in-place, NOT delete) -> NO integration twin obligation. Clean.

## E bucket (leave as-is, note pre-existing in PR; verify each fails at base 7e0d75157): jwt, anthropic, gemini, snapshot-aggregation, spillover

## SHARPENED REALITY (2026-06-20, after first edit attempts) — mapper UNDER-classified the route/mw tier
- Route/mw "A" files are MULTI-SEAM, not "profile-v2 only". Each route needs continuity mocks for EVERY v2 service its source calls. Verified: `consent` route calls 5 fns — requestConsentV2/resendConsentV2/revokeChildConsentV2/restoreChildConsentV2 (consent-v2) + getChildConsentForParentV2 (family-v2) — PLUS profile-v2 via profile-scope mw. A profile-v2-only mock leaves the other seams returning db.select→[] → handler dereferences undefined row → HTTP 500.
- Recipe (unchanged in spirit, sharper in scope): for each route, `grep` its SOURCE for `from '../services/identity-v2/*'` / `billing-v2`, and add a continuity mock per imported v2 service, mirroring the test's pre-collapse legacy-service mock return values. gc1-allow=continuity.
- The 6 truly-plain routes p1 did (bookmarks,coaching-card,library-search,nudges,vocabulary,topic-suggestions) + onboarding/billing only needed profile-v2 (+billing-v2) — those are the EASY subset. The heavier routes (consent,curriculum,sessions,…) are multi-seam.
- PATH-B reference: contaminated origin/WI-867 (tip 5a0eb35e7, on base 7e0d75157, NO foundation) touched 23 test files (routes+mw) and ALREADY mocks the correct per-route seam SET. Its only sins: 21 `jest.mock('../services/identity-v2/identity-resolve')` blocks (foundation now seeds resolveIdentityV2 — STRIP) + "covered by integration" gc1-allow framing (REFRAME to continuity). It does NOT cover inngest(23)/services(13)/D — those still need fresh work.
- DELEGATION RELIABILITY: in-process-teammate builders are unreliable — p1 did 8/27 then punted the rest with a FALSE "structural" rationale; p1b stalled after worktree setup (0 edits). Cannot TaskStop in-process teammates. Need a reliable execution vehicle.

## SEAM SEEDABILITY MAP (2026-06-20, re ic-214 GC-seed gate) — verified at primary source
| seam family | db.select | db.query | seedable? |
|---|---|---|---|
| profile-v2 (getPersonScope/findOwnerPersonScope) | 8 | — | NO — db.select join chains; UNIVERSAL (every auth route via profile-scope mw) |
| family-v2 (getChildConsentForParentV2 etc.) | 0 | 3 | YES (db.query, table-keyed) |
| consent-v2 (requestConsentV2 etc.) | 1 (trivial displayName) | 13 | MOSTLY YES |
| billing-v2 (dir) | 14 | 25 | MIXED — db.select fns unseedable |
DEMO: nudges.test.ts @a85ca25d9 (foundation db.query identity-seed ACTIVE, NO profile-v2 mock) FAILS with stack at getPersonScope(profile-v2.ts:344)<-profile-scope.ts:189 => db.query seed does NOT reach getPersonScope's db.select. Seed-only is infeasible for the universal profile-v2 seam.
RESOLUTION PENDING orchestrator re-rule: seed db.query seams (family-v2/consent-v2/billing-v2-query); for db.select seams (profile-v2 universal + billing-v2-select) options = (a) narrow justified gc1-allow continuity-mock [doctrine: genuinely-cant-run], (b) integration tests, (c) refactor getPersonScope->db.query.

## SEEDABILITY DOCTRINE — banked per ic-orch-227 (2026-06-20). AUTHORITATIVE, supersedes per-module counts above.
Seedability is per-FUNCTION, read at SOURCE — NOT the seam-map per-module db.query/db.select counts (those are UNRELIABLE at fn level, proven by metering-v2 + ownership-v2).
TEST = the call shape inside the function:
- `db.query.X.findFirst/findMany`  => SEEDABLE  => SEED it (foundation seed / add db.query.X key). NEVER gc1-allow.
- `db.select()` of ANY shape (incl single-table `.from(t).where().limit(1)`)  => UNSEEDABLE on the Proxy mock (returns [] regardless of any db.query seed)  => continuity mock, gc1-allow.
- `.insert().returning()` write => UNSEEDABLE (returning() => [] => [0] undefined) => gc1-allow the WRITE fn only.
gc1-allow REQUIREMENTS (both): (i) cite the SPECIFIC unseedable fn + "db.select/returning returns [] on the Proxy unit-mock", (ii) NAME the integration twin file. SCOPE the mock to ONLY the unseedable fn(s); SEED every seedable db.query.* read in the same file (no blanket module mock). Mixed module (e.g. consent-v2.requestConsentV2: db.query.consentRequest.findFirst read + .returning() write) => SEED the read, gc1-allow only the write.
