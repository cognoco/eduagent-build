# [MEDIUM] id-token: write granted to the agent job but no OIDC exchange is performed

**File:** [`.github/workflows/claude.yml`](https://github.com/cognoco/eduagent-build//blob/main/.github/workflows/claude.yml#L30) (lines 30)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `oidc-misuse`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The claude job declares `id-token: write` (L30), which lets the runner mint OIDC tokens that can be federated into cloud roles (AWS/GCP/Azure) if a trust policy references this repo/workflow. No step in the job performs an OIDC exchange — the only credential actually used is the OAuth token (L45). Because the agent runs with the action's default unrestricted Bash (L57 commented out) and is driven by attacker-influenced text (issue/comment bodies), a successful prompt injection combined with any weakening of the author gate could request an OIDC token from $ACTIONS_ID_TOKEN_REQUEST_URL and exchange it for cloud credentials. Granting this permission to an LLM-agent job that processes untrusted input is an unnecessary expansion of the credential surface.

## Recommendation

Remove `id-token: write` from this job unless a concrete step in the same job exchanges an OIDC token (none does). If OIDC is needed elsewhere, isolate it in a separate job with its own minimal permissions, not co-located with the comment-driven agent.

## Revalidation

**Verdict:** true-positive

Verified: `id-token: write` is present (line 30) and no step performs an OIDC exchange — the only credential used is `secrets.CLAUDE_CODE_OAUTH_TOKEN` (line 45); the steps are checkout, an mkdir, and the claude-code-action (which takes an OAuth token, not OIDC). The permission is therefore unused. Unlike the analogous ccr#4, this is the more concerning of the two id-token findings because claude.yml leaves `--allowedTools` commented out (line 57), so the agent has unrestricted Bash and is driven by attacker-influenceable text (comment/issue bodies); a successful prompt injection could request a token from $ACTIONS_ID_TOKEN_REQUEST_URL and federate it into any cloud role whose trust policy references this repo/workflow. Real least-privilege issue on an untrusted-input LLM job — remove `id-token: write` since no step uses it. MEDIUM is reasonable.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
- crowka <zuzana.kopecna@phantix.com> (2026-02-21)
