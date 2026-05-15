'use strict';

// Custom Jest reporter for CI: emits GitHub Actions annotations for failed
// assertions, writes a markdown summary to $GITHUB_STEP_SUMMARY, and prints a
// compact end-of-log failure block. Designed to coexist with the default
// reporter — it does NOT replace per-test PASS/FAIL output.
//
// Activated when CI=true. See docs/superpowers/specs/2026-05-14-ci-failure-readability-design.md.

const fs = require('fs');
const path = require('path');

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function stripAnsi(s) {
  return typeof s === 'string' ? s.replace(ANSI, '') : '';
}

function relPath(p, rootDir) {
  if (!p) return '';
  try {
    return path.relative(rootDir || process.cwd(), p).replace(/\\/g, '/');
  } catch {
    return p;
  }
}

// Pull the first useful line out of a Jest failureMessage. The default format
// is multiple paragraphs; we want a single concise line for annotations.
function firstFailureLine(failureMessage) {
  const cleaned = stripAnsi(failureMessage || '').split('\n');
  for (const raw of cleaned) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('●')) continue; // header bullet
    if (line.startsWith('at ')) continue; // stack frame
    return line.slice(0, 240);
  }
  return 'Test failed';
}

// Find the first stack frame inside the project (rootDir) so the annotation
// points at the assertion in test code, not jest internals.
function locateAssertion(failureMessage, rootDir) {
  const text = stripAnsi(failureMessage || '');
  const re = /\((?:[A-Za-z]:)?([^():]+):(\d+):(\d+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const file = m[1];
    if (!file) continue;
    const abs = path.isAbsolute(file) ? file : path.join(rootDir || process.cwd(), file);
    const rel = relPath(abs, rootDir);
    if (rel.startsWith('..') || rel.startsWith('node_modules')) continue;
    return { file: rel, line: Number(m[2]), col: Number(m[3]) };
  }
  return null;
}

// GitHub Actions multi-line annotation messages need newlines URL-encoded.
function gaEscape(s) {
  return String(s)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

class CiReporter {
  constructor(globalConfig, _options) {
    this.rootDir = globalConfig && globalConfig.rootDir ? globalConfig.rootDir : process.cwd();
    this.failures = [];
  }

  onTestResult(_test, testResult) {
    if (!testResult || !Array.isArray(testResult.testResults)) return;
    const fileRel = relPath(testResult.testFilePath, this.rootDir);

    for (const r of testResult.testResults) {
      if (r.status !== 'failed') continue;
      const failureMessage = (r.failureMessages || []).join('\n');
      const loc = locateAssertion(failureMessage, this.rootDir) || { file: fileRel, line: 1, col: 1 };
      const title = [...(r.ancestorTitles || []), r.title].filter(Boolean).join(' › ');
      const message = firstFailureLine(failureMessage);
      const entry = { file: loc.file, line: loc.line, col: loc.col, title, message };
      this.failures.push(entry);

      // GitHub Actions inline annotation on the PR diff.
      console.log(
        `::error file=${gaEscape(entry.file)},line=${entry.line},col=${entry.col},title=${gaEscape(title || 'Jest failure')}::${gaEscape(message)}`
      );
    }

    // Surface load-time errors (e.g. SyntaxError, missing module) that Jest
    // reports as testExecError without per-test entries.
    if (testResult.testExecError) {
      const failureMessage = String(testResult.testExecError.stack || testResult.testExecError.message || '');
      const loc = locateAssertion(failureMessage, this.rootDir) || { file: fileRel, line: 1, col: 1 };
      const message = firstFailureLine(failureMessage);
      const entry = { file: loc.file, line: loc.line, col: loc.col, title: 'load error', message };
      this.failures.push(entry);
      console.log(
        `::error file=${gaEscape(entry.file)},line=${entry.line},col=${entry.col},title=${gaEscape('Jest load error')}::${gaEscape(message)}`
      );
    }
  }

  onRunComplete(_contexts, results) {
    if (!this.failures.length) return;

    // Write a compact end-of-log block so anyone scrolling to the bottom sees
    // failures, not just the exit code.
    const sep = '─'.repeat(60);
    const lines = [`\n${sep}`, `CI failures (${this.failures.length})`, sep];
    for (const f of this.failures) {
      lines.push(`✕ ${f.file}:${f.line}`);
      if (f.title) lines.push(`    ${f.title}`);
      if (f.message) lines.push(`    ${f.message}`);
    }
    lines.push(sep + '\n');
    console.log(lines.join('\n'));

    // Append a markdown summary to GitHub Actions step summary, if available.
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      const md = [];
      md.push(`### Jest failures (${this.failures.length})`);
      md.push('');
      md.push('| File | Line | Test | Failure |');
      md.push('|---|---:|---|---|');
      for (const f of this.failures) {
        const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        md.push(`| \`${cell(f.file)}\` | ${f.line} | ${cell(f.title)} | ${cell(f.message)} |`);
      }
      md.push('');
      try {
        fs.appendFileSync(summaryPath, md.join('\n') + '\n');
      } catch {
        // Non-fatal — the stdout block already covered it.
      }
    }

    // Don't override jest's own success flag; let it set the exit code.
    if (results && results.success === false) {
      // Intentional no-op; the default reporter already signals failure.
    }
  }
}

module.exports = CiReporter;
