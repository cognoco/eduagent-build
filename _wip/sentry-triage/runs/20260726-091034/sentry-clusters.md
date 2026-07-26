# Sentry Issue Clusters

Source export: `sentry-unresolved-issues.json` / `sentry-unresolved-issues.md`

## Summary

| Cluster | Issues | Events | Users | First debug target |
|---|---:|---:|---:|---|
| Subscription bootstrap | 2 | 11362 | 2 | `MENTOMATE-API-13` |
| Clerk identity cleanup/lookup | 11 | 423 | 57 | `MENTOMATE-API-7`, `MENTOMATE-API-11` |
| Resend/email | 4 | 376 | 4 | `MENTOMATE-API-1C`, `MENTOMATE-API-1N` |
| Database query/write | 20 | 139 | 63 | `MENTOMATE-API-1H`, `MENTOMATE-API-16`, `MENTOMATE-API-9` |
| Inngest env binding | 2 | 110 | 2 | `MENTOMATE-API-G`, `MENTOMATE-API-A` |
| session-completed pipeline | 2 | 58 | 2 | `MENTOMATE-API-J`, `MENTOMATE-API-T` |
| Embeddings/Voyage | 2 | 25 | 2 | `MENTOMATE-API-H` |
| LLM validation | 1 | 4 | 1 | `MENTOMATE-API-1A` |
| Other | 15 | 37 | 15 | inspect after major clusters |

## Code Map

- Subscription bootstrap: `apps/api/src/middleware/account.ts:159`, `apps/api/src/services/billing/billing-v2/subscription-core-v2.ts:512`, `:524`, `:534`, `:549`.
- Resend/email: `apps/api/src/inngest/functions/account-security-notification.ts:37`, `:80`, `:91`, `:114`; shared sender at `apps/api/src/services/notifications/email.ts:99`; webhook validation at `apps/api/src/routes/resend-webhook.ts:655`.
- Inngest env binding: `apps/api/src/inngest/helpers.ts:169`, `:230`, `:326`.
- Clerk identity: `apps/api/src/services/clerk-user.ts:7`; seed/user creation path at `apps/api/src/services/test-seed.ts:342`.
- session-completed pipeline: `apps/api/src/inngest/functions/session-completed.ts:472`, `:1378`; summary validation at `apps/api/src/services/session-llm-summary.ts:385`, `:401`.
- Embeddings/Voyage: `apps/api/src/services/embeddings.ts:81`, `:132`; memory embedding classifier at `apps/api/src/services/memory/embed-fact.ts:49`.

## Initial Read

- `MENTOMATE-API-13` dominates the event count: 11,340 events, one user, latest request `GET https://api-stg.mentomate.com/v1/now`, `HeadlessChrome`, first seen 2026-07-19 and last seen 2026-07-25. The middleware catches the repair failure and continues, so this is likely noisy repair telemetry from a staging automation account whose organization has no owner person or whose identity graph is partially seeded.
- The Resend/email cluster is breadcrumb-rich: all relevant latest events show `POST https://api.resend.com/emails` returning 422. The `account-security-notification` issue is probably a wrapper around the shared Resend 422, not a separate upstream failure.
- The Inngest env binding cluster is centralized and likely config/context related, not many separate code bugs.
- The database cluster needs per-issue stack/request drilldown before fixing because Sentry redacts table/column names in titles.

## Suggested Order

1. Triage `MENTOMATE-API-13` as staging/test-account repair noise versus real product data corruption.
2. Collapse Resend 422 issues into one root-cause investigation around request payload validation and account-security notification payloads.
3. Treat Clerk cleanup/lookup as one identity/test-seed family until proven otherwise.
4. Inspect database query/write issues only after extracting stack/request context per issue.
