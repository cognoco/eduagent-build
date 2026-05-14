import { RuleTester } from 'eslint';
import rule from './no-internal-jest-mock.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-internal-jest-mock', rule, {
  valid: [
    // Bare specifier — third-party boundary, allowed.
    "jest.mock('stripe', () => ({}));",
    "jest.mock('@clerk/clerk-expo', () => ({}));",
    "jest.mock('react-native-purchases');",
    "jest.doMock('@anthropic-ai/sdk');",
    // Non-jest namespaces should not trip the rule.
    "vi.mock('./local');",
    "myMock.mock('./local');",
    // Non-string-literal arguments fall outside the rule's scope.
    'jest.mock(modulePath);',
    'jest.mock();',
    // GC1 ratchet escape hatch — must be on the jest.mock/argument line.
    "jest.mock('./sentry' /* gc1-allow: unit test boundary */, () => ({}));",
    "jest.mock( // gc1-allow: handler control-flow test\n  '../services/notifications',\n  () => ({})\n);",
    // Pattern A — inline spread of jest.requireActual(<same path>) is the
    // canonical GC1-compliant shape and must NOT require gc1-allow.
    "jest.mock('./services/foo', () => ({\n  ...jest.requireActual('./services/foo'),\n  bar: jest.fn(),\n}));",
    // Pattern A — named-local spread (two-step form, e.g. when a type
    // annotation is needed on the requireActual call).
    "jest.mock('../services/dashboard', () => {\n  const actual = jest.requireActual('../services/dashboard');\n  return { ...actual, foo: jest.fn() };\n});",
  ],
  invalid: [
    {
      code: "jest.mock('./sentry');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      code: "jest.mock('../services/llm');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      code: "jest.mock('../../middleware/jwt', () => ({}));",
      errors: [{ messageId: 'internalMock' }],
    },
    // doMock must be caught — without this case the rule has a trivial bypass.
    {
      code: "jest.doMock('./sentry');",
      errors: [{ messageId: 'internalMock' }],
    },
    {
      code: "jest.doMock('../foo');",
      errors: [{ messageId: 'internalMock' }],
    },
    // requireActual of a DIFFERENT specifier is not Pattern A — that's the
    // shadow-mock trick BUG-1051 specifically warns about.
    {
      code: "jest.mock('./services/foo', () => ({\n  ...jest.requireActual('./services/bar'),\n  baz: jest.fn(),\n}));",
      errors: [{ messageId: 'internalMock' }],
    },
    // requireActual without any spread isn't Pattern A — the test still
    // shadows the real implementation, just with cherry-picked exports.
    {
      code: "jest.mock('./services/foo', () => {\n  const real = jest.requireActual('./services/foo');\n  return { bar: real.bar };\n});",
      errors: [{ messageId: 'internalMock' }],
    },
  ],
});
