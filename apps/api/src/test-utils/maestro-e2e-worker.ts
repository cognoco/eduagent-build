/**
 * Hosted-Maestro-only Worker entrypoint.
 *
 * Production and ordinary local development continue to boot src/index.ts
 * from wrangler.toml. The E2E workflow names this file explicitly so its
 * external-boundary fixture can never activate in a deployed Worker.
 */
import { registerMaestroE2eLlmProvider } from './maestro-e2e-llm-provider';

registerMaestroE2eLlmProvider();

export { app, default } from '../index';
