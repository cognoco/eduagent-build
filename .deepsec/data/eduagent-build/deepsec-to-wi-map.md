# DeepSec → ZDX Work Item traceability index

Scan run `20260516050543-3902c61be7bd5834` (2026-05-16). 236 findings → 236 Items under 14 Work Packages in the ZDX Work Items DB.

## Work Packages

| WP | Family | Items | Priority |
|---|---|---|---|
| WI-76 | WP-ACL | 41 | P1 |
| WI-77 | WP-COST | 39 | P1 |
| WI-78 | WP-RACE | 30 | P1 |
| WI-79 | WP-LLM | 22 | P1 |
| WI-80 | WP-XTEN | 22 | P1 |
| WI-81 | WP-LOGIC | 16 | P1 |
| WI-82 | WP-CONSENT | 14 | P1 |
| WI-83 | WP-CICD | 13 | P1 |
| WI-84 | WP-DATA | 11 | P1 |
| WI-85 | WP-WEBHOOK | 7 | P1 |
| WI-86 | WP-STALE | 7 | P2 |
| WI-87 | WP-INPUT | 6 | P1 |
| WI-88 | WP-DISCLOSE | 5 | P2 |
| WI-89 | WP-SCORE | 3 | P1 |

## Findings

| DS | WI | WP | Severity | Priority | Class | File | Lines | Title |
|---|---|---|---|---|---|---|---|---|
| DS-001 | WI-90 | WI-83 | HIGH | P1 | github-workflow-security | `.github/actions/claude-review/action.yml` | 12 14 | Unpinned third-party GitHub Action receives a secret token |
| DS-002 | WI-91 | WI-79 | MEDIUM | P2 | other-prompt-injection | `.github/actions/claude-review/action.yml` | 20 21 22 115 116 174 176 | Untrusted PR metadata is injected into an agent prompt with write-capable tools |
| DS-003 | WI-92 | WI-83 | MEDIUM | P2 | other-ci-supply-chain | `.github/workflows/api-quality-gate.yml` | 19 23 27 | Quality gate executes mutable action tags |
| DS-004 | WI-93 | WI-83 | HIGH | P1 | other-ci-supply-chain | `.github/workflows/ci.yml` | 56 71 89 94 218 258 263 274 278 | OTA deployment path uses mutable actions with Expo credentials |
| DS-005 | WI-94 | WI-83 | HIGH | P1 | secrets-exposure | `.github/workflows/claude-code-review.yml` | 32 36 43 45 53 55 61 63 | PR-controlled local action receives Claude OAuth secrets |
| DS-006 | WI-95 | WI-76 | HIGH | P1 | missing-auth | `.github/workflows/claude.yml` | 20 21 22 23 24 30 43 45 | Any @claude issue or comment can invoke a secret-backed agent |
| DS-007 | WI-96 | WI-83 | HIGH | P1 | other-ci-supply-chain | `.github/workflows/claude.yml` | 34 43 45 | Secret-backed Claude workflow uses mutable action tags |
| DS-008 | WI-97 | WI-84 | HIGH_BUG | P1 | other-deploy-migration-drift | `.github/workflows/deploy.yml` | 213 217 219 226 | Deploy can mark new migrations as applied without running them |
| DS-009 | WI-98 | WI-83 | HIGH | P1 | other-ci-supply-chain | `.github/workflows/deploy.yml` | 245 247 248 262 263 | Deployment secrets are exposed to an unpinned curl-to-shell installer |
| DS-010 | WI-99 | WI-83 | HIGH | P1 | other-ci-supply-chain | `.github/workflows/deploy.yml` | 76 80 84 137 139 143 272 395 450 452 456 464 468 | Deploy and mobile build jobs use mutable action tags with deployment credentials |
| DS-011 | WI-100 | WI-81 | BUG | P2 | other-logic-bug | `.github/workflows/deploy.yml` | 361 367 370 371 377 383 386 | Staging smoke checks accept missing protected routes |
| DS-012 | WI-101 | WI-83 | HIGH | P1 | other-ci-pwn-request | `.github/workflows/e2e-ci.yml` | 6 7 41 43 58 59 172 202 204 263 267 270 272 | Privileged workflow_run executes pull-request code with seed secret access |
| DS-013 | WI-102 | WI-83 | MEDIUM | P2 | other-supply-chain | `.github/workflows/e2e-ci.yml` | 263 267 411 414 427 | Remote Maestro installer is piped to bash after secrets are written to the workspace |
| DS-014 | WI-103 | WI-83 | HIGH | P1 | secrets-exposure | `.github/workflows/e2e-web.yml` | 4 62 73 74 76 88 96 97 | Pull-request workflow runs checked-out PR code with Clerk and test seed secrets |
| DS-015 | WI-104 | WI-81 | BUG | P2 | other-cleanup-logic | `.github/workflows/e2e-web.yml` | 112 113 117 121 126 129 | Secondary seed cleanup uses a fallback prefix that does not match the Playwright run |
| DS-016 | WI-105 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `.github/workflows/mobile-ci.yml` | 6 7 9 50 53 170 172 175 195 199 201 203 | Mobile build workflow_run is not explicitly restricted to push events from this repository |
| DS-017 | WI-106 | WI-83 | MEDIUM | P2 | other-supply-chain | `.github/workflows/mobile-ci.yml` | 194 195 199 231 232 236 | Unpinned Expo GitHub Action receives the EAS token |
| DS-018 | WI-107 | WI-85 | HIGH_BUG | P1 | other-webhook-auth-wall | `apps/api/src/index.ts` | 68 179 180 235 | Resend webhook is mounted behind Clerk auth |
| DS-019 | WI-108 | WI-83 | MEDIUM | P2 | secret-in-log | `apps/api/src/inngest/functions/ask-gate-observe.ts` | 29 32 53 55 61 64 | LLM-derived ask-gate reason is logged as free text |
| DS-020 | WI-109 | WI-82 | HIGH_BUG | P1 | other-expired-consent-link | `apps/api/src/inngest/functions/consent-reminders.ts` | 57 70 81 86 100 105 | Reminder emails reuse consent tokens after they expire |
| DS-021 | WI-110 | WI-84 | HIGH_BUG | P1 | other-stale-workflow-data-loss | `apps/api/src/inngest/functions/consent-reminders.ts` | 24 26 137 148 | Older consent reminder runs can delete after a newer request |
| DS-022 | WI-111 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/inngest/functions/consent-revocation.ts` | 88 94 137 141 145 226 228 | Consent restoration can race with final archive or delete |
| DS-023 | WI-112 | WI-84 | BUG | P2 | other-data-loss | `apps/api/src/inngest/functions/feedback-delivery-failed.ts` | 28 29 30 148 155 | Queued feedback retry drops the original submission |
| DS-024 | WI-113 | WI-82 | MEDIUM | P2 | other-consent-bypass | `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts` | 36 62 91 | Memory embedding backfill ignores memory consent before external processing |
| DS-025 | WI-114 | WI-76 | MEDIUM | P2 | other-stale-authorization | `apps/api/src/inngest/functions/monthly-report-cron.ts` | 187 341 422 | Monthly report generation does not revalidate current parent-child access |
| DS-026 | WI-115 | WI-82 | BUG | P2 | other-privacy-preference-bypass | `apps/api/src/inngest/functions/monthly-report-cron.ts` | 422 433 443 | Monthly report push ignores push opt-out |
| DS-027 | WI-116 | WI-82 | HIGH | P1 | other-consent-bypass | `apps/api/src/inngest/functions/post-session-suggestions.ts` | 86 145 211 | Background LLM suggestion job does not re-check withdrawn consent |
| DS-028 | WI-117 | WI-82 | HIGH | P1 | other-consent-bypass | `apps/api/src/inngest/functions/progress-summary.ts` | 35 41 71 86 108 | Parent progress summary generation ignores current child consent |
| DS-029 | WI-118 | WI-79 | MEDIUM | P2 | other-llm-prompt-injection | `apps/api/src/inngest/functions/progress-summary.ts` | 84 86 108 | Child-controlled learning labels can influence parent-facing LLM prose |
| DS-030 | WI-119 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/inngest/functions/recall-nudge-send.ts` | 61 62 | Recall nudge topic lookup is not scoped to the recipient profile |
| DS-031 | WI-120 | WI-86 | MEDIUM | P2 | other-archived-profile-notification | `apps/api/src/inngest/functions/recall-nudge.ts` | 52 68 73 85 133 | Recall nudge scan can notify archived profiles |
| DS-032 | WI-121 | WI-86 | MEDIUM | P2 | other-archived-profile-notification | `apps/api/src/inngest/functions/review-due-scan.ts` | 47 64 67 79 120 | Review reminder scan can notify archived profiles |
| DS-033 | WI-122 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/inngest/functions/session-completed.ts` | 839 848 | Parent-facing session insights use an unescaped transcript |
| DS-034 | WI-123 | WI-82 | HIGH | P1 | other-consent-bypass | `apps/api/src/inngest/functions/subject-prewarm-curriculum.ts` | 76 94 112 132 | Curriculum prewarm sends learner data to LLM without async consent revalidation |
| DS-035 | WI-124 | WI-82 | HIGH | P1 | other-consent-bypass | `apps/api/src/inngest/functions/subject-retry-curriculum.ts` | 56 64 77 96 | Curriculum retry can process withdrawn profiles in the background |
| DS-036 | WI-125 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/inngest/functions/subject-retry-curriculum.ts` | 37 42 72 77 | Retry curriculum events are not idempotent before an expensive LLM call |
| DS-037 | WI-126 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/inngest/functions/topic-probe-extract.ts` | 237 247 256 312 322 325 | Topic-probe metadata writes can clobber concurrent session metadata |
| DS-038 | WI-127 | WI-84 | HIGH_BUG | P1 | other-dropped-background-events | `apps/api/src/inngest/functions/weekly-self-reports.ts` | 81 84 87 89 100 130 139 | Fan-out suppresses send failures so weekly report batches are not retried |
| DS-039 | WI-128 | WI-76 | HIGH | P1 | auth-bypass | `apps/api/src/middleware/account.ts` | 24 28 41 43 | Email-only account reclamation can rebind an existing account without an email-verification check |
| DS-040 | WI-129 | WI-85 | HIGH_BUG | P1 | other-webhook-auth-misconfiguration | `apps/api/src/middleware/auth.ts` | 33 47 121 122 | Resend webhook is unintentionally blocked by Clerk auth |
| DS-041 | WI-130 | WI-82 | MEDIUM | P2 | other-consent-gate-bypass | `apps/api/src/middleware/consent.ts` | 25 29 30 59 81 99 | Broad exempt prefixes bypass consent enforcement for profile data writes |
| DS-042 | WI-131 | WI-84 | HIGH_BUG | P1 | other-production-outage | `apps/api/src/middleware/env-validation.ts` | 50 54 58 63 | Production deploy gate can 500 every request when IDEMPOTENCY_KV is not bound |
| DS-043 | WI-132 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/middleware/metering.ts` | 76 83 99 119 128 308 | LLM route allowlist misses authenticated LLM-backed endpoints |
| DS-044 | WI-133 | WI-77 | HIGH_BUG | P1 | other-quota-accounting | `apps/api/src/middleware/metering.ts` | 458 459 493 494 495 | Quota is not refunded when a metered handler throws |
| DS-045 | WI-134 | WI-84 | HIGH_BUG | P1 | other-durable-job-loss | `apps/api/src/routes/account.ts` | 44 55 70 | Account deletion can be marked scheduled without a durable deletion job |
| DS-046 | WI-135 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/assessments.ts` | 47 50 | Assessment creation accepts unverified subject and topic IDs |
| DS-047 | WI-136 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/assessments.ts` | 91 127 143 276 291 | Assessment LLM calls are not metered and terminal assessments can be replayed |
| DS-048 | WI-137 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/billing.ts` | 210 288 347 542 628 655 | Billing management routes do not enforce owner-profile authorization |
| DS-049 | WI-138 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/routes/book-suggestions.ts` | 35 40 41 42 43 | Proxy-mode child profile can trigger suggestion-generation writes |
| DS-050 | WI-139 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/books.ts` | 100 106 143 195 208 224 | Proxy-mode child profile writes are not blocked |
| DS-051 | WI-140 | WI-80 | HIGH | P1 | cross-tenant-id | `apps/api/src/routes/books.ts` | 195 209 224 228 229 230 | Topic move can target a topic outside the authenticated subject |
| DS-052 | WI-141 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/books.ts` | 100 136 | Book topic generation is outside LLM quota enforcement |
| DS-053 | WI-142 | WI-81 | HIGH_BUG | P1 | other-logic-bug | `apps/api/src/routes/books.ts` | 111 113 120 136 143 | Failed topic generation permanently marks a book as generated |
| DS-054 | WI-143 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/routes/celebrations.ts` | 53 55 58 59 61 | Client-controlled viewer can mark child celebrations seen in proxy mode |
| DS-055 | WI-144 | WI-88 | MEDIUM | P2 | other-info-disclosure | `apps/api/src/routes/consent-web.ts` | 163 184 227 252 296 340 | Expired or already-used consent tokens still disclose the child name |
| DS-056 | WI-145 | WI-84 | HIGH_BUG | P1 | other-data-deletion | `apps/api/src/routes/consent-web.ts` | 291 297 324 | Consent denial is not atomic with profile deletion |
| DS-057 | WI-146 | WI-77 | MEDIUM | P2 | rate-limit-bypass | `apps/api/src/routes/consent.ts` | 120 140 162 167 | Consent request email sending can be abused by rotating parent emails |
| DS-058 | WI-147 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/curriculum.ts` | 56 78 107 131 156 | Curriculum mutation endpoints omit the proxy-mode write guard |
| DS-059 | WI-148 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/curriculum.ts` | 182 188 | Topic explanation lookup is not scoped to the requested subject/profile |
| DS-060 | WI-149 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/curriculum.ts` | 107 131 182 | Curriculum LLM endpoints are not metered or rate-limited |
| DS-061 | WI-150 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/dictation.ts` | 177 178 242 | Dictation review accepts an unbounded sentence payload before an LLM call |
| DS-062 | WI-151 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/dictation.ts` | 154 160 | Dictation result can record practice activity against an unowned subject ID |
| DS-063 | WI-152 | WI-84 | BUG | P2 | other-data-loss | `apps/api/src/routes/feedback.ts` | 120 123 125 130 | Queued feedback loses the original message after email failure |
| DS-064 | WI-153 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/filing.ts` | 52 56 63 64 171 172 229 230 232 233 | Filing endpoints allow proxy-mode writes to child libraries |
| DS-065 | WI-154 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/filing.ts` | 42 52 56 57 63 93 101 | Filing LLM calls bypass quota and retry controls |
| DS-066 | WI-155 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/homework.ts` | 54 77 84 87 103 | OCR endpoint is authenticated but not metered or rate-limited |
| DS-067 | WI-156 | WI-82 | MEDIUM | P2 | other-consent-bypass | `apps/api/src/routes/learner-profile.ts` | 81 85 86 94 98 99 | Child learner-profile routes bypass child consent visibility checks |
| DS-068 | WI-157 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/learner-profile.ts` | 305 311 316 324 | Tell Mentor endpoints invoke the LLM without quota or rate limiting |
| DS-069 | WI-158 | WI-81 | BUG | P2 | other-false-success | `apps/api/src/routes/maintenance.ts` | 53 55 65 78 80 90 | Maintenance endpoints report queued even if the dispatch failed |
| DS-070 | WI-159 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/routes/nudges.ts` | 49 58 | Proxy-mode parent can mark child nudges as read |
| DS-071 | WI-160 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/routes/onboarding.ts` | 45 96 137 | Self-service onboarding writes bypass proxy-mode and parent-child access checks |
| DS-072 | WI-161 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/parking-lot.ts` | 52 58 60 65 82 | Proxy-mode child profile can add parking-lot items |
| DS-073 | WI-162 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/progress.ts` | 65 71 73 | Topic progress leaks topic metadata for arbitrary topic IDs |
| DS-074 | WI-163 | WI-89 | HIGH_BUG | P1 | other-progress-integrity | `apps/api/src/routes/quiz.ts` | 286 293 303 308 315 322 324 | Quiz completion can be manipulated to inflate score, XP, and mastery |
| DS-075 | WI-164 | WI-85 | HIGH_BUG | P1 | other-webhook-auth-misconfiguration | `apps/api/src/routes/resend-webhook.ts` | 271 | Resend webhook is mounted behind Clerk auth |
| DS-076 | WI-165 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/retention.ts` | 166 170 176 197 200 205 | Teaching-preference writes bypass parent proxy-mode authorization |
| DS-077 | WI-166 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/retention.ts` | 231 233 240 245 | Evaluate eligibility leaks topic titles across profiles |
| DS-078 | WI-167 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/routes/retention.ts` | 105 108 115 | Recall tests can create retention state for unowned topics |
| DS-079 | WI-168 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/retention.ts` | 105 108 115 | Recall-test LLM calls are not metered |
| DS-080 | WI-169 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/routes/revenuecat-webhook.ts` | 668 715 | RevenueCat idempotency/order check is not atomic with subscription updates |
| DS-081 | WI-170 | WI-81 | BUG | P2 | other-logic-bug | `apps/api/src/routes/revenuecat-webhook.ts` | 679 688 | Production sandbox rejection still mutates billing state |
| DS-082 | WI-171 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/sessions.ts` | 868 924 943 956 972 991 1020 1056 | Non-LLM session mutation endpoints bypass the server-derived proxy-mode write guard |
| DS-083 | WI-172 | WI-79 | MEDIUM | P2 | other-llm-prompt-injection | `apps/api/src/routes/sessions.ts` | 924 932 | Client-controlled system prompts are persisted and replayed as LLM system-role messages |
| DS-084 | WI-173 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/settings.ts` | 90 117 165 289 341 378 | Active-profile settings writes do not reject parent proxy sessions |
| DS-085 | WI-174 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/routes/snapshot-progress.ts` | 59 75 | Progress write paths omit the parent-proxy write guard |
| DS-086 | WI-175 | WI-85 | MEDIUM | P2 | other-billing-bypass | `apps/api/src/routes/stripe-webhook.ts` | 147 148 149 150 239 240 241 277 | Paid entitlements are granted from unverified Stripe metadata |
| DS-087 | WI-176 | WI-78 | HIGH_BUG | P1 | other-event-ordering | `apps/api/src/routes/stripe-webhook.ts` | 144 212 333 399 477 | Stripe event ordering loses distinct events created in the same second |
| DS-088 | WI-177 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/subjects.ts` | 76 79 84 87 92 94 114 116 118 138 144 145 | Subject write endpoints bypass the proxy-mode write guard |
| DS-089 | WI-178 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/routes/subjects.ts` | 49 54 58 65 76 84 114 118 | Subject LLM flows are outside centralized quota enforcement |
| DS-090 | WI-179 | WI-77 | MEDIUM | P2 | rate-limit-bypass | `apps/api/src/routes/support.ts` | 25 37 51 | Outbox spillover has no server-side rate limit |
| DS-091 | WI-180 | WI-84 | HIGH_BUG | P1 | other-data-loss | `apps/api/src/routes/test-seed.ts` | 127 142 148 168 | Test seed/reset can modify or delete non-seed accounts outside production |
| DS-092 | WI-181 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/routes/vocabulary.ts` | 56 82 111 | Vocabulary mutations are allowed from parent-proxy sessions |
| DS-093 | WI-182 | WI-85 | HIGH | P1 | other-account-takeover | `apps/api/src/services/account.ts` | 90 94 97 98 | Email-only Clerk subject reclaim can transfer an existing account |
| DS-094 | WI-183 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/assessments.ts` | 469 472 473 474 475 | Assessment creation accepts unowned subject and topic IDs |
| DS-095 | WI-184 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/assessments.ts` | 178 202 | Assessment LLM calls are not quota-metered |
| DS-096 | WI-185 | WI-79 | MEDIUM | P2 | other-llm-state-injection | `apps/api/src/services/assessments.ts` | 330 333 334 340 343 344 345 366 367 | Free-text LLM JSON controls assessment state |
| DS-097 | WI-186 | WI-81 | BUG | P2 | other-logic-bug | `apps/api/src/services/billing/family.ts` | 625 636 648 652 | Family status helper returns non-family tiers that the route schema rejects |
| DS-098 | WI-187 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/billing/metering.ts` | 215 216 226 232 236 291 | Top-up fallback can falsely deny quota under concurrent contention |
| DS-099 | WI-188 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/services/billing/revenuecat.ts` | 51 66 68 83 91 148 151 | RevenueCat event ordering is checked outside the write |
| DS-100 | WI-189 | WI-78 | HIGH_BUG | P1 | other-atomicity-bug | `apps/api/src/services/billing/revenuecat.ts` | 212 243 279 286 | RevenueCat activation can leave subscription and quota state out of sync |
| DS-101 | WI-190 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/services/billing/subscription-core.ts` | 114 121 128 177 180 | Stripe webhook ordering check is not atomic with the update |
| DS-102 | WI-191 | WI-78 | HIGH_BUG | P1 | other-atomicity-bug | `apps/api/src/services/billing/subscription-core.ts` | 68 88 380 393 | Subscription and quota pool mutations are not atomic |
| DS-103 | WI-192 | WI-78 | HIGH_BUG | P1 | other-atomicity-bug | `apps/api/src/services/billing/trial.ts` | 181 186 196 205 | Trial soft-landing transition can become permanently partial |
| DS-104 | WI-193 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/book-generation.ts` | 68 84 107 138 | Book generation LLM calls are reachable from unmetered routes |
| DS-105 | WI-194 | WI-77 | MEDIUM | P2 | other-resource-exhaustion | `apps/api/src/services/book-suggestion-generation.ts` | 70 72 98 156 164 | External LLM call is made while a database transaction and advisory lock are held |
| DS-106 | WI-195 | WI-81 | BUG | P2 | other-logic-bug | `apps/api/src/services/bookmarks.ts` | 56 92 157 | Topic-scoped bookmarks are not populated on the production creation path |
| DS-107 | WI-196 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/coaching-cards.ts` | 215 216 220 221 233 240 | Review-due card enriches topic and book metadata without verifying topic ownership |
| DS-108 | WI-197 | WI-78 | HIGH_BUG | P1 | other-non-atomic-consent-delete | `apps/api/src/services/consent.ts` | 443 454 463 466 | Consent denial can become terminal before profile deletion succeeds |
| DS-109 | WI-198 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/curriculum.ts` | 665 973 1117 1176 1229 1284 1333 1557 | Curriculum writes bypass parent proxy-mode protection |
| DS-110 | WI-199 | WI-80 | HIGH | P1 | cross-tenant-id | `apps/api/src/services/curriculum.ts` | 1293 1298 1311 1323 | moveTopicToBook can move another profile's topic |
| DS-111 | WI-200 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/curriculum.ts` | 1504 1508 1533 1543 | Topic explanation can load another profile's topic title |
| DS-112 | WI-201 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/curriculum.ts` | 86 131 1433 1549 | Curriculum LLM calls are outside quota metering |
| DS-113 | WI-202 | WI-78 | HIGH_BUG | P1 | other-state-corruption | `apps/api/src/services/curriculum.ts` | 678 680 | Book topic generation can get permanently stuck after LLM failure |
| DS-114 | WI-203 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/services/deletion.ts` | 162 171 | Deletion cancellation/restoration checks are not atomic with final deletes |
| DS-115 | WI-204 | WI-84 | HIGH_BUG | P1 | other-data-loss | `apps/api/src/services/dictation/result.ts` | 33 45 59 | Same-day dictations in the same mode overwrite each other |
| DS-116 | WI-205 | WI-81 | BUG | P2 | other-logic-bug | `apps/api/src/services/dictation/result.ts` | 87 92 | Streak query limits before ordering |
| DS-117 | WI-206 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/dictation/review.ts` | 174 175 180 183 199 | Unbounded review sentences can drive oversized vision LLM calls |
| DS-118 | WI-207 | WI-88 | BUG | P2 | other-internal-state-disclosure | `apps/api/src/services/embeddings.ts` | 141 149 173 178 | Legacy raw AI envelopes can be stored in session embeddings |
| DS-119 | WI-208 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/evaluate-data.ts` | 49 54 59 | Evaluate eligibility leaks foreign topic titles |
| DS-120 | WI-209 | WI-79 | BUG | P2 | other-fragile-llm-parsing | `apps/api/src/services/evaluate.ts` | 139 143 147 | Regex-based LLM assessment parsing bypasses structured envelope pattern |
| DS-121 | WI-210 | WI-79 | MEDIUM | P2 | other-llm-state-integrity | `apps/api/src/services/exchange-prompts.ts` | 823 827 830 849 853 857 860 875 | Verification state is driven by free-text JSON instead of the envelope |
| DS-122 | WI-211 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/exchange-prompts.ts` | 660 661 665 666 669 672 685 687 709 710 718 719 | Preformatted learner context blocks are appended to the system prompt without enforced escaping |
| DS-123 | WI-212 | WI-79 | MEDIUM | P2 | other-prompt-injection-bypass | `apps/api/src/services/exchanges.ts` | 41 42 43 44 | sanitizeUserContent server_note tag stripping can be bypassed via fragment reconstruction |
| DS-124 | WI-213 | WI-88 | BUG | P2 | other-internal-state-disclosure | `apps/api/src/services/export.ts` | 189 191 292 309 | Data export sanitizes session events but exports raw embedding content |
| DS-125 | WI-214 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/home-surface-cache.ts` | 224 225 237 244 245 | Pending celebration writes can still lose concurrent updates |
| DS-126 | WI-215 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/homework-summary.ts` | 112 119 203 204 205 210 211 | Raw homework metadata can manipulate parent-facing summaries |
| DS-127 | WI-216 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/homework-summary.ts` | 176 197 209 210 211 217 222 | Homework summary LLM call can run without quota |
| DS-128 | WI-217 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/homework-summary.ts` | 224 225 237 240 245 | Whole-metadata read/modify/write can lose concurrent updates |
| DS-129 | WI-218 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/interleaved.ts` | 72 77 82 118 126 177 188 | Interleaved sessions dereference topic and subject IDs without ownership proof |
| DS-130 | WI-219 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/language-detect.ts` | 54 | Language detection LLM call can be reached through unmetered subject creation |
| DS-131 | WI-220 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/learner-input.ts` | 117 118 | Tell-mentor parsing performs unmetered LLM calls |
| DS-132 | WI-221 | WI-82 | HIGH_BUG | P1 | other-consent-withdrawal-processing | `apps/api/src/services/learner-profile.ts` | 1250 1276 1295 | Memory analysis can continue after regulatory consent withdrawal |
| DS-133 | WI-222 | WI-81 | BUG | P2 | other-logic-bug | `apps/api/src/services/llm/extract-json.ts` | 19 20 | Code-fence stripping matches fences inside valid JSON replies |
| DS-134 | WI-223 | WI-83 | MEDIUM | P2 | secrets-exposure | `apps/api/src/services/llm/providers/gemini.ts` | 202 237 | Gemini API key leaked in URL query parameter captured by Sentry breadcrumbs |
| DS-135 | WI-224 | WI-79 | HIGH | P1 | other-safety-filter-bypass | `apps/api/src/services/llm/router.ts` | 397 408 461 473 555 566 719 727 | Provider safety blocks are retried and failed over as transient outages |
| DS-136 | WI-225 | WI-86 | MEDIUM | P2 | other-audit-bypass | `apps/api/src/services/llm/stream-envelope.ts` | 17 227 242 299 318 | Streaming extractor can show a different reply than the one parsed and persisted |
| DS-137 | WI-226 | WI-82 | MEDIUM | P2 | other-privacy-control-bypass | `apps/api/src/services/notifications.ts` | 75 76 86 94 471 622 | Push opt-out is not enforced before sending sensitive notifications |
| DS-138 | WI-227 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/onboarding/index.ts` | 99 125 | Stored onboarding interest labels can become unsanitized LLM prompt text |
| DS-139 | WI-228 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/prior-learning.ts` | 128 134 293 | Stored learner context is interpolated into LLM prompts without delimiter escaping |
| DS-140 | WI-229 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/progress.ts` | 211 215 304 | Topic progress endpoint leaks foreign topic metadata |
| DS-141 | WI-230 | WI-89 | MEDIUM | P2 | other-score-inflation | `apps/api/src/services/quiz/complete-round.ts` | 153 207 211 316 317 318 538 559 | Duplicate questionIndex in results allows XP and score inflation |
| DS-142 | WI-231 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/quiz/guess-who-provider.ts` | 116 136 151 153 170 179 296 300 | Missing prompt injection sanitization — sweep gap from [PROMPT-INJECT-7] |
| DS-143 | WI-232 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/quiz/vocabulary-provider.ts` | 233 255 263 271 274 289 296 304 | Missing prompt injection sanitization — sweep gap from [PROMPT-INJECT-7] |
| DS-144 | WI-233 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/api/src/services/retention-data.ts` | 179 184 192 622 627 634 661 766 779 | Recall test can create retention cards for another profile's topic |
| DS-145 | WI-234 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/retention-data.ts` | 155 661 669 678 | Recall-quality LLM evaluation is unmetered and races before cooldown persistence |
| DS-146 | WI-235 | WI-78 | BUG | P2 | other-session-state-corruption | `apps/api/src/services/session/persist-user-message-only.ts` | 29 31 32 42 48 49 | Orphan user-message persistence can append to terminal sessions |
| DS-147 | WI-236 | WI-79 | MEDIUM | P2 | other-llm-prompt-injection | `apps/api/src/services/session/session-context-builders.ts` | 192 194 210 212 228 261 | Learner-controlled library context is interpolated into the LLM system prompt without data fencing |
| DS-148 | WI-237 | WI-79 | HIGH | P1 | other-llm-system-prompt-injection | `apps/api/src/services/session/session-crud.ts` | 1344 1351 1356 1358 1359 | Authenticated clients can persist arbitrary system-role prompt text |
| DS-149 | WI-238 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/session/session-crud.ts` | 935 1351 1371 1392 1426 | Session write helpers rely only on profile ownership and miss proxy-mode authorization |
| DS-150 | WI-239 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/services/session/session-events.ts` | 100 114 128 142 148 161 171 | Shared session event/input-mode write helpers have no owner/proxy guard |
| DS-151 | WI-240 | WI-79 | HIGH | P1 | other-llm-system-prompt-injection | `apps/api/src/services/session/session-exchange.ts` | 607 611 614 617 618 642 | Persisted system_prompt events are replayed as trusted system messages |
| DS-152 | WI-241 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/session/session-exchange.ts` | 1830 1832 1896 1992 1994 2140 | Message processing can be invoked in parent proxy mode |
| DS-153 | WI-242 | WI-78 | HIGH_BUG | P1 | other-session-state-corruption | `apps/api/src/services/session/session-exchange.ts` | 543 548 1619 1621 1622 1623 | Completed or auto-closed sessions can still accept new exchanges |
| DS-154 | WI-243 | WI-78 | HIGH_BUG | P1 | other-non-atomic-persistence | `apps/api/src/services/session/session-exchange.ts` | 1551 1562 1568 1569 1570 1611 1626 1659 1700 | Exchange counter update and event insertion are not atomic |
| DS-155 | WI-244 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/session/session-homework.ts` | 53 60 158 174 | Homework state writes are reachable in parent proxy mode |
| DS-156 | WI-245 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/session/session-homework.ts` | 70 72 80 158 174 | Concurrent homework syncs can duplicate lifecycle events |
| DS-157 | WI-246 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/session/session-summary.ts` | 82 125 150 185 211 228 229 234 | Summary skip/submit writes are reachable in parent proxy mode |
| DS-158 | WI-247 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/session/session-summary.ts` | 173 174 181 185 | Summary submission calls the LLM outside quota/idempotency controls |
| DS-159 | WI-248 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/api/src/services/session/session-summary.ts` | 181 211 214 | Concurrent first summary submissions can create duplicate summary rows |
| DS-160 | WI-249 | WI-79 | MEDIUM | P2 | other-prompt-injection | `apps/api/src/services/session-highlights.ts` | 223 | Learner transcript can escape the recap prompt boundary and manipulate parent-facing output |
| DS-161 | WI-250 | WI-76 | HIGH | P1 | acl-check | `apps/api/src/services/settings.ts` | 72 111 189 246 544 | Settings writes bypass parent proxy-mode protection |
| DS-162 | WI-251 | WI-76 | MEDIUM | P2 | acl-check | `apps/api/src/services/snapshot-aggregation.ts` | 973 999 1164 1167 1221 | Parent proxy sessions can mutate child progress state |
| DS-163 | WI-252 | WI-86 | BUG | P2 | other-stale-cache | `apps/api/src/services/snapshot-aggregation.ts` | 535 694 704 | Cached snapshots with archived subjects can break inventory reads |
| DS-164 | WI-253 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/streaks.ts` | 266 272 292 294 303 | Streak updates are non-atomic and can lose activity under concurrent events |
| DS-165 | WI-254 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/subject-resolve.ts` | 91 | Subject resolution LLM call is exposed through an unmetered route |
| DS-166 | WI-255 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/subject.ts` | 218 386 387 | Subject creation can burn LLM capacity outside quota metering |
| DS-167 | WI-256 | WI-81 | BUG | P2 | other-silent-fallback | `apps/api/src/services/subject.ts` | 381 399 411 419 428 | Unexpected curriculum generation failures are reported as successful subject creation |
| DS-168 | WI-257 | WI-78 | BUG | P2 | other-race-condition | `apps/api/src/services/subject.ts` | 327 328 333 336 | Focused book sort order allocation races under concurrent creates |
| DS-169 | WI-258 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/api/src/services/suggestions.ts` | 205 207 209 210 211 212 | Book suggestion top-up is triggered from an unmetered read path |
| DS-170 | WI-259 | WI-79 | BUG | P2 | other-llm-output-validation | `apps/api/src/services/summaries.ts` | 143 145 150 152 | Malformed LLM boolean strings can mark summaries as accepted |
| DS-171 | WI-260 | WI-87 | MEDIUM | P2 | path-traversal | `apps/mobile/metro.config.js` | 7 | Sentry Metro middleware exposes local file snippets from attacker-supplied paths |
| DS-172 | WI-261 | WI-81 | HIGH_BUG | P1 | other-logic-bug | `apps/mobile/src/app/(app)/_layout.tsx` | 862 870 | Consent resend reuses the masked parent email and can corrupt the consent request |
| DS-173 | WI-262 | WI-77 | MEDIUM | P2 | rate-limit-bypass | `apps/mobile/src/app/(app)/_layout.tsx` | 887 900 908 | Consent email sending can bypass resend limits by changing recipient |
| DS-174 | WI-263 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/child/[profileId]/index.tsx` | 441 | Child learning profile is fetched even when child consent should hide learning data |
| DS-175 | WI-264 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` | 64 235 239 546 606 | Mentor memory screen can read, export, and mutate child memory after consent withdrawal |
| DS-176 | WI-265 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` | 143 148 606 608 | Tell Mentor triggers an unmetered LLM call |
| DS-177 | WI-266 | WI-78 | BUG | P2 | other-race-condition | `apps/mobile/src/app/(app)/dictation/complete.tsx` | 39 123 194 203 207 291 | Timed-out review requests can still navigate with stale results |
| DS-178 | WI-267 | WI-78 | BUG | P2 | other-race-condition | `apps/mobile/src/app/(app)/dictation/index.tsx` | 34 37 51 55 59 61 151 | Retrying generation can reopen a canceled stale request |
| DS-179 | WI-268 | WI-85 | BUG | P2 | other-duplicate-submit | `apps/mobile/src/app/(app)/dictation/review.tsx` | 50 55 149 150 | Review completion can be recorded multiple times on rapid taps |
| DS-180 | WI-269 | WI-87 | BUG | P2 | other-parameter-pollution-runtime-crash | `apps/mobile/src/app/(app)/dictation/text-preview.tsx` | 18 19 127 140 | Duplicate ocrText route params can crash the text preview screen |
| DS-181 | WI-270 | WI-76 | MEDIUM | P2 | acl-check | `apps/mobile/src/app/(app)/home.tsx` | 22 26 32 33 35 | Parent proxy sessions can mark child celebrations as seen |
| DS-182 | WI-271 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/homework/camera.tsx` | 252 591 | Homework subject creation reaches a write endpoint without the server proxy-mode guard |
| DS-183 | WI-272 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/(app)/homework/camera.tsx` | 223 252 380 591 | Homework camera flow invokes unmetered LLM-backed OCR and subject classification |
| DS-184 | WI-273 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/library.tsx` | 392 557 630 790 792 878 892 941 | Parent proxy sessions can mutate child subjects from Library |
| DS-185 | WI-274 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/mentor-memory.tsx` | 139 159 176 197 233 | Parent proxy can bypass client-only memory write guard and impersonate learner memory updates |
| DS-186 | WI-275 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/(app)/mentor-memory.tsx` | 155 159 | Tell Mentor invokes an unmetered LLM endpoint |
| DS-187 | WI-276 | WI-78 | BUG | P2 | other-settings-state-corruption | `apps/mobile/src/app/(app)/more/notifications.tsx` | 16 24 48 72 96 130 137 145 153 | Notification toggles can overwrite preferences after a failed settings load |
| DS-188 | WI-277 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` | 96 150 151 152 153 | Language setup write bypasses parent-proxy read-only guard |
| DS-189 | WI-278 | WI-82 | MEDIUM | P2 | other-age-gate-bypass | `apps/mobile/src/app/(app)/onboarding/pronouns.tsx` | 61 65 128 131 156 158 | Pronouns age gate is enforced only in the client |
| DS-190 | WI-279 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx` | 102 105 610 | Parent proxy mode can archive a child subject |
| DS-191 | WI-280 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/mobile/src/app/(app)/quiz/[roundId].tsx` | 50 | Round-detail cache is not scoped by active profile |
| DS-192 | WI-281 | WI-81 | BUG | P2 | other-logic-bug | `apps/mobile/src/app/(app)/quiz/[roundId].tsx` | 108 109 136 | Active round IDs crash the history detail screen |
| DS-193 | WI-282 | WI-89 | MEDIUM | P2 | other-score-tampering | `apps/mobile/src/app/(app)/quiz/play.tsx` | 203 216 579 583 | Duplicate question results can inflate quiz score and XP |
| DS-194 | WI-283 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/(app)/session/_layout.tsx` | 9 | Proxy-mode session write protection relies on a client-side redirect for non-metered writes |
| DS-195 | WI-284 | WI-87 | MEDIUM | P2 | path-traversal | `apps/mobile/src/app/(app)/session/index.tsx` | 130 153 154 435 436 437 800 805 807 | Deep-link-controlled imageUri can be read and uploaded as homework image data |
| DS-196 | WI-285 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/(app)/session/index.tsx` | 45 46 747 771 772 | Session subject-resolution flow reaches LLM endpoints that are outside quota metering |
| DS-197 | WI-286 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/mobile/src/app/(app)/subscription.tsx` | 951 1000 1002 1766 1767 1797 | Top-up purchase can be submitted more than once before the UI lock applies |
| DS-198 | WI-287 | WI-81 | BUG | P2 | other-logic-bug | `apps/mobile/src/app/(app)/subscription.tsx` | 604 606 607 1173 1181 1182 | Child paywall is unreachable behind ParentOnly |
| DS-199 | WI-288 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/mobile/src/app/(app)/topic/[topicId].tsx` | 157 162 181 | Client-supplied subjectId can bypass topic ownership resolution |
| DS-200 | WI-289 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/(app)/topic/recall-test.tsx` | 71 72 | Recall-test LLM calls are not covered by quota metering |
| DS-201 | WI-290 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/mobile/src/app/(app)/topic/recall-test.tsx` | 40 72 153 | Recall test accepts topicId without ownership verification |
| DS-202 | WI-291 | WI-78 | BUG | P2 | other-state-corruption | `apps/mobile/src/app/(app)/topic/recall-test.tsx` | 139 152 160 177 | Repeated dont_remember taps can overcount recall failures |
| DS-203 | WI-292 | WI-81 | BUG | P2 | other-logic-bug | `apps/mobile/src/app/(app)/topic/relearn.tsx` | 281 283 297 461 463 | Cancel does not cancel the in-flight relearn start |
| DS-204 | WI-293 | WI-86 | BUG | P2 | other-navigation-state-loss | `apps/mobile/src/app/(auth)/sign-in.tsx` | 222 224 591 | Pending auth redirect can be overwritten with home after a remount |
| DS-205 | WI-294 | WI-88 | MEDIUM | P2 | other-info-disclosure | `apps/mobile/src/app/_layout.tsx` | 81 87 88 | Raw React Query keys are sent to Sentry |
| DS-206 | WI-295 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/consent.tsx` | 46 148 153 155 172 178 180 | Consent request can target arbitrary same-account profiles |
| DS-207 | WI-296 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/create-profile.tsx` | 75 86 88 166 224 | Direct profile creation can bypass profile and consent gates |
| DS-208 | WI-297 | WI-82 | MEDIUM | P2 | other-age-gate-bypass | `apps/mobile/src/app/create-profile.tsx` | 157 163 | Minimum-age enforcement uses birth year instead of full birth date |
| DS-209 | WI-298 | WI-85 | BUG | P2 | other-duplicate-submission | `apps/mobile/src/app/create-profile.tsx` | 97 103 104 166 | Profile creation timeout can leave an in-flight create request active |
| DS-210 | WI-299 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/app/create-subject.tsx` | 227 328 335 | Subject creation flow can burn LLM calls outside quota enforcement |
| DS-211 | WI-300 | WI-86 | BUG | P2 | other-stale-async-result | `apps/mobile/src/app/create-subject.tsx` | 182 187 188 328 335 346 | Resolve timeout does not cancel late subject results |
| DS-212 | WI-301 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/app/profiles.tsx` | 48 145 179 180 186 305 | Non-owner profiles can switch into owner context |
| DS-213 | WI-302 | WI-88 | MEDIUM | P2 | other-info-disclosure | `apps/mobile/src/components/session/ChatShell.tsx` | 222 397 406 | Voice output bypasses hidden-message and envelope projection defenses |
| DS-214 | WI-303 | WI-76 | HIGH_BUG | P1 | other-stale-instance-action | `apps/mobile/src/components/session/ChatShell.tsx` | 199 512 515 765 811 823 827 919 | Dormant web ChatShell still exposes voice controls bound to stale session handlers |
| DS-215 | WI-304 | WI-79 | MEDIUM | P2 | other-markdown-link-injection | `apps/mobile/src/components/session/sessionModeConfig.ts` | 152 153 155 168 169 171 172 175 177 181 184 186 189 191 194 196 | Unescaped route and user text is rendered as trusted assistant Markdown |
| DS-216 | WI-305 | WI-78 | HIGH_BUG | P1 | other-race-condition | `apps/mobile/src/components/session/use-session-actions.ts` | 633 640 642 651 | Topic switch can double-close a session and duplicate completion side effects |
| DS-217 | WI-306 | WI-86 | BUG | P2 | other-stale-state | `apps/mobile/src/components/session/use-session-streaming.ts` | 409 423 425 | Silence prompt timer checks stale draft text |
| DS-218 | WI-307 | WI-76 | HIGH | P1 | acl-check | `apps/mobile/src/components/session/use-subject-classification.ts` | 188 189 190 247 248 249 322 323 324 | Subject creation flow can write to child profiles in proxy mode |
| DS-219 | WI-308 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/components/session/use-subject-classification.ts` | 188 247 292 322 453 525 587 657 | LLM-backed subject classification and creation are reachable outside quota metering |
| DS-220 | WI-309 | WI-77 | MEDIUM | P2 | rate-limit-bypass | `apps/mobile/src/hooks/use-consent.ts` | 30 | Consent request email sending can be abused by rotating recipient addresses |
| DS-221 | WI-310 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/hooks/use-homework-ocr.ts` | 214 | OCR upload path reaches paid LLM OCR without metering |
| DS-222 | WI-311 | WI-80 | MEDIUM | P2 | cross-tenant-id | `apps/mobile/src/hooks/use-push-token-registration.ts` | 69 129 142 | Push token registration can write to the wrong active profile |
| DS-223 | WI-312 | WI-79 | HIGH | P1 | other-llm-prompt-privilege-escalation | `apps/mobile/src/hooks/use-sessions.ts` | 589 591 | Client can persist arbitrary system-role LLM instructions |
| DS-224 | WI-313 | WI-78 | HIGH_BUG | P1 | other-state-integrity | `apps/mobile/src/hooks/use-sessions.ts` | 286 427 443 | Closed sessions can still be mutated through message APIs |
| DS-225 | WI-314 | WI-77 | MEDIUM | P2 | expensive-api-abuse | `apps/mobile/src/hooks/use-subjects.ts` | 123 129 | Subject creation can trigger unmetered LLM work |
| DS-226 | WI-315 | WI-87 | MEDIUM | P2 | insecure-crypto | `apps/mobile/src/lib/analytics.ts` | 49 50 51 | Profile ID hashing uses non-cryptographic algorithm with public key, defeating intended anonymization |
| DS-227 | WI-316 | WI-82 | BUG | P2 | other-coppa-age-boundary | `apps/mobile/src/lib/sentry.ts` | 172 148 | COPPA age threshold inconsistent with documented rounding-up compensation |
| DS-228 | WI-317 | WI-84 | HIGH_BUG | P1 | other-worker-db-pool-lifecycle | `packages/database/src/client.ts` | 76 80 81 91 97 | Neon WebSocket pool caching is unsafe for Worker-backed background invocations |
| DS-229 | WI-318 | WI-87 | HIGH_BUG | P1 | other-nonfinite-numeric-corruption | `packages/database/src/schema/_numeric-as-number.ts` | 79 80 | numericAsNumber writes non-finite numbers without validation |
| DS-230 | WI-319 | WI-80 | MEDIUM | P2 | cross-tenant-id | `packages/database/src/schema/assessments.ts` | 100 103 125 | Recall test can create retention state for an unowned topic |
| DS-231 | WI-320 | WI-78 | HIGH_BUG | P1 | other-race-condition | `packages/database/src/schema/billing.ts` | 53 54 | RevenueCat event ordering is enforced with a non-atomic check-then-write |
| DS-232 | WI-321 | WI-81 | BUG | P2 | other-logic-bug | `packages/database/src/schema/progress.ts` | 174 | DB default for learning mode conflicts with service default |
| DS-233 | WI-322 | WI-80 | HIGH | P1 | cross-tenant-id | `packages/database/src/schema/subjects.ts` | 162 164 171 173 | Curriculum topic book ownership is not constrained, enabling cross-profile topic moves |
| DS-234 | WI-323 | WI-76 | BUG | P2 | other-guard-bypass | `scripts/check-gc1-pattern-a.ts` | 35 89 103 105 | GC1 mock guard misses multiline jest.mock calls |
| DS-235 | WI-324 | WI-87 | MEDIUM | P2 | other-csv-injection | `scripts/generate-internal-mock-cleanup-inventory.ts` | 109 583 602 | CSV output can contain spreadsheet formulas from mock targets |
| DS-236 | WI-325 | WI-81 | BUG | P2 | other-logic-bug | `scripts/translate-gemini.ts` | 56 63 66 302 306 307 | Diff mode ignores changed source strings for existing i18n keys |
