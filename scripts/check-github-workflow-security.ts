import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

export interface Violation {
  file: string;
  message: string;
}

const SHA_REF = /^[a-f0-9]{40}$/;
const YAML_FILE = /\.ya?ml$/;
const SECRET_REFERENCE = /secrets\s*(\.|\[)/;

function listYamlFiles(rootDir: string, relativeDir: string): string[] {
  const absDir = join(rootDir, relativeDir);
  if (!existsSync(absDir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(absDir)) {
    const absPath = join(absDir, entry);
    const relPath = relative(rootDir, absPath);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      files.push(...listYamlFiles(rootDir, relPath));
      continue;
    }
    if (YAML_FILE.test(entry)) {
      files.push(relPath);
    }
  }
  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? '');
}

function containsSecretReference(value: unknown): boolean {
  return SECRET_REFERENCE.test(stringify(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unwrapGithubExpression(value: string): string {
  const trimmed = value.trim();
  const expression = trimmed.match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/);
  return (expression?.[1] ?? trimmed).trim();
}

function getWorkflowOn(parsed: Record<string, unknown>): unknown {
  // The `yaml` package uses YAML 1.2 by default where `on` remains a string.
  // Keep the boolean fallback for portability if parser options change.
  return parsed.on ?? parsed.true;
}

function hasEvent(workflowOn: unknown, eventName: string): boolean {
  if (typeof workflowOn === 'string') return workflowOn === eventName;
  if (Array.isArray(workflowOn)) return workflowOn.includes(eventName);
  if (isRecord(workflowOn)) return Object.hasOwn(workflowOn, eventName);
  return false;
}

function getSteps(container: unknown): Record<string, unknown>[] {
  if (!isRecord(container)) return [];
  const steps = container.steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter(isRecord);
}

function getJobEntries(parsed: Record<string, unknown>) {
  if (!isRecord(parsed.jobs)) return [];
  return Object.entries(parsed.jobs).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
  );
}

function collectPullRequestSkipOutputs(
  jobs: [string, Record<string, unknown>][],
): Set<string> {
  const outputs = new Set<string>();

  for (const [jobId, job] of jobs) {
    if (!isRecord(job.outputs)) continue;
    const jobText = stringify(job);
    if (
      !jobText.includes('github.event.workflow_run.event') ||
      !jobText.includes('pull_request') ||
      !jobText.includes('GITHUB_OUTPUT')
    ) {
      continue;
    }

    for (const outputName of Object.keys(job.outputs)) {
      if (jobText.includes(`${outputName}=false`)) {
        outputs.add(`needs.${jobId}.outputs.${outputName}`);
      }
    }
  }

  return outputs;
}

function isLocalAction(uses: string): boolean {
  return uses.startsWith('./') || uses.startsWith('../');
}

function isTrustedBaseAction(uses: string): boolean {
  return uses.startsWith('./.trusted-actions/');
}

function isExternalAction(uses: string): boolean {
  return !isLocalAction(uses) && !uses.startsWith('docker://');
}

function validateActionRef(file: string, step: Record<string, unknown>) {
  const uses = step.uses;
  if (typeof uses !== 'string' || !isExternalAction(uses)) return null;

  const atIndex = uses.lastIndexOf('@');
  if (atIndex === -1) {
    return {
      file,
      message: `${uses} must be pinned to a 40-character SHA`,
    };
  }

  const ref = uses.slice(atIndex + 1);
  if (!SHA_REF.test(ref)) {
    return {
      file,
      message: `${uses} must be pinned to a 40-character SHA`,
    };
  }

  return null;
}

function validatePipeToShell(file: string, step: Record<string, unknown>) {
  const run = step.run;
  if (typeof run !== 'string') return null;

  const pipesToShell = /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?(ba)?sh\b/.test(
    run,
  );
  if (!pipesToShell) return null;

  return {
    file,
    message: 'pipe-to-shell installer must be replaced or checksum-verified',
  };
}

function validateLocalSecretAction(
  file: string,
  step: Record<string, unknown>,
  pullRequestWorkflow: boolean,
  inheritedSecrets: boolean,
) {
  if (!pullRequestWorkflow) return null;
  const uses = step.uses;
  if (typeof uses !== 'string' || !isLocalAction(uses)) return null;
  if (isTrustedBaseAction(uses)) return null;
  if (
    !inheritedSecrets &&
    !containsSecretReference(step.with) &&
    !containsSecretReference(step.env)
  ) {
    return null;
  }

  return {
    file,
    message: 'local action receives secrets in a pull_request workflow',
  };
}

// A secret-bearing workflow_run job that checks out head_sha must carry its
// OWN fork-exclusion clause, not rely solely on an upstream job's skip output.
// Either of these self-contained conditions defends the job in depth:
//   - github.event.workflow_run.event != 'pull_request'
//   - github.event.workflow_run.head_repository.full_name == github.repository
function hasSelfContainedForkExclusion(jobIf: string): boolean {
  const normalized = jobIf.replace(/\s+/g, '');
  return (
    /github\.event\.workflow_run\.event!=['"]pull_request['"]/.test(
      normalized,
    ) ||
    /github\.event\.workflow_run\.head_repository\.full_name==github\.repository/.test(
      normalized,
    )
  );
}

function validateWorkflowRunJob(
  file: string,
  workflowRun: boolean,
  job: Record<string, unknown>,
  inheritedSecrets: boolean,
  pullRequestSkipOutputs: Set<string>,
): { file: string; message: string } | null {
  if (!workflowRun) return null;
  const jobText = stringify(job);
  if (
    jobText.includes('github.event.workflow_run.head_sha') &&
    (inheritedSecrets || containsSecretReference(job))
  ) {
    const jobIf = unwrapGithubExpression(stringify(job.if));
    // A *valid* skip-output gate is an exact `output == 'true'` condition. The
    // anchoring matters: `always() || output == 'true'` is bypassable (the
    // always() short-circuits the OR), so it is NOT a valid skip-output gate
    // and falls through to the generic secrets-exposure message below.
    const gatedByPullRequestSkipOutput = [...pullRequestSkipOutputs].some(
      (output) =>
        new RegExp(`^${escapeRegExp(output)}\\s*==\\s*['"]true['"]$`).test(
          jobIf,
        ),
    );

    // Defense in depth: a secret-bearing job must guard itself, even if an
    // upstream skip-output also gates it. A sole upstream-output gate is a
    // single point of failure — if that job's output logic regresses, the
    // secret-backed job runs fork PR code. Require a self-contained
    // fork-exclusion clause in this job's own `if`.
    if (hasSelfContainedForkExclusion(jobIf)) {
      return null;
    }

    if (gatedByPullRequestSkipOutput) {
      return {
        file,
        message:
          'secret-bearing workflow_run job relies solely on an upstream skip output; add a self-contained fork-exclusion guard (workflow_run.event != pull_request or head_repository.full_name == github.repository)',
      };
    }

    return {
      file,
      message: 'workflow_run exposes secrets while checking out head_sha',
    };
  }
  return null;
}

// Steps that read PR/issue comments and parse a review verdict marker out of
// them must constrain the comment author to a trusted bot identity. Otherwise a
// PR author can post a comment carrying the verdict marker and forge the gate's
// source of truth.
const COMMENT_FETCH =
  /gh\s+api[^\n]*\/comments|gh\s+pr\s+view[^\n]*--json[^\n]*comments/;
const VERDICT_MARKER =
  /Claude Code Review:|## Claude Code Review|verdict|Must-fix count|Should-fix count/i;
// A bot/trusted-author constraint anchored to a real jq enforcement: a `[bot]`
// login equality or a Bot user-type equality. A bare `author_association`
// mention is intentionally NOT accepted here — it could be satisfied by a no-op
// comment or unrelated echo without any enforcement, and the verdict gate is
// jq-based on `.user.login` anyway.
const TRUSTED_AUTHOR_CONSTRAINT =
  /\.user\.login\s*==\s*['"][^'"]*\[bot\]['"]|\.user\.type\s*==\s*['"]Bot['"]/;

function validateVerdictGateAuthorFilter(
  file: string,
  step: Record<string, unknown>,
): { file: string; message: string } | null {
  const run = step.run;
  if (typeof run !== 'string') return null;
  if (!COMMENT_FETCH.test(run)) return null;
  if (!VERDICT_MARKER.test(run)) return null;
  if (TRUSTED_AUTHOR_CONSTRAINT.test(run)) return null;

  return {
    file,
    message:
      'verdict gate parses comments without constraining the comment author to a trusted bot identity (forgeable verdict)',
  };
}

// A job that invokes the secret-backed Claude agent on an `@claude` mention
// from issue/PR comment/review events must also gate on a trusted
// author_association, or any external account can trigger the secret-backed
// path by mentioning @claude.
const CLAUDE_AGENT_SECRET =
  /claude-code-action|CLAUDE_CODE_OAUTH_TOKEN|claude_code_oauth_token/;
const CLAUDE_MENTION_GATE = /contains\([^)]*,\s*['"]@claude['"]\)/;
const CLAUDE_CODE_ACTION = /^anthropics\/claude-code-action@/;

function validateClaudeAgentTriggerGuard(
  file: string,
  agentTriggerWorkflow: boolean,
  job: Record<string, unknown>,
  inheritedSecrets: boolean,
): { file: string; message: string } | null {
  if (!agentTriggerWorkflow) return null;
  const jobText = stringify(job);
  if (!(inheritedSecrets || CLAUDE_AGENT_SECRET.test(jobText))) return null;

  const jobIf = stringify(job.if);
  if (!CLAUDE_MENTION_GATE.test(jobIf)) return null;
  // A bare `author_association` substring is not enough — it must be a real
  // field reference (github.event.<obj>.author_association) wired into an
  // enforcement construct (allowlist membership via fromJSON, or an equality).
  // A literal-string mention or a no-op comment would otherwise satisfy the
  // guard without enforcing anything.
  const referencesAuthorAssociationField =
    /github\.event\.[a-z_.]*author_association/.test(jobIf);
  const enforcesAuthorAssociation =
    referencesAuthorAssociationField &&
    /fromJSON\s*\(|author_association\s*==|==[^=]*author_association/.test(
      jobIf,
    );
  if (enforcesAuthorAssociation) {
    return null;
  }

  return {
    file,
    message:
      '@claude secret-backed agent must gate on a trusted author_association',
  };
}

function jobGrantsIdTokenWrite(job: Record<string, unknown>): boolean {
  if (!isRecord(job.permissions)) return false;
  return job.permissions['id-token'] === 'write';
}

function stepProvidesGithubToken(step: Record<string, unknown>): boolean {
  if (!isRecord(step.with)) return false;
  return (
    typeof step.with.github_token === 'string' &&
    step.with.github_token.trim() !== ''
  );
}

function validateClaudeCodeActionOidcPermission(
  file: string,
  job: Record<string, unknown>,
  step: Record<string, unknown>,
): { file: string; message: string } | null {
  const uses = step.uses;
  if (typeof uses !== 'string' || !CLAUDE_CODE_ACTION.test(uses)) return null;
  if (stepProvidesGithubToken(step)) return null;
  if (jobGrantsIdTokenWrite(job)) return null;

  return {
    file,
    message:
      'Claude Code action using default GitHub App auth must grant id-token: write',
  };
}

function collectFileViolations(rootDir: string, file: string): Violation[] {
  const raw = readFileSync(join(rootDir, file), 'utf8');
  const violations: Violation[] = [];
  let parsed: unknown;

  try {
    parsed = parse(raw);
  } catch (error) {
    return [
      {
        file,
        message: `failed to parse YAML: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ];
  }

  if (!isRecord(parsed)) return violations;

  const workflowOn = getWorkflowOn(parsed);
  const pullRequestWorkflow =
    hasEvent(workflowOn, 'pull_request') ||
    hasEvent(workflowOn, 'pull_request_target');
  const workflowRun = hasEvent(workflowOn, 'workflow_run');
  const agentTriggerWorkflow =
    hasEvent(workflowOn, 'issue_comment') ||
    hasEvent(workflowOn, 'issues') ||
    hasEvent(workflowOn, 'pull_request_review') ||
    hasEvent(workflowOn, 'pull_request_review_comment');
  const jobs = getJobEntries(parsed);
  const pullRequestSkipOutputs = collectPullRequestSkipOutputs(jobs);
  const workflowEnvHasSecrets = containsSecretReference(parsed.env);

  for (const step of getSteps((parsed.runs as Record<string, unknown>) ?? {})) {
    const actionViolation = validateActionRef(file, step);
    if (actionViolation) violations.push(actionViolation);
    const pipeViolation = validatePipeToShell(file, step);
    if (pipeViolation) violations.push(pipeViolation);
  }

  for (const [, job] of jobs) {
    const inheritedSecrets =
      workflowEnvHasSecrets || containsSecretReference(job.env);
    const jobUsesViolation = validateActionRef(file, job);
    if (jobUsesViolation) violations.push(jobUsesViolation);

    const workflowRunViolation = validateWorkflowRunJob(
      file,
      workflowRun,
      job,
      inheritedSecrets,
      pullRequestSkipOutputs,
    );
    if (workflowRunViolation) violations.push(workflowRunViolation);

    const claudeAgentViolation = validateClaudeAgentTriggerGuard(
      file,
      agentTriggerWorkflow,
      job,
      inheritedSecrets,
    );
    if (claudeAgentViolation) violations.push(claudeAgentViolation);

    for (const step of getSteps(job)) {
      const actionViolation = validateActionRef(file, step);
      if (actionViolation) violations.push(actionViolation);

      const localSecretViolation = validateLocalSecretAction(
        file,
        step,
        pullRequestWorkflow,
        inheritedSecrets,
      );
      if (localSecretViolation) violations.push(localSecretViolation);

      const pipeViolation = validatePipeToShell(file, step);
      if (pipeViolation) violations.push(pipeViolation);

      const verdictGateViolation = validateVerdictGateAuthorFilter(file, step);
      if (verdictGateViolation) violations.push(verdictGateViolation);

      const claudeCodeOidcViolation = validateClaudeCodeActionOidcPermission(
        file,
        job,
        step,
      );
      if (claudeCodeOidcViolation) violations.push(claudeCodeOidcViolation);
    }
  }

  return violations;
}

export function checkGithubWorkflowSecurity(rootDir: string): Violation[] {
  const files = [
    ...listYamlFiles(rootDir, '.github/workflows'),
    ...listYamlFiles(rootDir, '.github/actions'),
  ];

  return files.flatMap((file) => collectFileViolations(rootDir, file));
}

if (require.main === module) {
  const violations = checkGithubWorkflowSecurity(process.cwd());
  if (violations.length > 0) {
    console.error('GitHub workflow security check failed:');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.message}`);
    }
    process.exit(1);
  }
  console.log('GitHub workflow security check passed.');
}
