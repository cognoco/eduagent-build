import { existsSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

type ClerkAudienceEnvironment = Record<string, string | undefined>;
type LocalApiAudienceReader = () => string | undefined;

function localApiVarsPath(): string {
  const cwdPath = path.join(process.cwd(), 'apps', 'api', '.dev.vars');
  return existsSync(cwdPath)
    ? cwdPath
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
}

function readLocalApiClerkAudience(): string | undefined {
  const localApiEnvironment: Record<string, string> = {};
  const result = dotenv.config({
    path: localApiVarsPath(),
    processEnv: localApiEnvironment,
  });

  return localApiEnvironment.CLERK_AUDIENCE ?? result.parsed?.CLERK_AUDIENCE;
}

export function alignPlaywrightClerkAudience(
  env: ClerkAudienceEnvironment,
  readLocalAudience: LocalApiAudienceReader = readLocalApiClerkAudience,
): string | undefined {
  if (env.PLAYWRIGHT_SKIP_LOCAL_API === '1') {
    return env.CLERK_AUDIENCE;
  }

  const localAudience = readLocalAudience()?.trim();
  if (!localAudience) {
    throw new Error(
      '[playwright:clerk-audience] Local API CLERK_AUDIENCE is unavailable. Restore a non-empty development binding in apps/api/.dev.vars before running Playwright in local API mode.',
    );
  }

  const runnerAudience = env.CLERK_AUDIENCE?.trim();
  if (runnerAudience && runnerAudience !== localAudience) {
    throw new Error(
      '[playwright:clerk-audience] Runner CLERK_AUDIENCE does not match the local API audience. Remove the runner override or align the existing local development configuration before running Playwright.',
    );
  }

  env.CLERK_AUDIENCE = localAudience;
  return localAudience;
}

function decodeAudienceMetadata(token: string): unknown {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error(
      '[playwright:clerk-audience] Clerk session token metadata is malformed.',
    );
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { aud?: unknown };
    return decoded.aud;
  } catch {
    throw new Error(
      '[playwright:clerk-audience] Clerk session token metadata is malformed.',
    );
  }
}

export function assertDevelopmentClerkTokenAudience(
  token: string,
  expectedAudience: string | undefined,
): void {
  if (!expectedAudience?.trim()) {
    throw new Error(
      '[playwright:clerk-audience] Expected development audience is unavailable.',
    );
  }

  const tokenAudience = decodeAudienceMetadata(token);
  const audiences = Array.isArray(tokenAudience)
    ? tokenAudience.filter(
        (value): value is string => typeof value === 'string',
      )
    : typeof tokenAudience === 'string'
      ? [tokenAudience]
      : [];

  if (audiences.length === 0) {
    throw new Error(
      '[playwright:clerk-audience] Clerk session token has no audience metadata. Configure the development Clerk session-token audience before running the diagnostic.',
    );
  }

  if (!audiences.includes(expectedAudience.trim())) {
    throw new Error(
      '[playwright:clerk-audience] Clerk session token audience does not match the local API audience. Align the development-only Clerk token configuration and local binding before running the diagnostic.',
    );
  }
}
