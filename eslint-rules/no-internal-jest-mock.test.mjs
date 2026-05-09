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
  ],
});
