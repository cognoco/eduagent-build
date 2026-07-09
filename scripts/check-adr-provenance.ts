// ADR provenance ratchet - MMT-ADR-0000 section II.6.
//
// Forward-only guard for newly added docs/adr/MMT-ADR-*.md files:
//   - a feat(...) commit must not add an ADR unless explicitly allowlisted;
//   - a newly added Accepted ADR must record human Architecture sign-off.
//
// The guard deliberately does not enforce ADR immutability.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.resolve(__dirname, 'adr-provenance-baseline.json');
const ADR_PATH_RE = /^docs\/adr\/MMT-ADR-\d{4}-.+\.md$/;
const FEAT_SUBJECT_RE = /^feat(?:\([^)]+\))?!?:/i;
const STATUS_ACCEPTED_RE =
  /\*\*Status:\*\*\s*Accepted\b|^Status:\s*Accepted\b/im;
const DECIDERS_RE = /\*\*Deciders:\*\*([^#\n\r]*)|^Deciders:\s*([^\n\r]*)/im;
const HUMAN_ARCHITECTURE_RE =
  /\bArchitect\s*\([^)]+\)|\bArchitecture sign-off:\s*(?!pending\b)(?!.*\b(Codex|Claude|agent)\b)/i;
const ALLOW_COMMENT_RE = /\bADR provenance allow:\s*\S+/i;

export type ViolationKind = 'feat_adr_add' | 'accepted_missing_arch_signoff';

export interface AddedAdr {
  file: string;
  body: string;
  subject?: string;
  message?: string;
  commit?: string;
}

export interface BaselineEntry {
  kind: ViolationKind;
  file: string;
  subject?: string;
  reason: string;
  temporary?: boolean;
  expiresAt?: string;
}

export interface Violation {
  kind: ViolationKind;
  file: string;
  subject?: string;
  commit?: string;
  detail: string;
}

interface CommitInfo {
  hash: string;
  subject: string;
  message: string;
}

interface Args {
  accept: boolean;
  base?: string;
  head: string;
  staged: boolean;
  skipSubjectCheck: boolean;
  commitMsgFile?: string;
}

export function isAdrPath(file: string): boolean {
  return ADR_PATH_RE.test(normalizePath(file));
}

export function isFeatSubject(subject: string): boolean {
  return FEAT_SUBJECT_RE.test(subject.trim());
}

export function isAcceptedAdr(body: string): boolean {
  return STATUS_ACCEPTED_RE.test(body);
}

export function getDecidersLine(body: string): string | undefined {
  const match = DECIDERS_RE.exec(body);
  return (match?.[1] ?? match?.[2])?.trim();
}

export function hasHumanArchitectureSignoff(body: string): boolean {
  const deciders = getDecidersLine(body);
  return Boolean(deciders && HUMAN_ARCHITECTURE_RE.test(deciders));
}

export function findViolations(
  addedAdrs: AddedAdr[],
  baseline: BaselineEntry[],
  options: { skipSubjectCheck?: boolean; now?: Date } = {},
): Violation[] {
  const violations: Violation[] = [];

  for (const adr of addedAdrs) {
    if (
      !options.skipSubjectCheck &&
      adr.subject &&
      isFeatSubject(adr.subject) &&
      !isBaselineAllowed(
        {
          kind: 'feat_adr_add',
          file: adr.file,
          subject: adr.subject,
          commit: adr.commit,
          detail:
            'feat(...) commits must not add ADR files; use a dedicated docs(adr) change-set or add the explicit allow-comment plus baseline entry.',
        },
        baseline,
        adr.message,
        options.now,
      )
    ) {
      violations.push({
        kind: 'feat_adr_add',
        file: adr.file,
        subject: adr.subject,
        commit: adr.commit,
        detail:
          'feat(...) commits must not add ADR files; use a dedicated docs(adr) change-set or add the explicit allow-comment plus baseline entry.',
      });
    }

    if (
      isAcceptedAdr(adr.body) &&
      !hasHumanArchitectureSignoff(adr.body) &&
      !isBaselineAllowed(
        {
          kind: 'accepted_missing_arch_signoff',
          file: adr.file,
          detail:
            'Accepted ADRs must record human Architecture sign-off on the Deciders line.',
        },
        baseline,
        adr.message,
        options.now,
      )
    ) {
      violations.push({
        kind: 'accepted_missing_arch_signoff',
        file: adr.file,
        commit: adr.commit,
        detail:
          'Accepted ADRs must record human Architecture sign-off on the Deciders line.',
      });
    }
  }

  return violations;
}

export function collectExistingAcceptedMissingSignoff(): BaselineEntry[] {
  const adrRoot = path.resolve(REPO_ROOT, 'docs/adr');
  if (!fs.existsSync(adrRoot)) return [];

  return walkMarkdown(adrRoot)
    .map((file) => ({
      file: normalizePath(path.relative(REPO_ROOT, file)),
      body: fs.readFileSync(file, 'utf8'),
    }))
    .filter(({ file, body }) => {
      return (
        isAdrPath(file) &&
        isAcceptedAdr(body) &&
        !hasHumanArchitectureSignoff(body)
      );
    })
    .map(({ file }) => ({
      kind: 'accepted_missing_arch_signoff' as const,
      file,
      reason: 'grandfathered pre-guard Accepted ADR',
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function isBaselineAllowed(
  violation: Omit<Violation, 'commit'> & { commit?: string },
  baseline: BaselineEntry[],
  message?: string,
  now = new Date(),
): boolean {
  return baseline.some((entry) => {
    if (!isBaselineEntryActive(entry, now)) return false;
    if (entry.kind !== violation.kind || entry.file !== violation.file) {
      return false;
    }
    if (entry.kind === 'feat_adr_add') {
      return (
        entry.subject === violation.subject &&
        Boolean(message?.match(ALLOW_COMMENT_RE))
      );
    }
    return true;
  });
}

function isBaselineEntryActive(entry: BaselineEntry, now: Date): boolean {
  if (!entry.expiresAt) return true;
  const expiresAt = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt >= now.getTime();
}

function loadBaseline(): BaselineEntry[] {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline at ${BASELINE_PATH} must be a JSON array of ADR provenance entries`,
    );
  }
  return parsed as BaselineEntry[];
}

function writeBaseline(entries: BaselineEntry[]): void {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(entries, null, 2)}\n`,
    'utf8',
  );
}

function collectRangeAddedAdrs(
  base: string | undefined,
  head: string,
): AddedAdr[] {
  const mergeBase = resolveMergeBase(base, head);
  const commits = listCommits(mergeBase, head);
  const addedByCommit = new Map<string, AddedAdr>();

  for (const commit of commits) {
    for (const file of listAddedAdrFilesForCommit(commit.hash)) {
      const body = readFileAtRef(head, file);
      if (body === undefined) continue;
      addedByCommit.set(file, {
        file,
        body,
        subject: commit.subject,
        message: commit.message,
        commit: commit.hash,
      });
    }
  }

  return Array.from(addedByCommit.values()).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
}

function collectStagedAddedAdrs(args: Args): AddedAdr[] {
  const subjectAndMessage = args.commitMsgFile
    ? parseCommitMessage(fs.readFileSync(args.commitMsgFile, 'utf8'))
    : undefined;

  return git([
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=A',
    '--',
    'docs/adr/MMT-ADR-*.md',
  ])
    .split('\n')
    .map((line) => normalizePath(line.trim()))
    .filter((file) => file && isAdrPath(file))
    .map((file) => ({
      file,
      body: git(['show', `:${file}`]),
      subject: subjectAndMessage?.subject,
      message: subjectAndMessage?.message,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function resolveMergeBase(base: string | undefined, head: string): string {
  const candidates = [base, 'origin/main', 'main', 'HEAD~1'].filter(
    Boolean,
  ) as string[];

  for (const candidate of candidates) {
    if (!refExists(candidate)) continue;
    try {
      return git(['merge-base', candidate, head]).trim();
    } catch {
      continue;
    }
  }

  return `${head}~1`;
}

function listCommits(base: string, head: string): CommitInfo[] {
  const hashes = git(['rev-list', '--reverse', `${base}..${head}`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return hashes.map((hash) => {
    const message = git(['log', '--format=%B', '-n', '1', hash]);
    return {
      hash,
      subject: parseCommitMessage(message).subject,
      message,
    };
  });
}

function listAddedAdrFilesForCommit(hash: string): string[] {
  return git([
    'diff-tree',
    '--no-commit-id',
    '--name-only',
    '--diff-filter=A',
    '-r',
    hash,
    '--',
    'docs/adr/MMT-ADR-*.md',
  ])
    .split('\n')
    .map((line) => normalizePath(line.trim()))
    .filter((file) => file && isAdrPath(file));
}

function readFileAtRef(ref: string, file: string): string | undefined {
  try {
    return git(['show', `${ref}:${file}`]);
  } catch {
    return undefined;
  }
}

function parseCommitMessage(message: string): {
  subject: string;
  message: string;
} {
  return {
    subject: message.split(/\r?\n/, 1)[0]?.trim() ?? '',
    message,
  };
}

function refExists(ref: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function walkMarkdown(root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function normalizePath(file: string): string {
  return file.split(path.sep).join('/').replace(/\\/g, '/');
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    accept: false,
    head: 'HEAD',
    staged: false,
    skipSubjectCheck: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    else if (arg === '--accept') args.accept = true;
    else if (arg === '--staged') args.staged = true;
    else if (arg === '--skip-subject-check') args.skipSubjectCheck = true;
    else if (arg === '--base') args.base = argv[++i];
    else if (arg === '--head') args.head = argv[++i] ?? 'HEAD';
    else if (arg === '--commit-msg-file') args.commitMsgFile = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function reportViolations(violations: Violation[]): void {
  process.stderr.write(
    `adr-provenance: ${violations.length} violation(s). See docs/adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md section II.6.\n`,
  );
  for (const violation of violations) {
    const subject = violation.subject ? ` subject="${violation.subject}"` : '';
    const commit = violation.commit
      ? ` commit=${violation.commit.slice(0, 12)}`
      : '';
    process.stderr.write(
      `  - ${violation.kind}: ${violation.file}${subject}${commit}\n    ${violation.detail}\n`,
    );
  }
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));

  if (args.accept) {
    const entries = collectExistingAcceptedMissingSignoff();
    writeBaseline(entries);
    process.stdout.write(
      `adr-provenance: baseline written (${entries.length} grandfathered entries)\n`,
    );
    return 0;
  }

  const baseline = loadBaseline();
  const addedAdrs = args.staged
    ? collectStagedAddedAdrs(args)
    : collectRangeAddedAdrs(args.base, args.head);
  const violations = findViolations(addedAdrs, baseline, {
    skipSubjectCheck: args.skipSubjectCheck,
  });

  if (violations.length === 0) {
    process.stdout.write(
      `adr-provenance: clean (${addedAdrs.length} added ADRs checked)\n`,
    );
    return 0;
  }

  reportViolations(violations);
  return 1;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(
      `adr-provenance: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  }
}
