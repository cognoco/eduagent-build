#!/usr/bin/env node

import {
  defaultVerificationDependencies,
  verifyDisposableApiIntegrationSchema,
} from './bootstrap-api-integration-schema.mjs';
import { BootstrapRefusal } from '../packages/database/scripts/verify-disposable-integration-target-lib.mjs';

try {
  await verifyDisposableApiIntegrationSchema(
    defaultVerificationDependencies(process.env),
  );
} catch (error) {
  console.error(
    error instanceof BootstrapRefusal
      ? error.message
      : 'Disposable API integration schema verification failed; connection details were withheld.',
  );
  process.exitCode = 1;
}
