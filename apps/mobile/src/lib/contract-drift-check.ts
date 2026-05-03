import { getApiUrl } from './api';

interface HealthResponse {
  status: string;
  deploySha: string | null;
}

let checked = false;

/**
 * Dev-only: fetch the API health endpoint and compare the deployed commit SHA
 * with the local branch. Logs a prominent console warning when the API is
 * running code from a different commit than the mobile client expects.
 *
 * Runs at most once per app session. No-op in production builds.
 *
 * [BUG-954] Prevents the class of bug where local mobile silently calls
 * APIs / sends headers that haven't been deployed to staging yet, producing
 * cryptic CORS rejects or 404s that look like streaming bugs.
 */
export async function checkContractDrift(): Promise<void> {
  if (!__DEV__ || checked) return;
  checked = true;

  try {
    const url = `${getApiUrl()}/v1/health`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;

    const body = (await res.json()) as HealthResponse;
    if (!body.deploySha) {
      console.info(
        '[contract-drift] API has no DEPLOY_SHA — cannot detect drift. ' +
          'This is normal for local wrangler dev.'
      );
      return;
    }

    const localSha = process.env.EXPO_PUBLIC_GIT_SHA;
    if (!localSha) {
      console.info(
        `[contract-drift] API deployed from ${body.deploySha}. ` +
          'Set EXPO_PUBLIC_GIT_SHA in your env to enable drift detection.'
      );
      return;
    }

    if (body.deploySha === localSha.slice(0, 8)) {
      console.info(
        `[contract-drift] API and mobile on same commit (${body.deploySha}) OK`
      );
      return;
    }

    console.warn(
      '\n' +
        '╔══════════════════════════════════════════════════════════════╗\n' +
        '║  WARNING: API CONTRACT DRIFT DETECTED                      ║\n' +
        '╠══════════════════════════════════════════════════════════════╣\n' +
        `║  API deployed:  ${body.deploySha.padEnd(40)} ║\n` +
        `║  Local mobile:  ${localSha.slice(0, 8).padEnd(40)} ║\n` +
        '║                                                            ║\n' +
        '║  Your mobile client may call endpoints or send headers     ║\n' +
        '║  that do not exist on the deployed API. If you see CORS    ║\n' +
        '║  errors, 404s, or mysterious stream failures — this is     ║\n' +
        '║  likely the cause.                                         ║\n' +
        '║                                                            ║\n' +
        '║  Fix: merge and deploy your branch, or point mobile at     ║\n' +
        '║  a local wrangler dev server that has your changes.        ║\n' +
        '╚══════════════════════════════════════════════════════════════╝\n'
    );
  } catch {
    // Network failure during drift check is not actionable — swallow silently.
  }
}
