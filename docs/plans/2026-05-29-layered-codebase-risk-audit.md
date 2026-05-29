---
title: Layered Codebase Risk Audit — Implementation Plan
date: 2026-05-29
profile: change
spec: conversation (deep full-codebase review approach, 2026-05-29)
status: draft
---

# Layered Codebase Risk Audit — Implementation Plan

**Goal:** Review the full repo for ship-risk bugs without doing a low-yield literal line-by-line read of every file, and record every confirmed bug or actionable gap in Notion.
**Approach:** Use broad static sweeps across the entire codebase, then line-by-line review the subsystems where runtime assumptions are most dangerous: auth/profile scoping, billing/webhooks, durable background work, LLM/session state machines, mobile navigation/error flows, and shared contracts. Each finding gets duplicate-checked in Notion before creation; suspected issues that cannot be confirmed are recorded as investigation notes, not bug records.

## Scope

In scope:
- `apps/api/src/routes/**`
- `apps/api/src/services/**`
- `apps/api/src/inngest/**`
- `apps/api/src/index.ts`, API middleware, config, and route registration
- `apps/mobile/src/app/**`
- `apps/mobile/src/components/**`
- `apps/mobile/src/hooks/**`
- `apps/mobile/src/lib/**`
- `apps/mobile/src/i18n/**`
- `apps/mobile/e2e/**`
- `packages/schemas/**`
- `packages/database/**`
- `packages/test-utils/**`
- `tests/integration/**`
- `scripts/**`
- `.github/workflows/**`
- Current architecture/planning context in `docs/project_context.md`, `docs/architecture.md`, and active `docs/plans/**`

Out of scope:
- `node_modules/**`, `.nx/**`, `.expo/**`, build outputs, coverage outputs, and generated artifacts.
- `docs/_archive/**` except when an active plan, Notion issue, or code comment explicitly points there.
- Third-party dependency source review.
- Fixing bugs found during the audit. Fixes should be separate work items unless the user explicitly asks to combine review and remediation.
- Literal line-by-line review of every source file. Line-by-line review is required only for the high-risk slices named below.

## File Map

| File / location | Responsibility |
|---|---|
| `docs/plans/2026-05-29-layered-codebase-risk-audit.md` | Audit plan, execution checklist, and final verification record. |
| Notion `Issue Tracker - Open` | Destination for new confirmed bugs and actionable engineering gaps. |
| Existing Notion bug pages | Duplicate target when a finding is already tracked; update only when the new audit adds material reproduction or impact detail. |

## Review Standard

Every confirmed finding must include:
- Location with file and line.
- Category: security/data isolation, billing/access, async/background, LLM/state machine, mobile runtime, i18n/copy, CI/release, data migration, or test gap.
- Assumption: what the code assumes.
- Break scenario: a realistic user, production, or CI path that violates the assumption.
- Impact and priority.
- Suggested fix pattern.
- Verification expectation: named test, guard, integration test, eval, or manual check that should prove the fix.
- Notion duplicate check result.

## Tasks

- [ ] **T1: Establish the audit baseline** — done when the current branch, dirty working-tree files, loaded repo rules, relevant memory entries, and Notion target database are recorded in this plan's `## Execution Log`. Run:
  ```powershell
  git status --short --branch
  Get-Content -Raw AGENTS.md
  Get-Content -Raw docs/project_context.md
  Get-Content -Raw docs/architecture.md
  Get-Content -Raw .claude/memory/MEMORY.md
  ```
  If `AGENTS.md` is unavailable as a file in the current runtime, use the IDE-provided AGENTS instructions from the conversation as the baseline source.

- [ ] **T2: Build a surface inventory and risk map** — done when the execution log lists counts and high-risk buckets for API routes, services, Inngest functions, mobile screens, hooks, shared packages, scripts, workflows, and integration suites. Run:
  ```powershell
  rg --files -g "*.ts" -g "*.tsx" -g "*.js" -g "*.mjs" -g "*.cjs" | Measure-Object
  rg --files apps/api/src/routes apps/api/src/services apps/api/src/inngest | Measure-Object
  rg --files apps/mobile/src/app apps/mobile/src/components apps/mobile/src/hooks apps/mobile/src/lib | Measure-Object
  rg --files packages tests/integration scripts .github/workflows apps/mobile/e2e | Measure-Object
  ```
  Risk-map output must identify the Tier 0 line-by-line slices used in T5-T10.

- [ ] **T3: Run broad baseline checks** — done when every command's pass/fail status is recorded, and every failure is either linked to an existing Notion issue or captured as a new issue. Run:
  ```powershell
  pnpm exec tsc --build --pretty false
  pnpm check:i18n:orphans
  pnpm check:i18n
  pnpm check:no-clinical-copy
  pnpm exec tsx scripts/check-gc1-pattern-a.ts
  pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/orphan-dispatcher.guard.test.ts --runInBand --no-coverage
  pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/safe-non-core.guard.test.ts --runInBand --no-coverage
  pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/app/screen-navigation.test.ts --runInBand --no-coverage
  pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/lib/format-api-error.test.ts --runInBand --no-coverage
  ```

- [ ] **T4: Run full-repo static bug sweeps** — done when each sweep has a candidate list, false-positive notes, and confirmed issues are in Notion. Use `rg` first, then inspect candidates manually before filing:
  ```powershell
  rg -n "void\s+safeSend|safeSend\(" apps/api/src
  rg -n "setTimeout|setInterval|void\s+\w+\(|\.catch\(\s*\(\)\s*=>" apps/api/src apps/mobile/src scripts
  rg -n "process\.env" apps/api/src packages scripts
  rg -n "from ['\"]drizzle-orm|from ['\"]@eduagent/database|db\.(select|update|delete|insert)" apps/api/src/routes
  rg -n "fetch\(|\.json\(\)|\.text\(\)" apps/api/src apps/mobile/src packages scripts
  rg -n "eslint-disable|@ts-ignore|@ts-expect-error|as any|!\\." apps/api/src apps/mobile/src packages scripts
  rg -n "describe\.skip|it\.skip|test\.skip|\\.only\\(" apps/api apps/mobile packages tests scripts
  rg -n "jest\.mock\(['\"]\\.\\.?/" apps/api apps/mobile packages tests scripts
  rg -n "SecureStore|router\.push|router\.back|useLocalSearchParams|initialRouteName|unstable_settings" apps/mobile/src
  rg -n "TODO|FIXME|HACK|BUG-|KNOWN_PENDING|orphan|fallback" apps/api/src apps/mobile/src packages scripts .github/workflows
  ```
  For hardcoded mobile copy, run an inline `ts-morph` scan so no audit helper is committed:
  ```powershell
  pnpm exec node -e '
  const { Project, Node } = require("ts-morph");
  const path = require("node:path");
  const project = new Project({ tsConfigFilePath: "apps/mobile/tsconfig.json", skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(["apps/mobile/src/**/*.tsx"]);
  const userCopyAttributes = new Set(["label", "title", "subtitle", "description", "placeholder", "message", "header", "caption", "children"]);
  let count = 0;
  for (const file of project.getSourceFiles()) {
    file.forEachDescendant((node) => {
      if (Node.isJsxText(node)) {
        const text = node.getText().replace(/\s+/g, " ").trim();
        if (/[A-Za-z][A-Za-z ]{2,}/.test(text)) {
          count += 1;
          console.log(`${path.relative(process.cwd(), file.getFilePath())}:${node.getStartLineNumber()}: ${text}`);
        }
      }
      if (Node.isStringLiteral(node) && Node.isJsxAttribute(node.getParent())) {
        const attr = node.getParent();
        const attrName = attr.getNameNode().getText();
        const text = node.getLiteralText().trim();
        if (userCopyAttributes.has(attrName) && /[A-Za-z][A-Za-z ]{2,}/.test(text)) {
          count += 1;
          console.log(`${path.relative(process.cwd(), file.getFilePath())}:${node.getStartLineNumber()}: ${attrName}="${text}"`);
        }
      }
    });
  }
  console.error(`hardcoded-user-copy-candidates=${count}`);
  '
  ```

- [ ] **T5: Line-by-line review API auth, ownership, and profile scoping** — done when every scoped read/write path in the listed files is checked for `createScopedRepository(profileId)`, explicit `profileId`, or parent-chain ownership enforcement, and confirmed bugs are in Notion:
  - `apps/api/src/routes/account.ts`
  - `apps/api/src/routes/profiles.ts`
  - `apps/api/src/routes/consent.ts`
  - `apps/api/src/routes/onboarding.ts`
  - `apps/api/src/routes/children.ts` if present; otherwise record absence.
  - `apps/api/src/services/account.ts`
  - `apps/api/src/services/family-access.ts`
  - `apps/api/src/services/family-bridge.ts`
  - `apps/api/src/services/database-rls-coverage.ts`
  - `packages/database/src/repository.ts`
  - `tests/integration/profile-isolation.integration.test.ts`
  - `tests/integration/auth-chain.integration.test.ts`

- [ ] **T6: Line-by-line review billing, subscriptions, and webhooks** — done when entitlement mutation, idempotency, silent recovery, sandbox/production separation, webhook authenticity, and RevenueCat/Stripe state transitions are checked end to end:
  - `apps/api/src/routes/billing.ts`
  - `apps/api/src/routes/revenuecat-webhook.ts`
  - `apps/api/src/services/billing/**`
  - `apps/api/src/services/billing.ts`
  - `packages/schemas/src/billing.ts`
  - `tests/integration/billing-lifecycle.integration.test.ts`
  - `tests/integration/billing-service.integration.test.ts`
  - `tests/integration/stripe-webhook.integration.test.ts`
  Each silent recovery path in billing/webhook code must emit a structured metric/event or become a Notion issue.

- [ ] **T7: Line-by-line review durable background work** — done when every production event and cron has both a dispatcher/scheduler and a handler, request-path sends are awaited or explicitly attached to a runtime-safe context, and orphan events are filed or linked:
  - `apps/api/src/inngest/index.ts`
  - `apps/api/src/inngest/client.ts`
  - `apps/api/src/inngest/helpers.ts`
  - `apps/api/src/inngest/functions/**`
  - `apps/api/src/inngest/orphan-dispatcher.guard.test.ts`
  - Event dispatch sites from:
    ```powershell
    rg -n "inngest|safeSend|send\(" apps/api/src/routes apps/api/src/services
    ```

- [ ] **T8: Line-by-line review LLM and session state-machine paths** — done when envelope parsing, hard caps, provider routing, prompt-output contracts, source provenance, retry/degradation behavior, and session mutation ordering are checked:
  - `apps/api/src/services/session/**`
  - `apps/api/src/routes/sessions.ts`
  - `apps/api/src/services/llm/**`
  - `apps/api/src/services/**/*-prompts.ts`
  - `apps/api/eval-llm/**` if present.
  - `scripts/check-prompt-markers.sh`
  Also run:
  ```powershell
  bash scripts/check-prompt-markers.sh
  pnpm eval:llm
  ```
  If live provider behavior is part of a confirmed finding, additionally run `pnpm eval:llm --live` and record the model/provider result.

- [ ] **T9: Line-by-line review mobile runtime assumptions** — done when high-risk screens and hooks are checked for missing params, cross-stack pushes, auth/onboarding redirects, stale closures, unmount races, native availability, error-boundary recovery, and localized copy:
  - `apps/mobile/src/app/_layout.tsx`
  - `apps/mobile/src/app/(app)/**/_layout.tsx`
  - `apps/mobile/src/app/(app)/session/**`
  - `apps/mobile/src/app/(app)/homework/**`
  - `apps/mobile/src/app/(app)/subscription.tsx`
  - `apps/mobile/src/app/(app)/onboarding/**`
  - `apps/mobile/src/app/(app)/parent*/**`
  - `apps/mobile/src/hooks/use-revenuecat.ts`
  - `apps/mobile/src/hooks/use-speech-recognition.ts`
  - `apps/mobile/src/hooks/use-text-to-speech.ts`
  - `apps/mobile/src/hooks/use-notification-response-handler.ts`
  - `apps/mobile/src/hooks/use-mentor-language-sync.ts`
  - `apps/mobile/src/lib/api-client.ts`
  - `apps/mobile/src/lib/api-errors.ts`
  Run focused tests for any screen/hook where a finding depends on behavior.

- [ ] **T10: Review shared contracts, migrations, scripts, and CI release paths** — done when schema/API drift, migration rollback safety, test-only exports, GitHub workflow security, seed cleanup, and release gates are checked:
  - `packages/schemas/src/**`
  - `packages/database/src/**`
  - `packages/database/migrations/**` if present.
  - `packages/test-utils/src/**`
  - `tests/integration/**`
  - `scripts/check-*.ts`, `scripts/*guard*.test.ts`, `scripts/pre-*.sh`
  - `.github/workflows/**`
  Run:
  ```powershell
  pnpm exec jest --config scripts/jest.config.cjs --runInBand --no-coverage
  pnpm exec nx test:integration api
  ```
  If integration tests cannot run because local secrets are missing, record the exact missing secret/env condition and create a Notion infrastructure issue only if the failure is not already documented.

- [ ] **T11: Capture findings in Notion** — done when every confirmed issue from T3-T10 has a Notion page or an existing Notion duplicate link. New pages must use the open issue database and include:
  - Title in the form `<area>: <specific breakage>`.
  - Priority and platform.
  - `Found In` naming this audit plan and the source command or file slice.
  - Reproduction or break scenario.
  - Impact.
  - Suggested fix.
  - Verification expectation.
  - Duplicate search terms used.
  Do not reopen resolved Notion issues. If a resolved item has regressed, create a new open issue and link the resolved page as historical context.

- [ ] **T12: Produce the final audit report** — done when the final response lists the number of new Notion issues, number of duplicate-linked issues, commands run, commands not run with exact reasons, and the highest-risk areas still needing a deeper follow-up. The report must explicitly say that the audit used broad sweeps plus targeted line-by-line review, not a literal read of every repo file.

## Tier 0 Line-By-Line Slices

These areas get literal line-by-line review because bugs here can cross users, block payment access, corrupt durable state, or hide production failures:

- Auth/profile ownership and scoped data access: T5.
- Billing, subscription, RevenueCat, Stripe, quota, and webhook mutation: T6.
- Inngest event dispatch, orphan events, durable jobs, and crons: T7.
- LLM/session state machines, structured response envelopes, and prompt-output contracts: T8.
- Mobile session, homework, subscription, onboarding, parent/family, navigation, native voice/camera, and API error boundary paths: T9.
- Shared schema/database contracts, migrations, seed/test infrastructure, and CI release workflows: T10.

## Agent Breakdown

- **Coordinator** — owns T1-T4 and T11-T12: baseline, broad scans, dedupe rules, Notion creation, and final synthesis.
- **Agent A: Auth/Profile/Data Isolation** — owns T5.
- **Agent B: Billing/Webhooks/Subscriptions** — owns T6.
- **Agent C: Inngest/Background Work** — owns T7.
- **Agent D: LLM/Session State Machines** — owns T8.
- **Agent E: Mobile Runtime** — owns T9.
- **Agent F: Shared Contracts/CI/Scripts/Integration Infra** — owns T10.

## Execution Log

Executed 2026-05-29 by Coordinator + Agents A-F. This audit used broad static
sweeps plus targeted line-by-line review of Tier 0 slices; it was not a literal
line-by-line read of every repo file.

- Branch: `HEAD (no branch)` in `C:\Users\ZuzanaKopečná\.codex\worktrees\52f7\eduagent-build`.
- Dirty files present before audit: none (`git status --short` empty). `node_modules` was absent at first; coordinator ran `pnpm install --frozen-lockfile` before final verification.
- Docs/memory loaded: IDE-provided `AGENTS.md` instructions, local `AGENTS.md`, `docs/project_context.md`, `docs/architecture.md`, `.claude/memory/MEMORY.md`, `.claude/memory/reference_notion_workspace.md`, `.claude/memory/project_known_bug_patterns.md`, `.claude/memory/feedback_notion_rest_for_queries.md`, `.agents/skills/project-memory/SKILL.md`, `.agents/skills/deep-bugfixing/SKILL.md`, `.agents/skills/notion/SKILL.md`, Notion Patterns skill.
- Notion database used: `Issue Tracker - Open` (`3598bce9-1f7c-8070-86eb-e012bd99f184`). Duplicate check used REST pagination over Open + Resolved trackers: 1,831 rows total (90 Open, 1,741 Resolved).
- T2 inventory counts: 1,926 source/script files in scanned extensions; 644 API route/service/Inngest files; 801 mobile app/component/hook/lib files; 540 shared/test/script/workflow/e2e files. Sub-counts: 99 route files, 417 service files, 128 Inngest files, 288 mobile app files, 122 mobile hook files, 61 integration suites.
- Tier 0 slices reviewed line-by-line:
  - T5 auth/profile/data isolation: Agent A.
  - T6 billing/webhooks/subscriptions: Agent B.
  - T7 Inngest/background work: Agent C.
  - T8 LLM/session state machines: Agent D.
  - T9 mobile runtime: Agent E.
  - T10 shared contracts/CI/scripts/integration infra: Agent F.
- Broad sweep candidate counts: `safeSend` 55; async/fire-and-forget 496; `process.env` 286; route DB access 88; fetch/json/text 901; suppressions/casts/non-null 1,964; skipped/only tests 29; internal relative `jest.mock` 439; mobile routing/storage 1,083; TODO/fallback 4,176; hardcoded mobile copy candidates 501.
- Commands run:
  - `pnpm install --frozen-lockfile` — passed.
  - `pnpm exec tsc --build --pretty false` — first failed before dependencies existed; passed after install.
  - `pnpm check:i18n:orphans` — passed.
  - `pnpm check:i18n` — passed.
  - `pnpm check:no-clinical-copy` — passed with note: 2 stale baseline entries no longer present.
  - `pnpm exec tsx scripts/check-gc1-pattern-a.ts` — passed.
  - `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/orphan-dispatcher.guard.test.ts --runInBand --no-coverage` — passed, with existing `DATABASE_URL` warning.
  - `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/safe-non-core.guard.test.ts --runInBand --no-coverage` — passed, with existing `DATABASE_URL` warning.
  - `pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/app/screen-navigation.test.ts --runInBand --no-coverage` — passed.
  - `pnpm exec jest --config apps/mobile/jest.config.cjs apps/mobile/src/lib/format-api-error.test.ts --runInBand --no-coverage` — passed.
  - `bash scripts/check-prompt-markers.sh` — passed (Agent D).
  - `pnpm eval:llm` — passed after install: 21 flows, 316 snapshots, 15 expected profile-scope skips (Agent D).
  - Agent E focused tests: pronouns, mentor-language sync, child topic route-param tests — passed.
  - `bash scripts/check-migration-rollback.sh` — passed (Agent F).
  - `pnpm run check:github-workflow-security` — passed after install (Agent F).
  - `node --test packages/database/scripts/verify-db-target.test.mjs` — failed; filed as a new issue.
- Commands skipped or not green and reason:
  - `pnpm eval:llm --live` — not run; no confirmed finding depended on live provider behavior.
  - `pnpm exec nx test:integration api` — failed to start useful integration run because `DATABASE_URL` was unset; `.env.test.local` and `.env.development.local` absent, and Doppler-backed test env loading did not provide `DATABASE_URL`. Existing docs/memory already document the local integration secret requirement, so no new infra issue was created.
  - `pnpm exec jest --config scripts/jest.config.cjs --runInBand --no-coverage` — failed with "No tests found" on this Windows worktree despite `scripts/*.test.ts` files existing; treated as Windows/Jest discovery quirk, not filed as a product/CI issue because GitHub CI runs on Ubuntu.
- New Notion issues: 16.
  - Auth/profile: non-owner profiles can re-open or redirect sibling consent requests — https://www.notion.so/Auth-profile-non-owner-profiles-can-re-open-or-redirect-sibling-consent-requests-36f8bce91f7c81fb9839d61343102d4f
  - Billing: RevenueCat billing issues ignore app-store grace periods — https://www.notion.so/Billing-RevenueCat-billing-issues-ignore-app-store-grace-periods-36f8bce91f7c81c9b505fdeb042592c0
  - Billing: RevenueCat top-up on locally-free tier returns 403 without recovery signal — https://www.notion.so/Billing-RevenueCat-top-up-on-locally-free-tier-returns-403-without-recovery-signal-36f8bce91f7c81389eddf3af2e6c4b2c
  - Billing: webhook cache refresh silently skips missing KV or subscription rows — https://www.notion.so/Billing-webhook-cache-refresh-silently-skips-missing-KV-or-subscription-rows-36f8bce91f7c819cb9e5c5ce38136c44
  - Inngest: dynamic memory-dedup events are orphaned and missed by the guard — https://www.notion.so/Inngest-dynamic-memory-dedup-events-are-orphaned-and-missed-by-the-guard-36f8bce91f7c8143bfdde889d7f0cbe6
  - Inngest: empty-reply fallback handler has no production dispatcher — https://www.notion.so/Inngest-empty-reply-fallback-handler-has-no-production-dispatcher-36f8bce91f7c8136b399e7943a41175d
  - Sessions: streaming fallback drops completion and UI signals from done frames — https://www.notion.so/Sessions-streaming-fallback-drops-completion-and-UI-signals-from-done-frames-36f8bce91f7c8103b809f5f72a726069
  - LLM/source safety: missing private_sources can still show source-bound factual claims — https://www.notion.so/LLM-source-safety-missing-private_sources-can-still-show-source-bound-factual-claims-36f8bce91f7c817ea5dbc81280c76a92
  - Mobile onboarding: existing pronouns can be cleared after delayed profile load — https://www.notion.so/Mobile-onboarding-existing-pronouns-can-be-cleared-after-delayed-profile-load-36f8bce91f7c81b889e8e3d517065934
  - Mobile: mentor language sync suppresses retry after failed profile patch — https://www.notion.so/Mobile-mentor-language-sync-suppresses-retry-after-failed-profile-patch-36f8bce91f7c81468295e6edee73042a
  - Mobile parent topic detail: malformed masteryScore route param renders NaN% — https://www.notion.so/Mobile-parent-topic-detail-malformed-masteryScore-route-param-renders-NaN-36f8bce91f7c817da7ebf41681ec5ebc
  - Mobile i18n: audited billing/homework/session/notification copy bypasses localization — https://www.notion.so/Mobile-i18n-audited-billing-homework-session-notification-copy-bypasses-localization-36f8bce91f7c81c6bd94e9ab24d79042
  - CI deploy: Worker deploy can publish before required Doppler secret sync succeeds — https://www.notion.so/CI-deploy-Worker-deploy-can-publish-before-required-Doppler-secret-sync-succeeds-36f8bce91f7c81ea917af7a07095df4d
  - CI mobile: production EAS builds can bypass production approval and tests — https://www.notion.so/CI-mobile-production-EAS-builds-can-bypass-production-approval-and-tests-36f8bce91f7c816f9f37f5815920dadf
  - Database scripts: migration deploy guard test expects obsolete baseline-migrations step — https://www.notion.so/Database-scripts-migration-deploy-guard-test-expects-obsolete-baseline-migrations-step-36f8bce91f7c81118df6fe1e96e0c013
  - CI guard: test-only export scanner only covers mobile source — https://www.notion.so/CI-guard-test-only-export-scanner-only-covers-mobile-source-36f8bce91f7c81b4a1b5e87af147004e
- Existing Notion duplicates linked:
  - BUG-786 — Book topic generation fires pre-generation event via unawaited `safeSend` in request path.
  - BUG-755 — session-exchange `void safeSend` fire-and-forget suppresses future regressions.
  - BUG-785 — Legacy `KNOWN_PENDING_ORPHANS` contains operational events with no handlers.
  - BUG-790 — Homework auto-create-subject error detail is guarded only by a skipped regression test.
  - Related historical context, not treated as active duplicates: BUG-851 (`app/exchange.empty_reply_fallback` older handler issue), BUG-607 (partial hardcoded subscription/child paywall copy).
- Follow-up slices recommended:
  - Fix P1 release gates before next production deploy/mobile production build: Doppler secret sync ordering and production EAS approval.
  - Sweep request-lifecycle `safeSend`/`step.sendEvent` patterns with a stronger static guard for dynamic event names and `waitUntil`.
  - Add a focused i18n hardcoded-copy ratchet for audited mobile runtime paths; current scan still reports 501 candidates.
  - Run `pnpm exec nx test:integration api` under a configured Doppler/`DATABASE_URL` environment before acting on data-isolation and billing fixes.
