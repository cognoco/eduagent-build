import { Inngest, InngestMiddleware } from 'inngest';
import { setDatabaseUrl } from './helpers';

/**
 * Middleware that captures Cloudflare Workers env bindings and injects
 * DATABASE_URL into the module-level variable used by getStepDatabase().
 *
 * On CF Workers the bindings are only available through the request-scoped
 * env object. Inngest's middleware lifecycle runs before each function
 * invocation, giving us a hook to propagate the binding.
 */
const envBindingMiddleware = new InngestMiddleware({
  name: 'CF Env Binding Middleware',
  init() {
    return {
      onFunctionRun({ reqArgs }) {
        // reqArgs[0] is the Request, reqArgs[1] is the CF env bindings object
        const env = reqArgs[1] as Record<string, unknown> | undefined;
        if (env && typeof env['DATABASE_URL'] === 'string') {
          setDatabaseUrl(env['DATABASE_URL']);
        }
        return {};
      },
    };
  },
});

export const inngest = new Inngest({
  id: 'eduagent',
  middleware: [envBindingMiddleware],
});
