import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const REPO_ROOT = resolve(__dirname, '..');
const COMPOSE_PATH = resolve(REPO_ROOT, 'docker-compose.test.yml');
const INIT_PATH = resolve(REPO_ROOT, 'scripts/init-test-db.sql');

describe('disposable PostgreSQL extension bootstrap', () => {
  const compose = parse(readFileSync(COMPOSE_PATH, 'utf8'));
  const service = compose.services['test-db'];

  it('mounts the extension initializer into the PostgreSQL init directory', () => {
    expect(service.volumes).toContain(
      './scripts/init-test-db.sql:/docker-entrypoint-initdb.d/10-test-extensions.sql:ro',
    );
    expect(existsSync(INIT_PATH)).toBe(true);
  });

  it('fails readiness until vector and pg_trgm are installed', () => {
    const healthcheck = service.healthcheck.test.join(' ');

    expect(healthcheck).toContain('pg_extension');
    expect(healthcheck).toContain('vector');
    expect(healthcheck).toContain('pg_trgm');
  });

  it('creates both extensions idempotently without destructive SQL', () => {
    expect(existsSync(INIT_PATH)).toBe(true);
    if (!existsSync(INIT_PATH)) return;

    const sql = readFileSync(INIT_PATH, 'utf8');
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector\s*;/i);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm\s*;/i);
    expect(sql).not.toMatch(/\b(?:DROP|ALTER)\b/i);
  });
});
