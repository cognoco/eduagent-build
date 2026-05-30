# [HIGH] Any @claude issue or comment can invoke a secret-backed agent

**File:** [`.github/workflows/claude.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/claude.yml#L20-L45) (lines 20, 21, 22, 23, 24, 30, 43, 45)
**Project:** eduagent-build
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `missing-auth`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The job condition only checks whether issue, comment, or review text contains @claude. It does not verify author_association, team membership, labels, or maintainer approval before starting anthropics/claude-code-action with CLAUDE_CODE_OAUTH_TOKEN and id-token: write. On repos where untrusted users can open issues or comment, an attacker can consume the Claude OAuth quota and drive the agent with prompt content under their control; the unnecessary OIDC permission increases the impact if the action/tooling can run shell commands.

## Recommendation

Gate invocation to trusted actors, for example OWNER, MEMBER, or COLLABORATOR author associations, or require a maintainer-applied label/approval. Remove id-token: write unless the action truly needs it and configure restrictive Claude tool permissions.

## Revalidation

**Verdict:** true-positive

PRIMARY of the claude#1/claude#3 duplicate pair. Verified: the job `if:` (lines 20-24) gates solely on `contains(..., '@claude')` with zero author_association / actor / membership / label checks; `id-token: write` is present (line 30); the OAuth token is passed (line 45); and `claude_args`/`--allowedTools` is commented out (line 57), so the agent runs with the full default toolset including Bash. The action itself is SHA-pinned (line 43), so the only authorization control is `anthropics/claude-code-action`'s built-in 'write-access actors only' default — which is external to this repo and cannot be verified from static analysis here. When the sole control is external, unverifiable, and bypassable, the correct posture is to rate by worst-case reachable impact. Critically, the `issues: [opened, assigned]` trigger (lines 9-10) yields a concrete path that holds even if the write-access gate works: an attacker opens an issue containing `@claude` + an injection payload; a maintainer assigns it (routine triage); the action's actor check passes on the maintainer while the attacker-authored issue body becomes the agent's prompt — and with unrestricted Bash plus secrets and id-token in scope, that is an injection→execution surface on a privileged runner. HIGH is justified; if one fully credits the external gate, the direct-comment path drops to MEDIUM, but the issues:assigned vector keeps the ceiling at HIGH. Fix: add an explicit author-association allowlist as the first `if:` condition (gating issue *author*, not assigner) and restore a minimal --allowedTools allowlist.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
- crowka <zuzana.kopecna@phantix.com> (2026-02-21)
