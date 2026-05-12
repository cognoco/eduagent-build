import { RuleTester } from 'eslint';
import rule from './require-mutate-error-handling.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('require-mutate-error-handling', rule, {
  valid: [
    'foo.mutateAsync(args).catch(handleError);',
    'foo.mutateAsync(args).then(onOk, onErr);',
    'function f() { return foo.mutateAsync(args); }',
    'async function f() { return await foo.mutateAsync(args); }',
    'async function f() { try { await foo.mutateAsync(args); } catch (e) { handle(e); } }',
  ],
  invalid: [
    {
      code: 'foo.mutateAsync(args);',
      errors: [{ messageId: 'missingErrorHandling' }],
    },
    {
      code: 'foo.mutateAsync(args).then(onOk);',
      errors: [{ messageId: 'missingErrorHandling' }],
    },
  ],
});
