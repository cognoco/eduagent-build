DOC: docs/specs/2026-06-26-p0-email-consent-withdrawal-design.md (2026-06-26, updated 2026-07-03, 24K, 442 lines)

CLAIMS:
- Self-registered minor's email-parent (bearer-token, no account/login) needs a self-service consent-withdrawal path — GDPR Art. 7(3) exposure otherwise.
- Introduce bearer-token withdrawal authority (durable, non-expiring) separate from the 7-day approval token, since the approval token dies on `status='approved'`.
- Deliver the durable withdrawal link via a new post-approval confirmation email (not the original request email).
- Withdrawal triggers the same grace-cascade machinery as existing edge-gated `revokeConsentV2` (managed-child deletion cascade, `WITHDRAWN` status parity, `_layout` consent gate).
- Additive/migration-free; rollback = revert PR, no schema change.

TECH VALIDITY: none broken — doc self-reports as shipped with citations, and citations verified live in current source (below). No stale assumptions found.

IMPLEMENTED: complete, per doc's own 2026-07-03 status banner plus independent file check:
- `services/consent-withdrawal-token.ts` — exists (`apps/api/src/services/consent-withdrawal-token.ts`).
- `routes/consent-web.ts` — exists (`apps/api/src/routes/consent-web.ts`).
- `services/identity-v2/consent-v2.ts` — exists (`apps/api/src/services/identity-v2/consent-v2.ts`).
- ADR `MMT-ADR-0029` — exists (`docs/adr/MMT-ADR-0029-bearer-token-consent-withdrawal-authority.md`).
- Archived as-shipped copy — exists (`docs/_archive/specs/Done/2026-06-26-p0-email-consent-withdrawal-design.md`).
- Merge history: PR #1530 "P0: Email-parent consent withdrawal (bearer-token web flow)" (commit `355233c3a`), plus prod-env hardening WI-1340 (commits `12e1ea715`/`2e8befc1f`, "guard prod env fails loudly without consent-withdrawal + analytics secrets").
- Remaining launch-gate items (minting `CONSENT_WITHDRAWAL_TOKEN_SECRET`/`ANALYTICS_HASH_KEY` in prod, Resend SPF/DKIM, live E2E) are explicitly operator-gated per the doc, not design/code gaps — tracked under WI-1340, itself already merged (env-guard landed).

CANDIDATE WIs: none extracted (register row confirms zero candidates) — nothing to disposition.

VERDICT: superseded — the live doc is itself the shipped record (status banner + archive pointer); the working design doc should be treated as historical, superseded by the archived Done copy + ADR-0029, not an open spec.

MVP RECOMMENDATION: in (already shipped; compliance-critical for the self-registered-minor flow, keep as-is). No action needed beyond confirming the prod secrets are actually minted before public sign-up opens (operator checklist item, not a code/spec gap).

CONFIDENCE: high — doc self-documents shipped status with file:line citations, all cited files independently confirmed to exist, and git log confirms both the feature PR (#1530) and the WI-1340 hardening commit landed on main. No Zuzka questions — this row is closeable without a decision.
