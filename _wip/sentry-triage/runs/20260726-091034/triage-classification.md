# Sentry Triage Classification — WI-2756

Triage of the 59 unresolved mentomate-api Sentry issues (2026-07-26 export), per WI-2756 AC.
Method: 7 parallel code-investigation subagents + Sentry API event drilldowns (env tags, exception
cause chains, per-event org-id sampling). Fix WIs created: WI-2757..WI-2767, each linked to the
Sentry issue IDs or short IDs it covers.

## Headline findings

1. **Every sampled staging event is tagged `environment: production`** (url=api-stg.mentomate.com,
   tag says production) — the feed's "All Envs" view is meaningless until fixed (WI-2758).
2. **~95% of event volume is staging/E2E traffic**; the E2E seed/reset infra is itself the largest
   error generator (non-transactional identity-graph writes → admin-less orgs → 11,340 events).
3. Six genuine product defects surfaced (PII scrub gap, transient-retry unwrap gap, Resend retry
   semantics, person-delete TOCTOU + last-admin gap, topicTitle payload regression, Resend webhook
   schema); two config gaps (staging worker secrets, Voyage billing); rest is telemetry noise or
   already-fixed.

## Cluster classification

| Cluster (issues) | Events | Classification | Root cause | Fix WI |
|---|---:|---|---|---|
| Subscription bootstrap (13, 15, 1G, 17) | 11,376 | Test-infra bug (real generator, not one broken org) | test-seed.ts seed + deleteOrganizationGraph are non-transactional; partial failures strand admin-less orgs; accountMiddleware repair then throws 2×/request with no backoff. Sentry merges many org UUIDs under one title. | WI-2757 |
| Clerk identity/seed (7, 11, 1K, 10, 1B, 12, 1T, X) | 423 | Test-infra bugs + one over-reported handled path | Seed GET-then-POST Clerk race; login_email_unique non-idempotent insert; reset batch FK-violation mid-graph; Clerk-404 lookup (39 users) is prod-reachable but gracefully handled (503) — reporting noise only. | WI-2757 (seed/reset), WI-2765 (noise) |
| Resend/email (1C, 1N, 21, N) | 376 | Config/product bug (staging) + prod schema bug | No staging send-guard; 422 retried by Inngest though permanent; webhook `data.to` schema mismatch on PROD acks-but-skips events (bounce suppression at risk). | WI-2761, WI-2767 |
| DB FK-violation family (Z, 8, 14, 18, 19, 16, Y, 1H) | ~100 | Test-triggered today; **latent prod defect** | TOCTOU: person hard-deleted (E2E reset now; deletion-v2/consent-v2 in prod) after middleware validation but before write; FK profile_id→person.id fires; no Clerk session revocation on person delete; deletePersonV2 lacks last-admin guard. | WI-2762 |
| Failed-query select family (9, 1Z, 1S…) | ~25 | Infra (Neon transient) + code gap | DrizzleQueryError wrapper hides cause from isTransientDatabaseError (never unwraps .cause) → no retry, raw 500. Also: params line leaks Clerk IDs through the Sentry scrubber (unquoted → unredacted). | WI-2760 (unwrap), WI-2759 (PII) |
| Inngest env binding (G, A) | 110 | Config gap (staging) | MEMORY_FACTS_DEDUP_ENABLED / RETENTION_PURGE_ENABLED unbound on staging worker; sync-secrets skips empty values silently; no staging gate. Retention purge cron no-ops — verify prod (DPIA 30-day retention). Warning captured at error level. | WI-2763 |
| session-completed pipeline (J, T, 1A, K, M) | 64 | Expected, handled telemetry | Deliberate SWEEP-SILENT-RECOVERY captures; filing timeout self-heals via DB re-read; LLM low-confidence falls back to template. Watch rates, not events. Level downgrades folded into noise diet. | WI-2765 |
| Embeddings/Voyage (H, F) | 25 | External config (billing) | Voyage account has NO payment method → 3 RPM reduced limits (unredacted 429 body). No client backoff; per-attempt Sentry captures. | WI-2764 |
| LLM validation/fallback (20, S, E, D, P, R, 1Y) | ~12 | Telemetry + one already-fixed defect | Fallback signals + circuit breaker = designed launch-health telemetry. Quiz ZodError (R) fixed by WI-2190 (landed 2026-07-20, after R's last event) — resolve in Sentry after confirming no post-07-20 events. P/D are the summary-evaluation self-consistency check, handled with user-facing fallback. | — (WI-2765 for levels) |
| Local-dev tail (Q, 1R, 16-partial, R) | ~10 | Local-dev noise | 10.0.2.2 / 127.0.0.1 requests: Android emulator + wrangler dev; safe-send 2s timeout is by-design non-blocking. | — |
| PII-scrub guard (C) | 1 | Real minor defect | `topicTitle` is denylisted but sent on `app/filing.completed`; outgoing-event scrubbing replaces it with `[pii-scrubbed]`, corrupting the value consumed by `post-session-suggestions` in its LLM prompt. | WI-2766 |
| Prod Inngest failure (B) | 6 | Needs Sentry drill-down | Generic fleet catch-all; pull tags.functionId + extra.runId from the event to identify the failing function. Stale since 07-15. | — (action; alerting home: WI-1907) |

## Follow-up Work Item evidence

Verified from the live Cosmo records on 2026-07-26. Each follow-up's `Found In` field names the
covered Sentry issue evidence and, where recorded, source locations, while its `Description`
records the initial shared root-cause hypothesis. WI-2766's live acceptance criteria refine and
correct its capture-time description, so the table uses that verified refinement. WI-2756's
`Related Items` relation was also read back with all eleven records below.

| Follow-up | `Found In` evidence | Root cause from the live record |
|---|---|---|
| [WI-2757 — transactional E2E seed/reset](https://app.notion.com/p/3a98bce91f7c8131a0c5ce3a0b9d0876) | `MENTOMATE-API-13/-15/-1G/-17/-12/-1V/-X/-7`; [issue 135269968](https://zwizzly.sentry.io/issues/135269968/); `test-seed.ts:719-763,6757-6878` | Seed/reset identity writes are non-transactional. Mid-graph failures strand admin-less organizations, and account-middleware repair repeatedly reports the resulting failure. |
| [WI-2758 — correct the staging environment tag](https://app.notion.com/p/3a98bce91f7c81db9223d54f3451700b) | [issue 135690189](https://zwizzly.sentry.io/issues/135690189/) (`api-stg`, but `environment=production`) | The worker initializes Sentry with the wrong environment, making staging/E2E events indistinguishable from production incidents. |
| [WI-2759 — scrub Drizzle query parameters](https://app.notion.com/p/3a98bce91f7c819296fed2d426da9b8a) | [issue 133815456](https://zwizzly.sentry.io/issues/133815456/); `sentry.ts:166-176` | The scrubber redacts quoted snippets only, while Drizzle appends unquoted parameters, exposing Clerk identifiers and row UUIDs. |
| [WI-2760 — unwrap transient Drizzle failures](https://app.notion.com/p/3a98bce91f7c81078f37c0d3a60a39b3) | [issue 133815456](https://zwizzly.sentry.io/issues/133815456/); `transient-db-retry.ts:7-28`; `db-errors.ts:20-38` | The transient classifier never walks `DrizzleQueryError.cause`, so Neon connection blips bypass retry/503 handling and become user-facing 500s. |
| [WI-2761 — stop the Resend 422 retry storm](https://app.notion.com/p/3a98bce91f7c8126acd1ee20efb978fc) | `MENTOMATE-API-1C/-1N/-21`; [issue 135359292](https://zwizzly.sentry.io/issues/135359292/); `email.ts:111-195`; `account-security-notification.ts:98-127` | Staging has no send guard, and the Inngest job retries permanently invalid 422 requests, multiplying events while hiding the concrete response reason. |
| [WI-2762 — hard-delete TOCTOU and last-admin guard](https://app.notion.com/p/3a98bce91f7c81f18bb3eabba4eef5ea) | `MENTOMATE-API-Z/-8/-14/-16/-Y`; [issue 135244285](https://zwizzly.sentry.io/issues/135244285/); `deletion-v2.ts:566-594`; `consent-v2.ts:1320` | Hard deletion does not revoke active Clerk sessions, allowing in-flight writes to FK-fail, and it can delete an organization's only admin. |
| [WI-2763 — restore staging worker bindings](https://app.notion.com/p/3a98bce91f7c8146aaf8e92cd2dae72b) | `MENTOMATE-API-G/-A`; [issue 134561823](https://zwizzly.sentry.io/issues/134561823/); `sync-secrets.js:74-75`; `inngest/helpers.ts:165-178` | Empty Doppler values are silently skipped, leaving dedup and retention-purge bindings absent; the missing retention flag makes the purge cron no-op. |
| [WI-2764 — Voyage billing and backoff](https://app.notion.com/p/3a98bce91f7c81e3b283ddc84d00b74d) | `MENTOMATE-API-H/-F`; [issue 134561822](https://zwizzly.sentry.io/issues/134561822/); `embeddings.ts:110-134`; `transcript-purge-cron.ts:265-284` | The Voyage account has no payment method and is limited to 3 RPM; callers have no shared limiting or `Retry-After` backoff and report every attempt. |
| [WI-2765 — handled-telemetry noise diet](https://app.notion.com/p/3a98bce91f7c81cc8f11f39fa28a6613) | `MENTOMATE-API-11/-G/-J/-20`; `inngest/helpers.ts:165-178`; `clerk-user.ts:183-186` | Expected or self-healing conditions use default-error `captureException`, inflating the unresolved feed and consuming quota. |
| [WI-2766 — remove denylisted `topicTitle`](https://app.notion.com/p/3a98bce91f7c81f9b767daebcaae75b8) | [issue 134561264](https://zwizzly.sentry.io/issues/134561264/); `auto-file-session.ts:213-222`; `pii-scrub.ts:31-38`; `post-session-suggestions.ts:87,166` | `topicTitle` is denylisted but dispatched to a real consumer. Outgoing-event scrubbing substitutes `[pii-scrubbed]` before egress, so the post-session-suggestions LLM prompt receives a corrupted title; the follow-up must resolve the title from its ID or explicitly re-rule the denylist. |
| [WI-2767 — accept the production Resend webhook shape](https://app.notion.com/p/3a98bce91f7c8174a46bdafbaf8cbc73) | [issue 134618134](https://zwizzly.sentry.io/issues/134618134/); `resend-types.ts:25-33` | The schema likely expects `data.to` as a string while Resend sends an array, so production webhooks are acknowledged but skipped and suppression updates may be lost. |

## Sentry hygiene recommendations (do NOT bulk-resolve yet, per AC)

- Safe to resolve now: MENTOMATE-API-R (fixed by WI-2190; confirm zero events since 2026-07-20).
- Resolve after WI-2757 lands + one clean E2E cycle: 13, 15, 1G, 17, 12, 1V, X, 7, 1K, 10, 1B, 1T.
- Resolve after config fixes verified: G, A (WI-2763); H, F (WI-2764); 1C, 1N, 21 (WI-2761).
- Keep open as product-defect trackers until fix WIs land: 9/1Z (WI-2760), N (WI-2767), C (WI-2766),
  FK family (WI-2762).
- Everything classified "expected telemetry": leave unresolved until WI-2765 re-levels them, then
  they stop appearing in the error feed organically.

## Existing WIs linked instead of duplicated

WI-1920 (staging Sentry storm/quota), WI-1907 (Inngest failure alerting), WI-2527 (captureException
backlog), WI-2390 (deletion hardening), WI-1889 (test-seed split), WI-1772 (prod webhook secrets).
