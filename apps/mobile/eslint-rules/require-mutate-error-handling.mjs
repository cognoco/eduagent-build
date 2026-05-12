/**
 * ESLint rule: require-mutate-error-handling
 *
 * Warns when `.mutateAsync(...)` is called without a visible error-handling
 * branch — no surrounding try/catch, no chained `.catch()`, and not returned
 * to the caller (which propagates the error via the promise chain).
 *
 * Works with ESLint v9 flat config as a local plugin rule.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require every .mutateAsync() call to have a visible error-handling branch (try/catch, .catch(), or return for propagation)',
    },
    schema: [],
    messages: {
      missingErrorHandling:
        'mutateAsync() has no visible error handling. Wrap in try/catch with user-visible feedback, chain .catch(), or return the promise to propagate errors to the caller.',
    },
  },

  create(context) {
    return {
      /**
       * Match any call expression whose callee ends with `.mutateAsync`.
       * e.g.  foo.mutateAsync(...)
       *       useSomeMutation().mutateAsync(...)
       */
      'CallExpression[callee.type="MemberExpression"][callee.property.name="mutateAsync"]'(
        node,
      ) {
        // ── Check 1: .catch() chained directly ──────────────────────
        // Pattern: foo.mutateAsync(...).catch(...)
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'MemberExpression' &&
          parent.property.name === 'catch'
        ) {
          return; // has .catch() — OK
        }

        // ── Check 2: .then(onFulfilled, onRejected) with 2+ args ──
        if (
          parent &&
          parent.type === 'MemberExpression' &&
          parent.property.name === 'then' &&
          parent.parent &&
          parent.parent.type === 'CallExpression' &&
          parent.parent.arguments.length >= 2
        ) {
          return; // .then(ok, err) — OK
        }

        // ── Check 3: returned to caller (error propagation) ────────
        // Patterns:
        //   return mutateAsync(...)
        //   return await mutateAsync(...)
        // The caller is responsible for error handling; our rule will
        // flag their call site if they also miss it.
        if (isReturned(node)) {
          return; // error propagates to caller — OK
        }

        // ── Check 4: inside a try block ─────────────────────────────
        let ancestor = node.parent;
        while (ancestor) {
          if (ancestor.type === 'TryStatement' && ancestor.handler) {
            return; // wrapped in try/catch — OK
          }

          // Stop climbing at function boundaries — a try/catch in an outer
          // function doesn't protect this call if it's in a callback.
          if (
            ancestor.type === 'FunctionDeclaration' ||
            ancestor.type === 'FunctionExpression' ||
            ancestor.type === 'ArrowFunctionExpression'
          ) {
            break;
          }

          ancestor = ancestor.parent;
        }

        // No error handling found — report
        context.report({ node, messageId: 'missingErrorHandling' });
      },
    };
  },
};

/**
 * Check whether a node (or its AwaitExpression wrapper) is the argument
 * of a ReturnStatement. This covers:
 *   return mutateAsync(...)
 *   return await mutateAsync(...)
 */
function isReturned(node) {
  let current = node;

  // Unwrap: AwaitExpression wraps the CallExpression
  if (current.parent && current.parent.type === 'AwaitExpression') {
    current = current.parent;
  }

  return current.parent && current.parent.type === 'ReturnStatement';
}

export default rule;
