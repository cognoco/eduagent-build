# [MEDIUM] id-token: write declared on the review job with no OIDC exchange step

**File:** [`.github/workflows/claude-code-review.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/claude-code-review.yml#L31) (lines 31)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `oidc-misuse`

## Owners

**Suggested assignee:** `jorn.jorgensen@zwizzly.com` _(via last-committer)_

## Finding

The claude-review job grants `id-token: write` (L31) but no step requests or uses an OIDC token; authentication to the action is via the explicit `secrets.CLAUDE_CODE_OAUTH_TOKEN` (L190/202/212). This is an unnecessary credential-surface grant on a job that ingests untrusted PR content through an LLM. Residual risk is lower than in claude.yml because the agent's Bash is allowlisted to `gh pr` commands only (L163-165), so an injected agent cannot curl the OIDC token endpoint — but the permission is still unused and should be dropped per least privilege.

## Recommendation

Remove `id-token: write` from the job's permissions block unless a specific step performs an OIDC exchange (none does).

## Revalidation

**Verdict:** true-positive

Confirmed: `id-token: write` is present at line 32 and no step in the job performs an OIDC exchange (no configure-aws-credentials / google-github-actions/auth / Vault action / request to $ACTIONS_ID_TOKEN_REQUEST_URL). Authentication is solely via `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` (lines 190/202/212), and the verdict step uses the standard `GH_TOKEN: github.token`. So the permission is genuinely unused — a real least-privilege deviation on a job that ingests untrusted PR content through an LLM. Practical impact is low because claude_args allowlists Bash to `gh pr` subcommands only (lines 163-165), so an injected agent cannot curl the OIDC token endpoint. The original MEDIUM/low-confidence rating is fair; this is a hygiene fix (drop the permission), not a high-impact issue.

## Recent committers (`git log`)

- jojorgen <jorn.jorgensen@zwizzly.com> (2026-05-28)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-23)
