import { RuleTester } from 'eslint';
import rule from './require-mutate-error-handling.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('require-mutate-error-handling', rule, {
  valid: [
    // .catch(handler) — chained catch call
    'foo.mutateAsync(args).catch(handleError);',
    // .then(ok, err) with two arguments
    'foo.mutateAsync(args).then(onOk, onErr);',
    // Returned to caller (error propagation)
    'function f() { return foo.mutateAsync(args); }',
    // Return await
    'async function f() { return await foo.mutateAsync(args); }',
    // Wrapped in try/catch
    'async function f() { try { await foo.mutateAsync(args); } catch (e) { handle(e); } }',
  ],
  invalid: [
    // Bare call — no error handling
    {
      code: 'foo.mutateAsync(args);',
      errors: [{ messageId: 'missingErrorHandling' }],
    },
    // [BUG-37] .catch property access without calling it
    {
      code: 'const ref = foo.mutateAsync(args).catch;',
      errors: [{ messageId: 'missingErrorHandling' }],
    },
    // .then with only one argument — no rejection handler
    {
      code: 'foo.mutateAsync(args).then(onOk);',
      errors: [{ messageId: 'missingErrorHandling' }],
    },
  ],
});
