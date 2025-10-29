#!/usr/bin/env node

/**
 * Validates that research-validation.md exists when spec documents are modified
 *
 * Usage: node tools/scripts/validate-research.js
 *
 * Checks:
 * 1. Detects changes to specs/**\/(plan|spec|contracts|data-model|quickstart).md
 * 2. For each changed spec directory, checks if research-validation.md exists
 * 3. Fails if research-validation.md is missing
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
  const materialDocPattern =
    /^specs\/([^/]+)\/(plan|spec|contracts|data-model|quickstart)\.md$/;

  changedFiles.forEach((file) => {
    const match = file.match(materialDocPattern);
    if (match) {
      specDirs.add(`specs/${match[1]}`);
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

  affectedSpecDirs.forEach((specDir) => {
    if (!hasResearchValidation(specDir)) {
      missingResearch.push(specDir);
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
      '   1. Run the /speckit.plan command to generate research-validation.md'
    );
    console.error(
      '   2. Or add research-validation.md manually if research was already performed'
    );
    console.error('   3. Ensure Phase 0: MCP Research Gate was completed\n');
    console.error(
      '📖 See: .specify/memory/constitution.md - Principle X (External Validation is Mandatory)\n'
    );
    return 1;
  }

  console.log('✅ All spec directories have research-validation.md\n');
  return 0;
}

// Execute validation
const exitCode = validateResearch();
process.exit(exitCode);
