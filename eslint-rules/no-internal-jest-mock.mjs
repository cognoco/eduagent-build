/**
 * ESLint rule: no-internal-jest-mock
 *
 * Warns when `jest.mock()` is called with a relative module specifier
 * (`./foo`, `../bar`, `../../baz`). Mocking internal code hides real
 * bugs and is the opposite of what tests are for — the test no longer
 * exercises the implementation it claims to verify.
 *
 * External boundaries (Stripe, Clerk JWKS, OpenAI SDKs, push providers,
 * the system clock) are bare module specifiers and are NOT flagged by
 * this rule — those mocks are legitimate.
 *
 * Severity is `warn` for now: ~260 legacy violations exist and are
 * tracked separately. The point is to stop NEW violations landing.
 *
 * See CLAUDE.md > Code Quality Guards > "No internal mocks in
 * integration tests" and the governance audit
 * docs/plans/2026-05-03-governance-audit.md (item GC1).
 *
 * Works with ESLint v9 flat config as a local plugin rule.
 */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Warn on jest.mock() of internal (relative-path) modules. Mocks should be reserved for external boundaries.',
    },
    schema: [],
    messages: {
      internalMock:
        "Avoid jest.mock('{{ specifier }}') of internal code — mocking your own modules hides real bugs. Mock only external boundaries (third-party SDKs, network, time). See CLAUDE.md > Code Quality Guards.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    function hasGc1AllowOnLine(node) {
      const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
      return line.includes('gc1-allow');
    }

    function check(node) {
      const arg = node.arguments[0];
      if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') {
        return;
      }
      const specifier = arg.value;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        if (hasGc1AllowOnLine(node) || hasGc1AllowOnLine(arg)) {
          return;
        }
        context.report({
          node: arg,
          messageId: 'internalMock',
          data: { specifier },
        });
      }
    }

    return {
      // Cover both jest.mock (hoisted) and jest.doMock (non-hoisted). Without
      // doMock the rule has a trivial bypass — see #148 review feedback.
      "CallExpression[callee.object.name='jest'][callee.property.name='mock']":
        check,
      "CallExpression[callee.object.name='jest'][callee.property.name='doMock']":
        check,
    };
  },
};

export default rule;
