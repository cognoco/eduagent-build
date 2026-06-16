## Completion Summary — 2026-06-14

**What was done:**
Extended the existing `tech/gha-hardening` skill in place with a `## Repo-specific context` section (no second skill created). The addendum maps the repo's live `.github/workflows/` surface against the generic hardening guidance, covering the four scoped items: (1) a workflow inventory, (2) the `@claude` agent-invocation threat model, (3) PR review-gate integrity, and (4) the mobile-Maestro gate fragility. Every workflow claim was cross-checked against the actual YAML.

**What changed:**
- `.agents/skills/tech/gha-hardening/SKILL.md` — added `## Repo-specific context` (~115 lines): a 13-entry workflow inventory table (triggers / secrets+id-token / untrusted-or-fork-code) covering all `.github/workflows/*.yml`; the `@claude` threat model for `claude-code-review.yml` (PR title/author env-var fencing, residual LLM prompt-injection risk) and `claude.yml` (no `--allowedTools`/`--max-turns` cap, `author_association` gate); PR review-gate integrity (the `claude[bot]` identity + `user.type==Bot` + timestamp filter blocks a forged APPROVED verdict); and the double-advisory Maestro gate (`docs-checks.yml` validator + `e2e-ci.yml` `mobile-maestro` both `continue-on-error: true`).
- `.claude/skills/tech-gha-hardening/SKILL.md` — regenerated mirror via `pnpm sync-skills` (`tech/` GROUP_DIR flatten).

**Verification:**
- All 13 workflow inventory rows cross-checked against the actual `.github/workflows/*.yml` files; a pre-merge adversarial subagent review found 4 factual errors + 2 missing items, all corrected before the first commit.
- `pnpm sync-skills` → 1 updated, 262 unchanged (mirror in sync).
- Pre-push hook passed (no TS files in delta).
- PR #1173 — all CI checks green; squash-merged to `main` at a35df5b30da0e3d2da40537e69d985cecdf88842. Operator approved content as-is (prg14-002 cleared).

**Caveats / Follow-ups:** One Codex P2 inventory-accuracy item (eval-live labeled-PR-code) deferred to the Stream 2 skill rework per operator ruling prg14-in-005.
