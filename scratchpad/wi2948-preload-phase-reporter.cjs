#!/usr/bin/env node

const { appendFileSync } = require('node:fs');

function recordPhase(phase) {
  const phaseFile = process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE;
  if (!phaseFile) return;

  try {
    appendFileSync(phaseFile, `${phase}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    throw new Error('Playwright preload phase recording failed');
  }
}

class PreloadPhaseReporter {
  constructor() {
    recordPhase('reporter-ready');
  }

  onBegin(_config, suite) {
    if (suite.allTests().length > 0) {
      recordPhase('tests-discovered');
    }
  }

  onTestBegin() {
    recordPhase('setup-test-begin');
  }

  printsToStdio() {
    return false;
  }
}

module.exports = PreloadPhaseReporter;
