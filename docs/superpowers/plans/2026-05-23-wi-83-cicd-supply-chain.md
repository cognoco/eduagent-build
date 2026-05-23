# WI-83 CI/CD Supply-Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close WI-83 by hardening GitHub workflow/action supply-chain posture, preventing secret-backed PR-controlled code execution, scrubbing sensitive observability, and removing Gemini API keys from URLs.

**Architecture:** Add one repo-level workflow security verifier under `scripts/` with Jest coverage, then make the smallest workflow changes needed to satisfy it. API leaks are handled locally in their existing unit test suites: ask-gate observer logging stops carrying raw LLM prose, and Gemini provider sends API keys in headers instead of query strings.

**Tech Stack:** GitHub Actions YAML, TypeScript/Node verifier scripts, Jest, Hono/Inngest service code, existing `yaml` parser dependency.

---

## Current Findings Map

- WI-90 / DS-001: `.github/actions/claude-review/action.yml` still uses `anthropics/claude-code-action@v1`.
- WI-92, WI-93, WI-96, WI-99, WI-106: most mutable action tags are already fixed on `origin/main`; add a verifier so this cannot regress.
- WI-94: `.github/workflows/claude-code-review.yml` passes Claude OAuth secrets to a local action loaded from the PR checkout.
- WI-98 / WI-102: Doppler and Maestro installers are still remote shell installers. Doppler is version-pinned but not checksum-verified; Maestro is still `curl | bash`.
- WI-101 / WI-103: E2E workflows can run secret-backed test code from PR-controlled checkouts.
- WI-108: `ask-gate-observe.ts` logs raw `reason` text from LLM-derived depth decisions.
- WI-223: `gemini.ts` puts the API key in the request URL query string.

## Files

- Create: `scripts/check-github-workflow-security.ts`
- Create: `scripts/check-github-workflow-security.test.ts`
- Modify: `package.json`
- Modify: `.github/actions/claude-review/action.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/claude-code-review.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/e2e-ci.yml`
- Modify: `.github/workflows/e2e-web.yml`
- Modify: `.github/workflows/mobile-ci.yml`
- Modify: `apps/api/src/inngest/functions/ask-gate-observe.ts`
- Modify: `apps/api/src/inngest/functions/ask-gate-observe.test.ts`
- Modify: `apps/api/src/services/llm/providers/gemini.ts`
- Modify: `apps/api/src/services/llm/providers/gemini.test.ts`

---

### Task 1: Add Workflow Security Verifier

**Files:**
- Create: `scripts/check-github-workflow-security.ts`
- Create: `scripts/check-github-workflow-security.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing verifier tests**

Add tests that build temporary `.github/` fixtures and assert these cases:

```ts
it('rejects mutable external action refs', () => {
  writeWorkflow('bad.yml', 'jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n');
  expect(runVerifier()).toContain('actions/checkout@v4 must be pinned to a 40-character SHA');
});

it('rejects local actions that receive secrets in pull_request workflows', () => {
  writeWorkflow(
    'bad-local-secret.yml',
    [
      'on: pull_request',
      'jobs:',
      '  t:',
      '    steps:',
      '      - uses: ./.github/actions/claude-review',
      '        with:',
      '          oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
    ].join('\n'),
  );
  expect(runVerifier()).toContain('local action receives secrets in a pull_request workflow');
});

it('rejects workflow_run jobs that expose secrets to pull_request head code', () => {
  writeWorkflow(
    'bad-workflow-run.yml',
    [
      'on:',
      '  workflow_run:',
      '    workflows: ["CI"]',
      'jobs:',
      '  e2e:',
      '    steps:',
      '      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      '        with:',
      '          ref: ${{ github.event.workflow_run.head_sha }}',
      '      - run: echo "$TEST_SEED_SECRET"',
      '        env:',
      '          TEST_SEED_SECRET: ${{ secrets.TEST_SEED_SECRET }}',
    ].join('\n'),
  );
  expect(runVerifier()).toContain('workflow_run exposes secrets while checking out head_sha');
});

it('rejects curl pipe-to-shell installers without checksum verification', () => {
  writeWorkflow(
    'bad-installer.yml',
    [
      'jobs:',
      '  t:',
      '    steps:',
      '      - run: curl -Ls https://get.maestro.mobile.dev | bash',
    ].join('\n'),
  );
  expect(runVerifier()).toContain('pipe-to-shell installer must be replaced or checksum-verified');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/check-github-workflow-security.test.ts --runInBand
```

Expected: FAIL because `scripts/check-github-workflow-security.ts` does not exist.

- [ ] **Step 3: Implement the minimal verifier**

Implement a TypeScript verifier that:

- Recursively scans `.github/workflows/*.{yml,yaml}` and `.github/actions/**/action.{yml,yaml}`.
- Parses YAML with the existing `yaml` package.
- Walks all step objects.
- Allows local actions with `uses: ./...` in `pull_request` and `pull_request_target` workflows only when no inherited workflow/job `env:`, step `with:`, or step `env:` value references `secrets.`.
- Allows external actions only when the ref after `@` matches `/^[a-f0-9]{40}$/`.
- Rejects `curl ... | sh`, `curl ... | bash`, `wget ... | sh`, and `wget ... | bash`.
- Rejects workflows triggered by `workflow_run` when a job both checks out `github.event.workflow_run.head_sha` and has any `secrets.` reference in inherited workflow/job `env:`, step `with:`, or step `env:` unless the job has a strict positive skip-output guard.

Expose a pure helper for tests:

```ts
export function checkGithubWorkflowSecurity(rootDir: string): Violation[] {
  // return { file, message } objects; CLI prints and exits 1 when non-empty
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/check-github-workflow-security.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Wire the verifier into package scripts and CI**

Add:

```json
"check:github-workflow-security": "tsx scripts/check-github-workflow-security.ts"
```

Add a fast-fail step to `.github/workflows/ci.yml` before `scripts/* tests`:

```yaml
- name: GitHub workflow supply-chain check
  run: pnpm run check:github-workflow-security
```

- [ ] **Step 6: Run verifier on current repo and verify RED**

Run:

```bash
pnpm run check:github-workflow-security
```

Expected: FAIL on current WI-83 findings, including `anthropics/claude-code-action@v1`, local Claude review action receiving secrets, PR/workflow_run secret exposure, and pipe-to-shell installers.

---

### Task 2: Harden Claude Review Workflow and Action Pinning

**Files:**
- Modify: `.github/actions/claude-review/action.yml`
- Modify: `.github/workflows/claude-code-review.yml`

- [ ] **Step 1: Pin the composite action's external action**

Change:

```yaml
- uses: anthropics/claude-code-action@v1
```

to the same pinned SHA already used by `.github/workflows/claude.yml`:

```yaml
- uses: anthropics/claude-code-action@20c8abf165d5f85ab3fc970db9498436377dc9d1 # v1
```

- [ ] **Step 2: Load Claude review action code from trusted base, not PR checkout**

In `.github/workflows/claude-code-review.yml`, keep the normal PR checkout for review context, but add a second checkout of the base ref into `.trusted-actions`:

```yaml
- name: Checkout trusted base action definitions
  uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
  with:
    ref: ${{ github.event.pull_request.base.sha }}
    path: .trusted-actions
    fetch-depth: 1
```

Change each fallback step from:

```yaml
uses: ./.github/actions/claude-review
```

to:

```yaml
uses: ./.trusted-actions/.github/actions/claude-review
```

This keeps the action logic from the reviewed base branch while the workspace still contains the PR checkout for `gh pr diff` and file reads.

- [ ] **Step 3: Run verifier and targeted YAML grep**

Run:

```bash
pnpm run check:github-workflow-security
rg -n "claude-code-action@v1|uses: \./\.github/actions/claude-review" .github
```

Expected: verifier still may fail on later tasks, but no Claude mutable-action or local-secret finding remains; `rg` has no matches.

---

### Task 3: Remove Secret-Backed PR-Code Execution from E2E Workflows

**Files:**
- Modify: `.github/workflows/e2e-ci.yml`
- Modify: `.github/workflows/e2e-web.yml`

- [ ] **Step 1: Make `e2e-ci.yml` skip PR-origin `workflow_run` executions**

At the start of the `Analyze changed file types` script, before diffing, add:

```bash
if [ "${{ github.event_name }}" = "workflow_run" ] && [ "${{ github.event.workflow_run.event }}" = "pull_request" ]; then
  echo "run-api-e2e=false" >> "$GITHUB_OUTPUT"
  echo "run-mobile-e2e=false" >> "$GITHUB_OUTPUT"
  echo "Skipping secret-backed E2E for pull_request workflow_run; use workflow_dispatch after review."
  exit 0
fi
```

This prevents the later `mobile-maestro` job from writing `TEST_SEED_SECRET` into `.dev.vars` while executing PR head code.

- [ ] **Step 2: Make `e2e-web.yml` skip pull_request secret-backed Playwright**

At the start of `Check for relevant file changes`, before reading changed files, add:

```bash
if [[ "${{ github.event_name }}" == "pull_request" ]]; then
  echo "should-run=false" >> "$GITHUB_OUTPUT"
  echo "Secret-backed Playwright smoke is disabled on pull_request; use workflow_dispatch after review."
  exit 0
fi
```

The existing required `smoke` aggregate job still reports success with the already-supported skipped path.

- [ ] **Step 3: Run verifier**

Run:

```bash
pnpm run check:github-workflow-security
```

Expected: no PR/workflow_run secret-exposure findings remain; installer findings may remain until Task 4.

---

### Task 4: Replace Pipe-to-Shell Installers

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/e2e-web.yml`
- Modify: `.github/workflows/mobile-ci.yml`

- [ ] **Step 1: Replace Doppler installer steps with SHA-pinned release install**

Use a shell block that downloads a fixed release asset from `DopplerHQ/cli`, verifies it against an in-repo SHA256 value, then installs the binary. The implementation must include `sha256sum -c` in the step so the verifier can prove the safety property.

Expected shape:

```bash
DOPPLER_VERSION="3.76.0"
DOPPLER_ARCHIVE="doppler_${DOPPLER_VERSION}_linux_amd64.tar.gz"
DOPPLER_SHA256="04f1ff30ed162d7af1dba7f11ad6a37ef35099de86a7ec6e261b64b1b337a3f3"
curl -fsSLO "https://github.com/DopplerHQ/cli/releases/download/${DOPPLER_VERSION}/${DOPPLER_ARCHIVE}"
echo "${DOPPLER_SHA256}  ${DOPPLER_ARCHIVE}" | sha256sum -c -
sudo tar -xzf "${DOPPLER_ARCHIVE}" -C /usr/local/bin doppler
doppler --version
```

Apply to:

- `.github/workflows/deploy.yml` secret sync step.
- `.github/workflows/e2e-web.yml` install Doppler step.

- [ ] **Step 2: Replace Maestro pipe installer with checksum-verified release**

Replace:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

with the GitHub release asset and published checksum for `cli-2.5.1`:

```bash
MAESTRO_VERSION="cli-2.5.1"
curl -fsSLO "https://github.com/mobile-dev-inc/Maestro/releases/download/${MAESTRO_VERSION}/maestro.zip"
curl -fsSLO "https://github.com/mobile-dev-inc/Maestro/releases/download/${MAESTRO_VERSION}/checksums_sha256.txt"
grep " maestro.zip$" checksums_sha256.txt | sha256sum -c -
unzip -q maestro.zip -d "$HOME/.maestro"
echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

- [ ] **Step 3: Run verifier and grep**

Run:

```bash
pnpm run check:github-workflow-security
rg -n "curl .*\\| *(bash|sh)|wget .*\\| *(bash|sh)" .github/workflows
```

Expected: verifier passes for installer rules; `rg` has no unsafe pipe-to-shell matches.

---

### Task 5: Scrub Ask-Gate Free-Text Reason Logging

**Files:**
- Modify: `apps/api/src/inngest/functions/ask-gate-observe.test.ts`
- Modify: `apps/api/src/inngest/functions/ask-gate-observe.ts`

- [ ] **Step 1: Write failing log-scrubbing test**

Add:

```ts
it('[BREAK / WI-108] does not log raw LLM-derived reason text', async () => {
  await invoke(askGateDecisionObserve, {
    sessionId: 'sess-sensitive',
    meaningful: true,
    reason: 'The learner said my email is parent@example.com and token=secret',
    method: 'llm',
    exchangeCount: 5,
    learnerWordCount: 120,
    topicCount: 2,
  });

  const entry = lastJsonLine(consoleLogSpy);
  expect(entry?.message).toBe('ask.gate_decision.received');
  expect(JSON.stringify(entry)).not.toContain('parent@example.com');
  expect(JSON.stringify(entry)).not.toContain('token=secret');
  expect(entry?.context).toMatchObject({
    reasonPresent: true,
    reasonLength: 64,
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/ask-gate-observe.test.ts --runInBand --no-coverage
```

Expected: FAIL because the current logger context includes `reason`.

- [ ] **Step 3: Replace raw reason logging with metadata**

In `ask-gate-observe.ts`, add a helper:

```ts
function summarizeReason(reason: string | undefined) {
  return {
    reasonPresent: typeof reason === 'string' && reason.length > 0,
    reasonLength: typeof reason === 'string' ? reason.length : 0,
  };
}
```

Replace `reason: data.reason ?? null` in the info log with `...summarizeReason(data.reason)`. Keep raw schema-drift payload fields out of return values, logs, and Sentry extras; expose only payload shape metadata plus the reason summary.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/ask-gate-observe.test.ts --runInBand --no-coverage
```

Expected: PASS.

---

### Task 6: Move Gemini API Key Out of URLs

**Files:**
- Modify: `apps/api/src/services/llm/providers/gemini.test.ts`
- Modify: `apps/api/src/services/llm/providers/gemini.ts`

- [ ] **Step 1: Write failing API-key placement tests**

Update the existing URL assertions and add explicit negative checks:

```ts
expect(url).toContain('gemini-2.5-flash:generateContent');
expect(url).not.toContain(TEST_API_KEY);
expect(url).not.toContain('key=');
expect(options.headers).toMatchObject({
  'Content-Type': 'application/json',
  'x-goog-api-key': TEST_API_KEY,
});
```

Add the same check for `chatStream()`:

```ts
const [url, options] = fetchSpy.mock.calls[0];
expect(url).toContain('streamGenerateContent?alt=sse');
expect(url).not.toContain(TEST_API_KEY);
expect(url).not.toContain('key=');
expect(options.headers).toMatchObject({
  'x-goog-api-key': TEST_API_KEY,
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/llm/providers/gemini.test.ts --runInBand --no-coverage
```

Expected: FAIL because the URL currently contains `?key=${apiKey}`.

- [ ] **Step 3: Update Gemini fetch calls**

Change chat URL:

```ts
const url = `${GEMINI_BASE_URL}/${config.model}:generateContent`;
```

Change stream URL:

```ts
const url = `${GEMINI_BASE_URL}/${config.model}:streamGenerateContent?alt=sse`;
```

Add the API key header in both fetch calls:

```ts
headers: {
  'Content-Type': 'application/json',
  'x-goog-api-key': apiKey,
},
```

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/llm/providers/gemini.test.ts --runInBand --no-coverage
```

Expected: PASS.

---

### Task 7: Final Local Verification Before Commit

**Files:** all touched files.

- [ ] **Step 1: Run focused tests**

```bash
pnpm exec jest --config scripts/jest.config.cjs scripts/check-github-workflow-security.test.ts --runInBand
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/ask-gate-observe.test.ts apps/api/src/services/llm/providers/gemini.test.ts --runInBand --no-coverage
pnpm run check:github-workflow-security
```

Expected: all pass.

- [ ] **Step 2: Run API lint/typecheck because API source changed**

```bash
pnpm exec nx run api:lint
pnpm exec nx run api:typecheck
```

Expected: pass.

- [ ] **Step 3: Run script tests because scripts changed**

```bash
pnpm exec jest --config scripts/jest.config.cjs --no-coverage
```

Expected: pass.

- [ ] **Step 4: Run change-class advisory**

```bash
bash scripts/check-change-class.sh --run
```

Expected: pass or produce only advisory output that is satisfied by the commands above.

- [ ] **Step 5: Commit with WI IDs and Verified By table**

Use `/commit` semantics via the commit skill. Commit subject should include the package ID:

```text
fix(ci): harden WI-83 supply-chain gates
```

Body must list at least WI-90, WI-94, WI-98, WI-101, WI-102, WI-103, WI-108, WI-223 and include a non-empty `Verified By` table.

---

## Plan Self-Review

- Spec coverage: all 13 WI-83 children are covered either by direct code changes or by the workflow verifier sweep. Already-fixed mutable action pins are protected by the new verifier so WI-92/WI-93/WI-96/WI-99/WI-106 cannot regress.
- Placeholder scan: no placeholder markers remain. Doppler uses the `3.76.0` release asset plus `checksums.txt`; Maestro uses the `cli-2.5.1` release asset plus `checksums_sha256.txt`.
- Type consistency: new script exports `checkGithubWorkflowSecurity(rootDir): Violation[]`; tests and package script call that same surface.
