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

## Execution Log

Fill this during execution:

- Branch:
- Dirty files present before audit:
- Docs/memory loaded:
- Notion database used:
- T2 inventory counts:
- Commands run:
- Commands skipped and reason:
- New Notion issues:
- Existing Notion duplicates linked:
- Follow-up slices recommended:
