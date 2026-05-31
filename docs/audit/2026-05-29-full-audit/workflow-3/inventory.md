# `inngest.send()` Dispatch Inventory

> All 48 real dispatch sites, generated 2026-05-30. `✗` marks a confirmed issue.

| File:Line | Event | Handling | Criticality | Verdict | |
|---|---|---|---|---|:--:|
| `services/billing/revenuecat-webhook-handler.ts:446` | `app/payment.failed` | core-send | non-core | mislabeled-core-send | ✗ |
| `services/subject.ts:161` | `app/subject.curriculum-retry-reques…` | safesend | core | hidden-core-safesend | ✗ |
| `middleware/metering.ts:344` | `app/idempotency.preflight_lookup_fa…` | safesend | non-core | ok |  |
| `routes/account.ts:73` | `app/account.deletion-scheduled` | try-catch | core | ok |  |
| `routes/books.ts:173` | `app/book.topics-generated` | safesend | non-core | ok |  |
| `routes/consent.ts:230` | `app/consent.requested` | safesend | non-core | ok |  |
| `routes/consent.ts:309` | `app/consent.requested` | safesend | non-core | ok |  |
| `routes/consent.ts:453` | `app/consent.revoked` | safesend | non-core | ok |  |
| `routes/feedback.ts:128` | `app/feedback.delivery_failed` | safesend | unclear | ok |  |
| `routes/filing.ts:109` | `app/filing.retry` | core-send | core | ok |  |
| `routes/filing.ts:175` | `app/filing.retry` | safesend | non-core | ok |  |
| `routes/filing.ts:244` | `app/filing.retry` | safesend | non-core | ok |  |
| `routes/filing.ts:278` | `app/filing.completed` | try-catch | core | ok |  |
| `routes/maintenance.ts:70` | `dynamic (eventName parameter)` | try-catch | core | ok |  |
| `routes/quiz.ts:362` | `app/streak.record` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:231` | `app/email.bounced` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:387` | `app/resend-webhook.dedup_db_unavail…` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:411` | `app/resend-webhook.dedup_db_missing` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:444` | `app/resend-webhook.dedup_lookup_fai…` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:500` | `app/resend-webhook.dedup_prewrite_f…` | safesend | non-core | ok |  |
| `routes/resend-webhook.ts:530` | `app/resend-webhook.dedup_kv_missing` | safesend | non-core | ok |  |
| `routes/sessions.ts:352` | `app/filing.retry` | core-send | core | ok |  |
| `routes/sessions.ts:580` | `app/ask.gate_decision` | safesend | non-core | ok |  |
| `routes/sessions.ts:599` | `app/ask.gate_timeout` | safesend | non-core | ok |  |
| `routes/sessions.ts:1523` | `app/session.auto_file_requested` | core-send | core | ok |  |
| `routes/sessions.ts:1569` | `app/session.completed` | try-catch | core | ok |  |
| `services/account.ts:107` | `app/account.trial_missing_repair_at…` | safesend | non-core | ok |  |
| `services/account.ts:201` | `app/account.reclaim_attempt` | safesend | non-core | ok |  |
| `services/account.ts:289` | `app/billing.trial_subscription_fail…` | safesend | non-core | ok |  |
| `services/billing/metering.ts:42` | `app/billing.profile_quota.exhausted` | safesend | non-core | ok |  |
| `services/billing/metering.ts:77` | `app/billing.ownership.mismatch` | safesend | non-core | ok |  |
| `services/billing/quota-provision.ts:131` | `app/billing.profile_quota.lazy_prov…` | safesend | non-core | ok |  |
| `services/billing/revenuecat-webhook-handler.ts:520` | `app/billing.alias_received` | safesend | non-core | ok |  |
| `services/billing/stripe-webhook-handler.ts:518` | `app/payment.failed` | core-send | core | ok |  |
| `services/billing/subscription-core.ts:666` | `app/billing.activate_checkout.diver…` | safesend | non-core | ok |  |
| `services/billing/subscription-core.ts:780` | `app/billing.activate_checkout.diver…` | safesend | non-core | ok |  |
| `services/billing/subscription-core.ts:807` | `app/billing.activate_checkout.diver…` | safesend | non-core | ok |  |
| `services/idempotency-assistant-state.ts:87` | `app/idempotency.assistant_turn_look…` | safesend | non-core | ok |  |
| `services/idempotency-marker.ts:89` | `app/idempotency.mark_failed` | safesend | non-core | ok |  |
| `services/profile.ts:306` | `app/profile.no_owner_resolved` | safesend | non-core | ok |  |
| `services/session/session-exchange.ts:1102` | `app/review.calibration.requested` | safesend | non-core | ok |  |
| `services/session/session-exchange.ts:1196` | `app/topic-probe.requested` | try-catch | core | ok |  |
| `services/session/session-exchange.ts:1808` | `app/ask.classify_silently` | safesend | non-core | ok |  |
| `services/session/session-exchange.ts:2844` | `app/orphan.persist.failed` | safesend | non-core | ok |  |
| `services/session/session-exchange.ts:3115` | `app/orphan.persist.failed` | safesend | non-core | ok |  |
| `services/session/session-exchange.ts:3168` | `app/orphan.persist.failed` | safesend | non-core | ok |  |
| `services/session/session-filing-dispatch.ts:47` | `app/session.auto_file_requested` | safesend | non-core | ok |  |
| `services/subject.ts:135` | `app/subject.curriculum-prewarm-requ…` | safesend | non-core | ok |  |

