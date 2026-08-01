/**
 * Integration-only database environment setup for apps/api.
 *
 * Unit Jest deliberately excludes this file so env:sync's staging-shaped
 * .env.development.local cannot make database resolution abort every unit suite.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';

loadDatabaseEnv(resolve(__dirname, '../..'));
