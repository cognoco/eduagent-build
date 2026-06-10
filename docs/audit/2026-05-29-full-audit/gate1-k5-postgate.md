## K.5 (POST-GATE) — reconciliation sizing after Gate 1

> Generated 2026-06-09 by `identity-foundation-gate1-finalize.mjs`. Supersedes the pre-gate K.5 upper-bound. This is the **cost/value input to K.6** — per IF-obligation-bearing workstream: contradictions resolved, IF-slice effort (the IN work only, after clear-out rows are routed away), canon dependency, and readiness. The pre-gate qualitative axes (effort/canon/readiness) are carried from `r.pre_gate_sizing`; the contradiction-resolution and obligation/blocking counts are recomputed from the Gate-1 dispositions.

| Workstream | IF obligations | Blocking | Contradictions (pre→post) | IF-slice effort | Canon dependency | Readiness | Note |
|---|---|---|---|---|---|---|---|
| security-pii-api | 23 | 7 | 1 → 0 (resolved at Gate 1) | L | blocking | has-partial-canon | Heaviest IF surface: IDOR/proxy/deletion-atomicity + age-gate. 1 contradiction (F-130/F-145 age-gate direction) resolved — both ruled IN. |
| security-pii-inngest | 14 | 3 | 2 → 0 (resolved at Gate 1) | M | blocking | has-partial-canon | 2 contradictions (F-028/F-019 mitigation-vs-defect; F-093/F-122 deletion-guard) resolved — F-019 ruled live defect, F-093/F-122 both IN. IN work = step-state minor-PII + freeform-filing GDPR guard. |
| architecture | 7 | 0 | 0 | M | partial | has-partial-canon | Structural: session-exchange.ts decomposition + consent/settings/family SCC + Inngest-registration. Per-item heavy though only 7 obligations. |
| billing-subscriptions | 2 | 1 | 0 | S | partial | has-partial-canon | Trial-expiry downgrade (blocking) + stranded top-up credits; ADR-0002 store-delegation is the canon hook. |
| errors-api | 1 | 0 | 0 | XS | none | has-partial-canon | Single envelope hard-fail obligation; all-PASS rule-verification source. |
| l10n-a11y-mobile | 1 | 0 | 0 | XS | none | from-scratch | One obligation (child sees parent accommodation); the other 34 rows route out as i18n/a11y mechanism. |
| billing-and-quotas | 1 | 0 | 0 | XS | partial | has-partial-canon | Untested billing/quota/idempotency — payer-model coherence. |
| **Total (IF obligations)** | **49** | **11** | **3 → 0** | — | — | — | All 3 pre-gate contradictions dissolved by Gate-1 rulings |

### Routing & defer counts (secondary — the clear-out / defer breakdown)

| Disposition | Count | Owner spread |
|---|---|---|
| in-IF model obligations | 49 | 7 workstreams (table above) |
| in-other-workstream (clear-out) | 125 | 21 named owners |
| deferred | 9 | 7 unassigned (M bucket 4) + 2 owned |
| execution-blocking (N.0) | 11 | patch-now list in gate1-closure.md |
