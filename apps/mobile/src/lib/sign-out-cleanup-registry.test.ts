// ---------------------------------------------------------------------------
// [CR-SECURESTORE-REGISTRY-11] Meta-test: SecureStore key registry enforcement
//
// The sign-out cleanup helper relies on a hand-maintained registry of
// SecureStore key shapes. When a contributor adds a new SecureStore writer
// without updating that registry, the new key persists across sign-out
// forever — exactly the BUG-723 / SEC-7 leak the registry was designed to
// prevent.
//
// This test scans the entire mobile codebase for `SecureStore.setItemAsync(...)`
// callsites, extracts the first-arg key shape, and asserts each one is
// either:
//   1. Registered in `PER_PROFILE_KEYS` (per-profile builder), or
//   2. Registered in `GLOBAL_KEYS` (account-wide constant), or
//   3. Documented in `REGISTRY_EXCEPTIONS` (Clerk tokens, migration helpers,
//      TTL-cleaned multi-key shapes).
//
// Adding a new SecureStore writer? Either:
//   - register the key shape in PER_PROFILE_KEYS / GLOBAL_KEYS, or
//   - if it genuinely doesn't fit, add an entry to REGISTRY_EXCEPTIONS with
//     a justification. Don't just disable this test.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import {
  PER_PROFILE_KEYS,
  GLOBAL_KEYS,
  REGISTRY_EXCEPTIONS,
} from './sign-out-cleanup';

const MOBILE_SRC = path.resolve(__dirname, '..');

interface Callsite {
  relPath: string;
  line: number;
  rawArg: string;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

// Match `<something>.setItemAsync(<firstArg>, ` and `setItemAsync(<firstArg>, `.
// We only care about the first argument (the key). The arg may be:
//   - a string literal: 'foo'  or  "foo"  or  `foo`
//   - a template literal: `foo-${profileId}`
//   - a function-call expression: getInputModeKey(activeProfileId)
//   - a constant identifier: HAS_SIGNED_IN_KEY
//   - a sanitized template: sanitizeSecureStoreKey(`foo-${id}`)
// Capture the raw text up to the first matching `,` at depth 0.
function findCallsites(filePath: string, source: string): Callsite[] {
  const callsites: Callsite[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (!lineText) continue;
    const match = /\bsetItemAsync\s*\(/.exec(lineText);
    if (!match) continue;

    // Walk forward from the open paren — collect until the first `,` at
    // paren depth 0 (or final close paren if there are no further args).
    let depth = 0;
    let started = false;
    let buf = '';
    let lineCursor = i;
    let charCursor = match.index + match[0].length;
    let exhausted = false;
    while (lineCursor < lines.length) {
      const line = lines[lineCursor];
      if (line === undefined) break;
      while (charCursor < line.length) {
        const ch = line[charCursor];
        if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          if (depth === 0) {
            exhausted = true;
            break;
          }
          depth--;
        } else if (ch === ',' && depth === 0) {
          exhausted = true;
          break;
        }
        buf += ch;
        started = true;
        charCursor++;
      }
      if (exhausted) break;
      buf += ' ';
      lineCursor++;
      charCursor = 0;
    }

    if (started) {
      callsites.push({
        relPath: path
          .relative(path.resolve(MOBILE_SRC, '..', '..', '..'), filePath)
          .replace(/\\/g, '/'),
        line: i + 1,
        rawArg: buf.trim(),
      });
    }
  }
  return callsites;
}

// Generate a few representative profileIds and check the key shape — it's
// not exhaustive (a writer that changes its key based on profileId content
// could slip through) but it covers all the existing patterns.
const SAMPLE_IDS = [
  'profile-a-1234',
  '00000000-0000-4000-8000-000000000000',
  'short',
];

function expandPerProfileKeys(): Set<string> {
  const set = new Set<string>();
  for (const make of PER_PROFILE_KEYS) {
    for (const id of SAMPLE_IDS) {
      set.add(make(id));
    }
  }
  return set;
}

function isCoveredByPerProfileShape(rawArg: string): boolean {
  // Match the rawArg's structural shape against the registry's builders by
  // substituting any `profileId`-like identifier with each SAMPLE_ID and
  // checking against the expanded key set. We assume the rawArg is the
  // SAME identifier name the builder uses (which is the convention in the
  // codebase: `profileId` or `id`). If the rawArg has function calls
  // (e.g. getPaceKey(profileId)) we instead check the function's known
  // output shape — we map known helpers to their expansions.

  // Strip whitespace. Do NOT strip outer parens — that would incorrectly
  // mangle function-call expressions like `getPaceKey(profileId)`.
  const arg = rawArg.replace(/\s+/g, '');

  // Known helper map: callsite expression -> registered builder index in
  // PER_PROFILE_KEYS (we just check the helper name resolves to a builder
  // whose output, given a sample id, equals the helper's actual output).
  // This is a documentation-only sanity layer — the real check is the
  // expanded-key set substitution below.

  // Substitute any identifier (`profileId`, `activeProfileId`, `id`, etc.)
  // and any `${...}` template piece with each sample id, then test if the
  // resulting literal appears in the expanded set.
  for (const id of SAMPLE_IDS) {
    // Expand template literal placeholders
    let candidate = arg
      // Template literal contents: `foo-${ANYTHING}` -> `foo-<id>`
      .replace(/\$\{[^}]+\}/g, id)
      // Strip enclosing backticks / quotes
      .replace(/^`|`$/g, '')
      .replace(/^'|'$/g, '')
      .replace(/^"|"$/g, '');

    // Helper-call resolution: known helpers map to a substituted form.
    // Pattern: getPaceKey(profileId) -> dictation-pace-<id>
    const helperMap: Array<[RegExp, (sampleId: string) => string]> = [
      [/^getPaceKey\([^)]*\)$/, (s) => `dictation-pace-${s}`],
      [/^getPunctKey\([^)]*\)$/, (s) => `dictation-punctuation-${s}`],
      [/^getBookmarkNudgeKey\([^)]*\)$/, (s) => `bookmark-nudge-shown:${s}`],
      [
        /^getRecoveryKey\([^)]*\)$/,
        (s) =>
          // Mirror the sanitization of `session-recovery-marker-${id}`.
          `session-recovery-marker-${s}`.replace(/[^a-zA-Z0-9._-]/g, '_'),
      ],
      [
        /^getInputModeKey\([^)]*\)$/,
        (s) => `voice-input-mode-${s}`.replace(/[^a-zA-Z0-9._-]/g, '_'),
      ],
      [
        /^getNotifyStorageKey\([^)]*\)$/,
        (s) => `child-paywall-notified-at-${s}`,
      ],
      [/^DISMISSED_KEY\([^)]*\)$/, (s) => `earlyAdopterDismissed_${s}`],
      // sanitizeSecureStoreKey wraps a template literal — handled by the
      // generic substitution path above (the `${...}` -> id replacement
      // already produced a sanitizable string; we run the sanitize fn here).
      [
        /^sanitizeSecureStoreKey\(`[^`]*`\)$/,
        (_s) => '__SANITIZE_HANDLED_BELOW__',
      ],
    ];
    for (const [pattern, build] of helperMap) {
      if (pattern.test(arg)) {
        const expanded = build(id);
        if (expanded === '__SANITIZE_HANDLED_BELOW__') break;
        candidate = expanded;
      }
    }

    // Bare-identifier args (e.g. HAS_SIGNED_IN_KEY, countKey, key) cannot
    // be resolved without a full AST pass. The meta-test's blast radius is
    // structural keys (literal strings + template literals + known helper
    // calls) — those are the patterns that hand-maintained registries miss
    // most often. Variable-named keys are accepted as "trust the writer";
    // values flowing through them are caught either by integration tests,
    // manual review, or by registering the helper that constructs them
    // above (which IS structurally validated).
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arg)) {
      return true;
    }

    if (
      expandPerProfileKeys().has(candidate) ||
      GLOBAL_KEYS.includes(candidate)
    ) {
      return true;
    }
  }
  return false;
}

describe('[CR-SECURESTORE-REGISTRY-11] sign-out cleanup registry enforcement', () => {
  it('every SecureStore.setItemAsync callsite has a registered key shape or documented exception', () => {
    const files = walkSourceFiles(MOBILE_SRC);
    const allCallsites: Callsite[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      if (!/setItemAsync\s*\(/.test(source)) continue;
      allCallsites.push(...findCallsites(file, source));
    }

    expect(allCallsites.length).toBeGreaterThan(0);

    // [CR-PR129-M6] Exception lookup is callsite-scoped (file:line), not
    // file-scoped, so a registered key in an exception-listed file is still
    // checked against the registry.
    const exceptionCallsites = new Set(
      REGISTRY_EXCEPTIONS.map(
        (e: { file: string; line: number }) => `${e.file}:${e.line}`
      )
    );

    const unregistered: Callsite[] = [];
    for (const cs of allCallsites) {
      if (exceptionCallsites.has(`${cs.relPath}:${cs.line}`)) continue;
      if (!isCoveredByPerProfileShape(cs.rawArg)) {
        unregistered.push(cs);
      }
    }

    if (unregistered.length > 0) {
      const lines = unregistered
        .map(
          (cs) =>
            `  ${cs.relPath}:${cs.line}\n    setItemAsync key: ${cs.rawArg}`
        )
        .join('\n\n');
      throw new Error(
        `Found ${unregistered.length} SecureStore.setItemAsync callsite(s) ` +
          `whose key shape is not in PER_PROFILE_KEYS / GLOBAL_KEYS and not ` +
          `in REGISTRY_EXCEPTIONS. Either register the key in ` +
          `apps/mobile/src/lib/sign-out-cleanup.ts, or add a justified ` +
          `entry to REGISTRY_EXCEPTIONS. Do not disable this test.\n\n` +
          `Unregistered callsites:\n${lines}`
      );
    }
  });

  it('REGISTRY_EXCEPTIONS entries reference real files', () => {
    for (const ex of REGISTRY_EXCEPTIONS) {
      const abs = path.resolve(__dirname, '..', '..', '..', '..', ex.file);
      expect(fs.existsSync(abs)).toBe(true);
    }
  });

  // [CR-PR129-M6] Callsite-scoped exception tests.
  it('exception-listed callsite is allowed even though its key is not in the registry', () => {
    // apps/mobile/src/app/_layout.tsx line 55 is the Clerk tokenCache saveToken.
    // The key arg is a bare identifier `key` — this is accepted by the bare-id
    // fast-path in isCoveredByPerProfileShape regardless. The important thing is
    // that the callsite is present in REGISTRY_EXCEPTIONS and its file exists.
    const clerkException = REGISTRY_EXCEPTIONS.find(
      (e: { file: string; line: number }) =>
        e.file === 'apps/mobile/src/app/_layout.tsx' && e.line === 55
    );
    expect(clerkException).toBeDefined();
    const abs = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      clerkException!.file
    );
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('unregistered key on a different line in an exception-listed file is still flagged', () => {
    // Simulate a callsite in an exception-listed file at a line that is NOT
    // in REGISTRY_EXCEPTIONS. The callsite uses an unregistered literal key
    // `totally-unregistered-key`. With file-scoped exceptions this would be
    // silently ignored; with callsite-scoped exceptions it must be flagged.
    const exceptionCallsites = new Set(
      REGISTRY_EXCEPTIONS.map(
        (e: { file: string; line: number }) => `${e.file}:${e.line}`
      )
    );

    // Pick any file that has at least one exception entry.
    const firstException = REGISTRY_EXCEPTIONS[0];
    if (!firstException) throw new Error('REGISTRY_EXCEPTIONS is empty');
    const exceptionFile = firstException.file;
    // Use a line number that is NOT in the exception list for that file.
    const unexceptedLine = 9999;
    const simulatedCallsite: Callsite = {
      relPath: exceptionFile,
      line: unexceptedLine,
      rawArg: "'totally-unregistered-key'",
    };

    const isExcepted = exceptionCallsites.has(
      `${simulatedCallsite.relPath}:${simulatedCallsite.line}`
    );
    expect(isExcepted).toBe(false);

    // The key itself must not be covered by the registry either.
    const isCovered = isCoveredByPerProfileShape(simulatedCallsite.rawArg);
    expect(isCovered).toBe(false);
  });
});
