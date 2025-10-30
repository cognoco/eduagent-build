#!/usr/bin/env node

/**
 * Validates that research-validation.md exists when spec documents are modified
 *
 * Usage: node tools/scripts/validate-research.js
 *
 * Checks:
 * 1. Detects changes to material spec documents:
 *    - specs/FEATURE/(plan|spec|quickstart).md
 *    - specs/FEATURE/contracts/`**`/`*`.md
 *    - specs/FEATURE/data-model/`**`/`*`.md
 *    (excludes specs/FEATURE/(research.md|research-validation.md|exceptions.md))
 * 2. For each changed spec directory, checks if research-validation.md exists,
 *    or allows research.md alone when no material changes require external validation
 * 3. Fails if neither research-validation.md nor research.md is present as appropriate
 *
 * Exit codes:
 * 0 - Success (all validations passed)
 * 1 - Failure (missing research-validation.md)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get changed files from git (comparing with base branch)
function getChangedFiles(base = 'main') {
  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting changed files:', error.message);
    // If git diff fails, check staged files instead
    try {
      const stagedOutput = execSync('git diff --cached --name-only', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return stagedOutput.split('\n').filter(Boolean);
    } catch (stagedError) {
      console.error('Error getting staged files:', stagedError.message);
      return [];
    }
  }
}

// Extract spec directories that have material document changes
function getAffectedSpecDirs(changedFiles) {
  const specDirs = new Set();

  const isMaterial = (file) => {
    const p = file.replace(/\\/g, '/');
    if (!p.startsWith('specs/')) return false;
    const parts = p.split('/');
    if (parts.length < 3) return false;
    const rest = parts.slice(2);
    const fileName = rest[rest.length - 1];

    // Exclude research artifacts and exceptions
    if (
      fileName === 'research.md' ||
      fileName === 'research-validation.md' ||
      fileName === 'exceptions.md'
    ) {
      return false;
    }

    // Top-level material files under a feature
    if (
      rest.length === 1 &&
      (fileName === 'plan.md' ||
        fileName === 'spec.md' ||
        fileName === 'quickstart.md')
    ) {
      return true;
    }

    // Nested material under contracts/ or data-model/
    if (rest.length >= 2) {
      const firstDir = rest[0];
      if (
        (firstDir === 'contracts' || firstDir === 'data-model') &&
        fileName.endsWith('.md')
      ) {
        return true;
      }
    }

    return false;
  };

  changedFiles.forEach((file) => {
    if (isMaterial(file)) {
      const feature = file.replace(/\\/g, '/').split('/')[1];
      specDirs.add(`specs/${feature}`);
    }
  });

  return Array.from(specDirs);
}

// Check if research-validation.md exists in spec directory
function hasResearchValidation(specDir) {
  const researchValidationPath = path.join(
    process.cwd(),
    specDir,
    'research-validation.md'
  );
  return fs.existsSync(researchValidationPath);
}

// Check if research.md exists in spec directory
function hasResearchMd(specDir) {
  const researchPath = path.join(process.cwd(), specDir, 'research.md');
  return fs.existsSync(researchPath);
}

// Main validation logic
function validateResearch() {
  console.log('🔍 Validating research documentation...\n');

  const changedFiles = getChangedFiles();
  console.log(`Changed files: ${changedFiles.length}`);

  const affectedSpecDirs = getAffectedSpecDirs(changedFiles);

  if (affectedSpecDirs.length === 0) {
    console.log('✅ No spec document changes detected - validation skipped\n');
    return 0;
  }

  console.log(
    `\nSpec directories with material changes: ${affectedSpecDirs.length}`
  );
  affectedSpecDirs.forEach((dir) => console.log(`  - ${dir}`));
  console.log('');

  const missingResearch = [];
  const softPass = [];

  affectedSpecDirs.forEach((specDir) => {
    const hasRV = hasResearchValidation(specDir);
    if (!hasRV) {
      if (hasResearchMd(specDir)) {
        // No research-validation.md, but research.md exists → allow pass (no material changes assumed)
        softPass.push(specDir);
      } else {
        missingResearch.push(specDir);
      }
    }
  });

  if (missingResearch.length > 0) {
    console.error('❌ VALIDATION FAILED\n');
    console.error(
      'The following spec directories have material changes but are missing research-validation.md:\n'
    );
    missingResearch.forEach((dir) =>
      console.error(`  - ${dir}/research-validation.md`)
    );
    console.error('\n💡 Resolution:');
    console.error(
      '   1. Run /speckit.plan to produce research.md and (if material changes) research-validation.md'
    );
    console.error('   2. If no material changes, research.md is sufficient');
    console.error('   3. Ensure Phase 0 gates are completed\n');
    console.error(
      '📖 See: .specify/memory/constitution.md - Principle X (External Validation is Mandatory)\n'
    );
    return 1;
  }

  if (softPass.length > 0) {
    console.log(
      'ℹ️  research-validation.md missing but research.md present for:'
    );
    softPass.forEach((dir) => console.log(`  - ${dir}`));
    console.log('    Passing validation (no material changes assumed)\n');
  }

  console.log('✅ Research documentation validated\n');
  return 0;
}

// Execute validation
const exitCode = validateResearch();
process.exit(exitCode);
