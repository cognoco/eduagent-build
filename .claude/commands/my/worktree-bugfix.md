# Notion Bug Fix — Pick, Verify, Resolve

Launch 10 subagents, give each subagent 3 bugs from the **Issue Tracker - Open** database (`3598bce9-1f7c-8070-86eb-e012bd99f184`). That is the single source of active work — `Issue Tracker - Resolved` (`b8ce802f-1126-4a2f-a123-be5f888cbb23`) is a frozen archive of Done bugs; never read or write from it for active fixes. When a bug is verified Done, you MUST move it from Open → Resolved (see "Archive Done bugs" below). The Open DB stays small only if every Done bug gets archived; leaving them in Open recreates the bloat that drove the split.

**Parallel agents:** when the batch is 3+ bugs that touch disjoint files, fan out via `/my:dispatch` — it owns the planning (one bug per track, file-conflict check), the agent contract, and the post-fan-out validation. Don't hand-roll parallel logic here.

## Before you touch anything

1. **Confirm the bug is still open** and **not already obsolete in current code.** Many rows pre-date a fix that was shipped under a different PR/title. Grep for the symptom, read the cited file:line, and try to reproduce.
2. **Mark the bug `In progress` in Notion** so other agents don't pick the same one.
3. **Stage as you go, never commit.** After each Edit/Write, run `git add -- <file>` immediately (use `:(literal)` pathspec for Expo Router bracket files) so the change is locked in the git index. Concurrent watchers (Codex, VS Code autosave, format-on-save) and other parallel agents can otherwise silently revert your work, and silently-reverted edits leave no git record. Do NOT run `git commit` or `git push`. Coordinator commits via `/commit` when the user asks.
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
- **Move it to the Resolved archive** immediately after marking Done (see "Archive Done bugs" below).
- **Never reopen Done items** unless the user asks.

## Archive Done bugs (Open → Resolved)

The `Issue Tracker - Open` DB exists to be small. Every Done row gets moved to `Issue Tracker - Resolved` as part of the same task that marked it Done — not "later", not "in a batch".

### Recipe (REST, three calls per row)

Notion has no native "move row" — you copy, then archive the original. The schemas are identical except Open has an extra `Implementation Status` field which is dropped on copy.

```powershell
# Get NOTION_API_KEY: doppler.exe secrets get NOTION_API_KEY --plain -p mentomate -c dev
# Headers: Authorization=Bearer $key, Notion-Version=2022-06-28

# 1. Read full source page properties
GET https://api.notion.com/v1/pages/{sourcePageId}

# 2. Read source page body blocks (for the description)
GET https://api.notion.com/v1/blocks/{sourcePageId}/children?page_size=100

# 3. Create new page in Resolved with cleaned properties + body
POST https://api.notion.com/v1/pages
{
  "parent": { "database_id": "b8ce802f-1126-4a2f-a123-be5f888cbb23" },
  "properties": { ...copied from source, dropping Bug ID + Implementation Status... },
  "children": [ ...stripped blocks (remove null icon/href; sanitize bad URLs)... ]
}

# 4. Archive the source row in Open
PATCH https://api.notion.com/v1/pages/{sourcePageId}
{ "archived": true }
```

### Gotchas (learned from the 2026-05-18 bulk migration)

- **Don't send `null` for optional block fields** (e.g. `paragraph.icon`) — Notion returns them on read but rejects them on create. Strip null keys from each block payload before posting.
- **Properties pass through verbatim** — don't recursively null-strip them. PowerShell single-element array unwrap will damage `rich_text` arrays; use `[ordered]@{ rich_text = @($prop.rich_text) }` to force array shape.
- **Bug IDs do NOT survive the move** (auto-increment is per-DB). If the user references a bug by its Open ID elsewhere, capture the original in the title or Resolution before moving.
- **`Bug ID` and `Implementation Status` must NOT be in the create payload** — `Bug ID` is auto, `Implementation Status` doesn't exist in Resolved.
- **Sanitize bad URLs in rich_text.** Real bug seen: a link with `url: "/"` (not absolute) → 400 "Invalid URL for link". Strip `link` and `href` where they don't match `^https?://`.
- **Files (Screenshots) hosted on Notion can't be re-attached** — signed URLs expire and can't be re-uploaded. If Screenshots is non-empty, warn the user before moving (the 2026-05-18 batch had zero, but future bugs may have UI screenshots).

For a worked example, see `~/.claude/projects/C--Dev-Projects-Products-Apps-eduagent-build/2c71d446-10ea-4dd9-be77-c9968f9963c7/` (the session that built the migration script). The full PowerShell recipe is in that transcript.

## Update documentation after every bug

For each bug you touched:

- **Notion row** (mandatory) — `Status` → Done (or back to Not started if you couldn't repro and didn't change anything), `Fixed In` (branch / commit / "verified obsolete"), `Resolution` (one paragraph citing the file:line and the test that proves it), `Resolved` (today's ISO date). **If Status went to Done, move the row from Open → Resolved per "Archive Done bugs" above.** If Status reverted to Not started, leave it in Open.
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
