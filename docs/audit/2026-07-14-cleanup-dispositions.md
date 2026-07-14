# Stale audit cleanup dispositions

**Date:** 2026-07-14  
**Scope:** Every document and supporting artifact that was under `docs/audit/` at audit start.  
**Method:** Current source code, tests, guards, CI configuration, and live repo structure were checked. An older document's own status text was not accepted as evidence.

## Outcome

- **105 Markdown documents reviewed.**
- **100 Markdown documents + 32 supporting artifacts archived.**
- **5 pre-existing Markdown documents retained** (`INDEX.md`, the template, the consent audit, the one-way-door register, and the mock audit).
- **1 current disposition register added** (this file).
- Historical machine/session notes, point-in-time execution briefs, line-number atlases, issue-sync snapshots, and completed scanner output no longer sit in the active audit workspace.

## Per-document action

Every Markdown document beneath each listed directory inherits the stated action;
this is the disposition for each individual child document, not only the folder.
Supporting `.log`, `.json`, `.csv`, `.tsv`, and `.html` files inherit their parent
audit's action.

| Original document(s) | Action | Current-code basis |
|---|---|---|
| `2026-05-23-notion-bug-verification/**/*.md` | **Archive — superseded/captured** | Old issue-tracker synchronization snapshots; current code includes later guards and architectural replacements. |
| `2026-05-29-full-audit/**/*.md` | **Archive — addressed or historical reference** | i18n, GC1 mock, and Inngest dispatch findings now have executable guards; architecture and navigation snapshots materially drifted. Closed reconciliation/provenance records remain available in the archive. |
| `2026-06-09-codebase-atlas/**/*.md` | **Archive — superseded** | Billing V2, identity V2, navigation contracts, Challenge Round, now-feed, and the Inngest/session surfaces changed enough that the atlas must be regenerated, not patched. |
| `e2e/**/*.md` | **Archive — addressed/superseded; live residue extracted below** | Maestro and Playwright are both active, but current manifests, validators, CI workflows, ports, tags, and suite counts replace the May briefs. |
| `_changelog.md` | **Archive — not an audit tracker** | Personal machine/configuration session notes; current CLI and agent rules live in `AGENTS.md` and skills. |
| `goal-spike.md`, `goal-spike-analysis.md`, `goal-spike-mock-claude.md` | **Archive — implemented or superseded** | Envelope, Challenge Round, GC1, and `safeSend()` mechanisms landed; remaining broad ideas need fresh scope. |
| `2026-05-08-web-e2e-full-suite-bug-ledger.md`, `2026-05-11-end-user-playwright-bug-pass.md` | **Archive — superseded** | Current Playwright journeys and helpers use materially different contracts and selectors. |
| `2026-05-11-single-learner-ux-pass.md`, `2026-05-15-persona-store-compliance-triage.md`, `2026-05-25-full-codebase-review.md`, `2026-05-31-logical-gap-audit.md`, `2026-05-31-mobile-screen-audit.md` | **Archive — stale ledger; verified survivors extracted below** | Most findings are fixed or architecture-specific paths disappeared; the remaining findings are smaller than the stale ledgers. |
| `2026-06-07-data-retention-and-erasure-audit.md` | **Archive — captured elsewhere** | Identity V2 deletion erases BYOK data; quote-ageing remains explicitly tracked by **`WI-1194` — retention-gap closure; Backlog/P1; quote age-out plus purge/dormancy work**, `docs/compliance/ropa.md`, and the DPIA. |
| `2026-06-30-adr-provenance-revet.md` | **Archive — addressed** | The missing forward guard now exists as `scripts/check-adr-provenance.ts`, its tests, and `check:adr-provenance`. |
| `2026-07-08-wi-1181-dependency-lockfile-hygiene.md` | **Archive — completed no-op audit** | The audited packages were live transitive/direct dependencies; no lockfile cleanup existed. |
| `test-mocks.md` | **Keep active** | `createMockDb()` and internal mobile boundary mocks remain; guards prevent new debt but do not remove it. Historical counts require recounting before use. |
| `2026-07-11-consent-denial-behavior.md` | **Keep current reference** | Current code still performs destructive denial; the product ruling/build follow-up is captured by WI-1761 and the MVP definition's pending counsel decision. |
| `2026-07-12-one-way-door-risk-register.md` | **Keep active** | Its linked drain plan remains `status: draft` with unchecked owner/gate tasks. |
| `_audit-report-template.md` | **Keep reference; modernize terminology** | Reusable structure; no defect state. |
| `INDEX.md` | **Replace** | The prior index labelled May material active and linked a parent-home audit that had already moved to archive. |

Archive destination:
[`docs/_archive/audit/2026-07-14-stale-audit-cleanup/`](../_archive/audit/2026-07-14-stale-audit-cleanup/).

## Verified survivors needing a current ruling or work item

These findings were re-observed in current code. They are captured here so the
obsolete source ledgers can remain archived; this register is not a substitute
for owner-assigned work.

| Area | Current finding | Evidence | Capture state / action |
|---|---|---|---|
| Test boundaries | API `createMockDb()` and mobile internal boundary mocks still hide real contracts. | `packages/test-utils/src/lib/neon-mock.ts`; `apps/api/src/test-utils/database-module.ts` | Tracked actively by `test-mocks.md`; refresh counts before execution. |
| App loading | Root profile loading still lacks the timeout fallback exercised elsewhere. | `apps/mobile/e2e-web/j14-loading-timeout-fallback.spec.ts` documents the omission in `(app)/_layout.tsx`. | **Not found in a current dedicated tracker. Create or explicitly discard.** |
| Persona/store copy | Delete-account always renders store-subscription advisory, including free solo users. | `apps/mobile/src/app/(app)/more/delete-account.tsx` | **Not found in a current dedicated tracker.** Store-console/privacy-URL reachability also needs external verification. |
| Formatting/i18n | Relative-date fallback still returns English. | `apps/mobile/src/lib/format-relative-date.ts` | **Not found in a current dedicated tracker.** |
| API resilience | Meter top-up loops remain uncapped; weekly self-reports use an hourly-every-Monday cron; constant-time comparison remains local to the RevenueCat webhook route. | `apps/api/src/services/metering.ts`; `apps/api/src/inngest/functions/weekly-self-reports.ts`; `apps/api/src/routes/revenuecat-webhook.ts` | **Re-triage into current items; do not revive the May full-review ledger.** |
| Account/family lifecycle | Self-leave/delete, ownership transfer/graduation, co-parent management, and non-owner export/erasure were not found in current routes. | Current identity/account/family route surfaces | **Product-scope ruling needed before filing implementation items.** |
| Durable assessment resume | Mid-round durable resume for quiz/dictation remains unproven. | Current quiz/dictation services and routes | **Reproduce/define expected behavior before filing.** |
| Web E2E gate | Staging Playwright smoke remains advisory pending stability; no current two-green full-suite evidence was found. | `.github/workflows/e2e-web.yml`; `apps/mobile/playwright.config.ts` | **Create one stabilization/hard-gate decision item or explicitly accept advisory status.** |
| E2E umbrella residue | Old cleanup scripts remain; Clerk testing-token comments conflict; proposed Inngest coverage map was never created. | Current E2E scripts/config | **Decide each residual; do not keep the May umbrella proposal active.** |
| Navigation documentation | Audience matrix still describes the removed in-`LearnerScreen` home branch. | `apps/mobile/src/app/(app)/home.tsx` branches on `navigationContract.home.screen`; `AGENTS.md` is current. | **Correct or retire `docs/audience-matrix.md`.** |
| Quote retention | Verbatim learner content still survives the transcript purge. | `apps/api/src/services/transcript-purge.ts`; `docs/compliance/ropa.md` | Already captured by WI-1194 and compliance records. |

## Security follow-up

The archived `e2e/m1b-resume-2026-05-18.md` contained four literal historical
`TEST_SEED_SECRET` assignments. They were replaced with `<REDACTED>` in the
working tree before archiving. Git history still contains the prior values.

- Verify the historical secret has been rotated; rotate it if not.
- Decide whether repository-history rewriting is warranted, then coordinate it
  deliberately because rewriting shared history is disruptive.
- Do not copy a value from Git history into chat, a ticket, or another file.
