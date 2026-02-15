#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return '';
  }
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function findWorkspaceRoot() {
  // Assume script is run from workspace root; else climb up until package.json exists
  let dir = process.cwd();
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function parseExceptions(md) {
  const rules = new Set();
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/\brule\s*:\s*([A-Z0-9_\-]+)/i);
    if (m) rules.add(m[1].toUpperCase());
  }
  return rules;
}

function getChangedFiles(base = 'main') {
  // In GitHub Actions PR context, use the base ref environment variable
  if (process.env.GITHUB_BASE_REF) {
    base = `origin/${process.env.GITHUB_BASE_REF}`;
  }

  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean);
  } catch (error) {
    // In CI, base branch might not be available - silently skip
    if (!process.env.CI) {
      console.error('Warning: Unable to get changed files via git diff');
    }
    try {
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return staged.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

function getChangedFeatureDirs(changedFiles) {
  const p2 = (f) => f.replace(/\\/g, '/');
  const isMaterial = (file) => {
    const p = p2(file);
    if (!p.startsWith('specs/')) return false;
    const parts = p.split('/');
    if (parts.length < 3) return false;
    const rest = parts.slice(2);
    const fileName = rest[rest.length - 1];
    if (fileName === 'research.md' || fileName === 'research-validation.md' || fileName === 'exceptions.md') return false;
    if (rest.length === 1 && (fileName === 'plan.md' || fileName === 'spec.md' || fileName === 'quickstart.md')) return true;
    if (rest.length >= 2) {
      const firstDir = rest[0];
      if ((firstDir === 'contracts' || firstDir === 'data-model') && fileName.endsWith('.md')) return true;
    }
    return false;
  };
  const dirs = new Set();
  changedFiles.forEach((f) => {
    if (isMaterial(f)) {
      const feature = p2(f).split('/')[1];
      dirs.add(`specs/${feature}`);
    }
  });
  return Array.from(dirs);
}

function getLatestFeatureDir(root) {
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return null;
  const entries = fs.readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{3}-.+/.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => parseInt(b.slice(0, 3), 10) - parseInt(a.slice(0, 3), 10));
  return entries.length ? `specs/${entries[0]}` : null;
}

function main() {
  const root = findWorkspaceRoot();
  const govIndexPath = path.join(root, 'governance', 'index.json');
  const govIndex = loadJson(govIndexPath);
  if (!govIndex) {
    console.error(JSON.stringify({ status: 'fail', error: `Missing or invalid governance index at ${govIndexPath}` }, null, 2));
    process.exit(1);
  }

  const artifacts = govIndex.artifacts || {};
  const planPath = path.join(root, artifacts.plan || '');
  const specPath = path.join(root, artifacts.spec || '');
  const tasksPath = path.join(root, artifacts.tasks || '');

  const envExample = readIfExists(path.join(root, '.env.example'));
  const drizzleConfig = readIfExists(path.join(root, 'packages', 'database', 'drizzle.config.ts'));
  const apiJestConfig = readIfExists(path.join(root, 'apps', 'api', 'jest.config.ts'));
  const mobilePkgJson = loadJson(path.join(root, 'apps', 'mobile', 'package.json')) || {};

  // Global exceptions docket (project-level)
  const exceptionsMd = readIfExists(path.join(root, 'specs', 'exceptions.md'));
  const exceptions = parseExceptions(exceptionsMd);

  const violations = [];
  const waived = [];

  // Phase detection (simple default); allow override via env
  const phase = process.env.GOV_PHASE?.toLowerCase() || 'phase1';

  // Rule: Phase 1 DB URL must be direct (no pgbouncer, no DIRECT_URL)
  if (phase === 'phase1') {
    if (/pgbouncer/i.test(envExample) || /DIRECT_URL\s*=/.test(envExample)) {
      const v = { rule: 'PHASE1_DB_URL', file: '.env.example', message: 'Phase 1: direct PostgreSQL (5432); no pgbouncer params or DIRECT_URL' };
      (exceptions.has(v.rule) ? waived : violations).push(v);
    }
  }

  // Rule: Drizzle config must use DATABASE_URL (not hardcoded connection strings)
  if (phase === 'phase1') {
    const hasHardcodedUrl = drizzleConfig
      .split(/\r?\n/)
      .some((line) => /url\s*:\s*['"]postgres/.test(line));
    if (hasHardcodedUrl) {
      const v = { rule: 'DRIZZLE_HARDCODED_URL', file: 'packages/database/drizzle.config.ts', message: 'Phase 1: Drizzle config must use DATABASE_URL env var, not hardcoded strings' };
      (exceptions.has(v.rule) ? waived : violations).push(v);
    }
  }

  // Rule: Phase 1 coverageThreshold should be 10
  if (phase === 'phase1') {
    const dbJestConfig = readIfExists(path.join(root, 'packages', 'database', 'jest.config.cjs'));
    const has10 = /branches\s*:\s*10/.test(dbJestConfig) && /functions\s*:\s*10/.test(dbJestConfig) && /lines\s*:\s*10/.test(dbJestConfig) && /statements\s*:\s*10/.test(dbJestConfig);
    if (!has10) {
      const v = { rule: 'PHASE1_COVERAGE', file: 'packages/database/jest.config.cjs', message: 'Phase 1: coverageThreshold must be 10% (raise later per plan)' };
      (exceptions.has(v.rule) ? waived : violations).push(v);
    }
  }

  // Feature discovery for reporting (and future feature-scoped rules)
  const changedFiles = getChangedFiles();
  const changedFeatureDirs = getChangedFeatureDirs(changedFiles);
  const latestFeatureDir = getLatestFeatureDir(root);
  const featureDirsToEvaluate = changedFeatureDirs.length ? changedFeatureDirs : (latestFeatureDir ? [latestFeatureDir] : []);

  const report = {
    status: violations.length ? 'fail' : 'pass',
    phase,
    checked: {
      plan: fs.existsSync(planPath),
      spec: fs.existsSync(specPath),
      tasks: fs.existsSync(tasksPath)
    },
    features: {
      changed: changedFeatureDirs,
      evaluated: featureDirsToEvaluate,
      skippedReason: featureDirsToEvaluate.length ? null : 'no feature folders present'
    },
    violations,
    waived: Array.from(waived)
  };

  if (violations.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  } else {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
}

main();


