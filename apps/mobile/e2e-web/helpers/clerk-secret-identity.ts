import { existsSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

type ClerkSecretEnvironment = Record<string, string | undefined>;
type LocalApiSecretReader = () => string | undefined;

function readLocalApiClerkSecret(): string | undefined {
  const localApiEnvironment: Record<string, string> = {};
  const cwdApiVarsPath = path.join(process.cwd(), 'apps', 'api', '.dev.vars');
  const apiVarsPath = existsSync(cwdApiVarsPath)
    ? cwdApiVarsPath
    : path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'apps',
        'api',
        '.dev.vars',
      );
  const result = dotenv.config({
    path: apiVarsPath,
    processEnv: localApiEnvironment,
  });

  return (
    localApiEnvironment.CLERK_SECRET_KEY ?? result.parsed?.CLERK_SECRET_KEY
  );
}

export function alignPlaywrightClerkSecret(
  env: ClerkSecretEnvironment,
  readLocalApiSecret: LocalApiSecretReader = readLocalApiClerkSecret,
): string | undefined {
  const runnerSecret = env.CLERK_SECRET_KEY;

  if (env.PLAYWRIGHT_SKIP_LOCAL_API === '1') {
    return runnerSecret;
  }

  const localApiSecret = readLocalApiSecret();
  if (!localApiSecret?.trim()) {
    throw new Error(
      '[playwright:clerk-identity] Local API CLERK_SECRET_KEY is unavailable. Restore apps/api/.dev.vars before running Playwright in local API mode.',
    );
  }

  if (runnerSecret && runnerSecret !== localApiSecret) {
    throw new Error(
      '[playwright:clerk-identity] Runner CLERK_SECRET_KEY does not match the local API Clerk identity. Remove the runner override or align the existing local configuration before running Playwright.',
    );
  }

  env.CLERK_SECRET_KEY = localApiSecret;
  return localApiSecret;
}
