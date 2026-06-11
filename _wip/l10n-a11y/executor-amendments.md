# PRG-12 — Executor amendments (living checklist)

**What this is.** The accreted, binding amendments block for every PRG-12 executor
brief, inherited from the Identity Foundation wave (see
`_wip/identity-foundation/executor-protocol-example.md`) plus PRG-12 domain rules.
The shepherd generates each dispatch brief from this file — lessons learned at any
gate get added HERE first, then flow into subsequent briefs. Process scaffold
itself: `_wip/identity-foundation/executor-protocol.md` (phases 0–7).

## Inherited from IF (binding)

1. **GC6, both halves:** before PR, scan EVERY touched test file for internal
   `jest.mock('./…')` / `jest.mock('../…')` / `jest.mock('@eduagent/…')` — convert
   to `jest.requireActual()` targeted overrides where feasible; for any retained
   (gc1-allow'd) mocks, the commit message MUST carry the GC6 deferral block
   (file paths + per-file mock count + tracking cite).
2. Explicit return types on new exported functions; no `[WI-nnn]`/`[F-nnn]` ticket
   tokens in source comments (test names may keep finding IDs).
3. **The turn does NOT end at push** — proceed to `gh pr create` in the same turn.
4. **No executor-side background CI waiters** — after PR open, check `gh pr checks`
   once; if running, END YOUR TURN reporting PR number + head SHA. The shepherd
   owns all cross-turn waits and resumes you.
5. **On green:** read the Claude Code Review COMMENT verdict (never the check
   colour) AND check for unresolved Codex/CodeRabbit threads; triage every finding
   with in-thread dispositions before reporting green. Do NOT run
   `/cosmo:execute complete` until the shepherd confirms the merge.
6. Red-green evidence discipline: regression/break tests must be demonstrated RED
   against the pre-fix code (revert/stash technique) and the evidence recorded in
   the completion summary — the reviewer demands it.
7. Never commit `_plan-WI-NN.md`. Work ONLY inside `.worktrees/WI-NN` — assert CWD
   before the first edit.
8. Completion-summary self-gate: section headers must be colon-terminated, and
   `Caveats / Follow-ups:` must be ONE literal single-line header (not split).

## PRG-12 domain rules (binding)

9. **Read AGENTS.md §Languages + §UI strings hygiene BEFORE touching any string.**
   Every new user-visible string routes through `t('…')` with the key added to
   `en.json` in the SAME PR; run `pnpm translate`; dynamic-key patterns go through
   `scripts/i18n-keep.ts` KEEP_PATTERNS with a real `file:line` cite.
10. The jsx-literals ratchet ALREADY EXISTS (`scripts/check-i18n-jsx-literals.ts`,
    361-entry baseline). Burn the baseline down as you route strings; run
    `pnpm check:i18n:jsx-literals --accept` ONLY for genuinely non-translatable
    copy and justify each acceptance in the commit message. Never build new i18n
    tooling.
11. Pre-PR validation must include the i18n checkers (`check-i18n-orphan-keys`,
    `check-i18n-jsx-literals`) green, plus typecheck + `--findRelatedTests` jest on
    the touched mobile files.
12. **Parallel-wave en.json discipline:** sibling executors also add `en.json` keys
    concurrently. Keep your keys in screen-scoped namespaces, rebase on
    `origin/main` before opening the PR, and treat `en.json` conflicts as trivial
    union-merges (both sides keep their keys).
13. Shared mobile components stay persona-unaware (semantic tokens, no hardcoded
    hex); accessibility props are part of the component contract — don't fork
    components per persona to add them.
14. **Commit-skill CWD anchoring (learned 2026-06-11, WI-621 PR A):** the commit
    skill runs as a forked execution and can default to the MAIN checkout, staging
    other sessions' files and pushing them to origin/main. When invoking it from a
    worktree, state the worktree path explicitly in the invocation ("commit in
    .worktrees/WI-NN") and verify afterwards (`git -C .worktrees/WI-NN log -1` +
    `git -C <repo-root> status`) that the commit landed on YOUR branch and the main
    checkout is untouched. If a misfire reaches shared main: do NOT revert on your
    own — report to the shepherd and continue.
15. **Plural keys need FULL plural categories (learned 2026-06-11, WI-621 PR C):**
    a new `_one`/`_other` key pair silently breaks Polish (i18next's pl resolver
    demands `_few`/`_many`). Any new plural key must carry every category the UI
    locales need (pl is the multi-category one in en/de/es/ja/nb/pl/pt) — verify the
    generated pl output actually contains `_few`/`_many` after `pnpm translate`.
    Also: `--findRelatedTests` does NOT catch `src/i18n/index.test.ts` (locale
    parity) — run the full `src/i18n/` suite whenever locale JSONs change.
16. **No split-sentence fragment keys (learned 2026-06-11, WI-621 PR A / Codex P2):**
    never split one sentence into multiple translation keys flanking an inline
    element — that hard-codes English word order and renders broken prose in
    free-word-order locales (JA verified). One key per sentence with `{{var}}`
    interpolation; if the inline element needs styling, react-i18next `<Trans>`.
    Leading/trailing punctuation living in a key value is the smell that flags
    this pattern.
