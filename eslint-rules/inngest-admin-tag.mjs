/**
 * ESLint rule: inngest-admin-tag (GC5)
 *
 * Inngest functions that touch the database via raw `db.select`,
 * `db.insert`, `db.update`, `db.delete`, `db.query`, or `db.transaction`
 * — i.e. they don't go through `createScopedRepository(profileId)` —
 * must declare WHY in a file-level annotation:
 *
 *   // @inngest-admin: cross-profile
 *   // @inngest-admin: parent-chain (subjects.profileId enforced)
 *
 * The annotation forces the author (and reviewers) to confirm the
 * function's profile scoping is intentional rather than accidental.
 * Without it, a `db.query.X.findFirst({ where: eq(X.id, eventId) })`
 * with a missing `profileId` predicate can read another user's data
 * and the bug ships clean — type-checks pass, scoped-repo lint
 * doesn't trigger (no repo is used), and CI is green.
 *
 * Rule scope: `apps/api/src/inngest/functions/*.ts` (non-test).
 *
 * Severity: `warn` for now — there is a known backlog of ~17 untagged
 * functions whose annotation value depends on case-by-case review
 * (cross-profile vs. single-profile parent-chain). The rule's
 * primary job is to stop NEW untagged functions; the backlog can be
 * worked down in a dedicated sweep.
 *
 * Deferred sweep tracked in
 *   docs/_archive/plans/done/2026-05-03-governance-audit.md  (item GC5)
 * — that doc records the 17-file count and the promotion-to-`error`
 * gating condition. Promotion happens after the sweep PR lands.
 *
 * See CLAUDE.md > Non-Negotiable Engineering Rules.
 */

const RAW_DB_METHODS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'query',
  'transaction',
]);

function isRawDbAccess(node) {
  // Pattern A: db.<method>(...)  or  db.<method>.<chain>
  // node is MemberExpression with object `db` and property in RAW_DB_METHODS.
  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'db' &&
    node.property.type === 'Identifier' &&
    RAW_DB_METHODS.has(node.property.name)
  ) {
    return true;
  }
  return false;
}

function hasAdminTagInLeadingComments(sourceCode) {
  // Scan every comment in the file. The canonical placement is a line-1
  // single-line comment (see daily-reminder-scan.ts), but legitimate files
  // may have a copyright / JSDoc block above the tag. Comment counts are
  // small and getAllComments() is O(n) — no reason to gate this by line.
  const comments = sourceCode.getAllComments();
  for (const c of comments) {
    if (/@inngest-admin:\s*\S/.test(c.value)) return true;
  }
  return false;
}

function importsCreateScopedRepository(sourceCode) {
  // Walk top-level ImportDeclaration nodes — parser-agnostic and immune to
  // `createScopedRepository` mentions inside comments or string literals.
  // (A token-based scan also works on espree but breaks under TS-aware
  // parsers that drop the tokens array.)
  const body = sourceCode.ast?.body ?? [];
  for (const n of body) {
    if (n.type !== 'ImportDeclaration') continue;
    for (const spec of n.specifiers ?? []) {
      const local = spec.local?.name;
      const imported =
        spec.type === 'ImportSpecifier'
          ? spec.imported?.name ?? spec.imported?.value
          : null;
      if (local === 'createScopedRepository' || imported === 'createScopedRepository') {
        return true;
      }
    }
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Inngest function files using raw db.X to declare their profile-scoping intent via // @inngest-admin: <reason>.',
    },
    schema: [],
    messages: {
      missingAdminTag:
        "Inngest function file uses raw `db.{{ method }}` but neither imports createScopedRepository nor declares `// @inngest-admin: <reason>` at the top of the file. Add the annotation (`cross-profile`, `parent-chain`, etc.) explaining why this function bypasses scoped-repo isolation, or refactor to use createScopedRepository(profileId). See CLAUDE.md.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    // Only enforce inside Inngest function source files (non-test). The
    // pattern allows arbitrary subdirectories under functions/ so future
    // nesting (e.g. functions/billing/cron.ts) stays covered.
    const filename = (context.filename ?? context.getFilename?.() ?? '').replace(/\\/g, '/');
    if (!/\/apps\/api\/src\/inngest\/functions\/.+\.ts$/.test(filename)) {
      return {};
    }
    if (/\.test\.ts$/.test(filename) || /\.integration\.test\.ts$/.test(filename)) {
      return {};
    }

    // Short-circuit if the file already has either escape hatch.
    if (
      importsCreateScopedRepository(sourceCode) ||
      hasAdminTagInLeadingComments(sourceCode)
    ) {
      return {};
    }

    // Report ONCE per file at the first raw-db site we find.
    let reported = false;

    return {
      MemberExpression(node) {
        if (reported) return;
        if (!isRawDbAccess(node)) return;
        reported = true;
        context.report({
          node,
          messageId: 'missingAdminTag',
          data: { method: node.property.name },
        });
      },
    };
  },
};

export default rule;
