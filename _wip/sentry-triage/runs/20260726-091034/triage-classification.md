# Sentry Triage Classification — WI-2756

Triage of the 59 unresolved mentomate-api Sentry issues (2026-07-26 export), per WI-2756 AC.
Method: 7 parallel code-investigation subagents + Sentry API event drilldowns (env tags, exception
cause chains, per-event org-id sampling). Fix WIs created: WI-2757..WI-2767, each linked to the
Sentry short IDs it covers.

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
| Resend/email (1C, 1N, 21, N) | 386 | Config/product bug (staging) + prod schema bug | No staging send-guard; 422 retried by Inngest though permanent; webhook `data.to` schema mismatch on PROD acks-but-skips events (bounce suppression at risk). | WI-2761, WI-2767 |
| DB FK-violation family (Z, 8, 14, 18, 19, 16, Y, 1H) | ~100 | Test-triggered today; **latent prod defect** | TOCTOU: person hard-deleted (E2E reset now; deletion-v2/consent-v2 in prod) after middleware validation but before write; FK profile_id→person.id fires; no Clerk session revocation on person delete; deletePersonV2 lacks last-admin guard. | WI-2762 |
| Failed-query select family (9, 1Z, 1S…) | ~25 | Infra (Neon transient) + code gap | DrizzleQueryError wrapper hides cause from isTransientDatabaseError (never unwraps .cause) → no retry, raw 500. Also: params line leaks Clerk IDs through the Sentry scrubber (unquoted → unredacted). | WI-2760 (unwrap), WI-2759 (PII) |
| Inngest env binding (G, A) | 110 | Config gap (staging) | MEMORY_FACTS_DEDUP_ENABLED / RETENTION_PURGE_ENABLED unbound on staging worker; sync-secrets skips empty values silently; no staging gate. Retention purge cron no-ops — verify prod (DPIA 30-day retention). Warning captured at error level. | WI-2763 |
| session-completed pipeline (J, T, 1A, K, M) | 64 | Expected, handled telemetry | Deliberate SWEEP-SILENT-RECOVERY captures; filing timeout self-heals via DB re-read; LLM low-confidence falls back to template. Watch rates, not events. Level downgrades folded into noise diet. | WI-2765 |
| Embeddings/Voyage (H, F) | 25 | External config (billing) | Voyage account has NO payment method → 3 RPM reduced limits (unredacted 429 body). No client backoff; per-attempt Sentry captures. | WI-2764 |
| LLM validation/fallback (20, S, E, D, P, R, 1Y) | ~12 | Telemetry + one already-fixed defect | Fallback signals + circuit breaker = designed launch-health telemetry. Quiz ZodError (R) fixed by WI-2190 (landed 2026-07-20, after R's last event) — resolve in Sentry after confirming no post-07-20 events. P/D are the summary-evaluation self-consistency check, handled with user-facing fallback. | — (WI-2765 for levels) |
| Local-dev tail (Q, 1R, 16-partial, R) | ~10 | Local-dev noise | 10.0.2.2 / 127.0.0.1 requests: Android emulator + wrangler dev; safe-send 2s timeout is by-design non-blocking. | — |
| PII-scrub guard (C) | 1 | Real minor defect | topicTitle re-introduced into app/filing.completed payload; guard caught it; zero consumers read it. | WI-2766 |
| Prod Inngest failure (B) | 6 | Needs Sentry drilldown | Generic fleet catch-all; pull tags.functionId + extra.runId from the event to identify the failing function. Stale since 07-15. | — (action; alerting home: WI-1907) |

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
