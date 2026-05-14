# Notion Bug Fix — Pick, Verify, Resolve

Pick 3 bugs from Notion. Source page: https://www.notion.so/cognix/Mentomate-35a8bce91f7c80c98220ff9968184945?source=copy_link — if that database has no open bugs, walk the parent page for sibling databases with open rows. The Bug Tracker is the canonical one; the parent has a `-temp` sibling that also carries rows.

**Parallel agents:** when the batch is 3+ bugs that touch disjoint files, fan out via `/my:dispatch` — it owns the planning (one bug per track, file-conflict check), the agent contract, and the post-fan-out validation. Don't hand-roll parallel logic here.

## Before you touch anything

1. **Confirm the bug is still open** and **not already obsolete in current code.** Many rows pre-date a fix that was shipped under a different PR/title. Grep for the symptom, read the cited file:line, and try to reproduce.
2. **Mark the bug `In progress` in Notion** so other agents don't pick the same one.
3. **Do NOT commit.** Work locally only. Coordinator commits via `/commit` when the user asks.
4. **If another agent is editing the same file**, layer your changes on top — never revert their work. Pull a fresh diff before saving.

## Fix discipline — same as the rest of the repo

Bug-fixing is test-fixing in 80% of cases here. Follow `/my:run-tests` for:

- The failure loop (run → note failures → classify as real bug, test drift, or env → fix accordingly → repeat until clean).
- The mock-on-touch sweep (every test file you open gets its internal `jest.mock('./...')` calls converted to `jest.requireActual()` + targeted overrides). External-boundary mocks (LLM `routeAndCall`, Stripe, Clerk JWKS, push, email, Inngest framework) are allowed with bare specifiers.
- The shared harnesses table (prefer `createIntegrationDb`, `llm-provider-fixtures`, `inngest-step-runner`, `mock-api-routes`, etc. over hand-rolled mocks).

Specifically for Notion bug work:

- **Production-ready, no shortcuts.** No `eslint-disable`, no `@ts-ignore`, no try/catch around the failing assertion. Fix the actual code.
- **Verify before marking Done.** Either run an existing test that exercises the fix, or write a new one if none exists. For security/HIGH-severity rows, write a **break test** (red-green regression): the test fails without the fix and passes with it.
- **If the bug is already fixed**, run the verification test(s) and update the Notion row to Done with a Resolution that cites the commit/file:line proving the fix. Don't just close it on inspection.
- **If you touch a test file that has internal mocks**, run the GC6 sweep on it before declaring the bug done — same rule as `/my:run-tests` step 4.

## Updating Notion

For each bug:

- **In progress** when you start. Even if you finish in 5 minutes — the claim prevents collisions.
- **Done** when verified, with `Fixed In` (branch / commit ref) and `Resolution` (one-paragraph cite of what changed and what test proves it). If the bug was obsolete, say so explicitly and cite the commit that resolved it upstream.
- **Never reopen Done items** unless the user asks.

## Update documentation after every bug

For each bug you touched:

- **Notion row** (mandatory) — `Status` → Done (or back to Not started if you couldn't repro and didn't change anything), `Fixed In` (branch / commit / "verified obsolete"), `Resolution` (one paragraph citing the file:line and the test that proves it), `Resolved` (today's ISO date).
- **You touched a test file with internal mocks** → see the documentation block in `/my:run-tests` (regenerate inventory CSV + bump the inventory markdown).
- **You learned a new repo rule or systemic pattern from the bug** → update `CLAUDE.md` (under the appropriate section: "Tests Must Reflect Reality", "Code Quality Guards", "Fix Development Rules", or "UX Resilience Rules"). Don't bury a new rule in a single bug's Resolution field.
- **You learned a new E2E infra workaround** → add a row to the troubleshooting matrix in `docs/E2Edocs/e2e-runbook.md`.
- **Your fix affects a tracked plan** (cleanup-plan, epic plan, audit plan) → tick the row off in that plan doc so status questions can be answered from the doc instead of git archaeology.

If you marked a bug obsolete without code change, the Resolution must cite the commit (or commit range) that already fixed it. "Looks fine to me" is not a resolution.

## References

- Test discipline (failure loop, mock-on-touch, shared harnesses): `/my:run-tests`
- Mock backlog sweep (proactive): `/my:sweep-mocks`
- Notion REST access (MCP often unavailable): `/my:notion`
- Repo rules on verification, break tests, no silent recovery: `CLAUDE.md` → "Fix Development Rules"
- Repo rules on test integrity: `CLAUDE.md` → "Tests Must Reflect Reality"
