import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for drizzle-kit. Run via Doppler (e.g. `pnpm run db:push:dev`) so secrets are injected.'
  );
}

export default defineConfig({
  schema: './src/schema/!(*.test).ts',
  out: '../../apps/api/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
