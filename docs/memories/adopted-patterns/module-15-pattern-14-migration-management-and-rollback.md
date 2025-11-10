## Pattern 14: Migration Management and Rollback

**Our Standard**: Use `prisma migrate deploy` for production-safe migrations; manual rollback process documented

### Pattern

**Migration Application** (Forward):
```bash
# Development database
pnpm run db:migrate:deploy:dev

# Test database
pnpm run db:migrate:deploy:test

# Production database (future)
pnpm run db:migrate:deploy:prod
```

**Migration Rollback** (Manual Process):

Prisma does not have a built-in rollback command. To revert a migration:

1. **Identify the migration to rollback**:
   ```bash
   # List all migrations
   ls packages/database/prisma/migrations/
   ```

2. **Create a new migration that reverses the changes**:
   ```bash
   # For development (creates new migration)
   pnpm run db:migrate:dev

   # Manually edit the generated migration.sql to reverse the schema changes
   # Example: If migration added a table, the rollback drops that table
   ```

3. **Example rollback migration**:
   ```sql
   -- Rollback for: 20251027072808_create_health_check
   -- This migration would drop the table created by that migration
   DROP TABLE IF EXISTS "health_checks";
   ```

4. **Apply the rollback migration**:
   ```bash
   pnpm run db:migrate:deploy:dev    # Apply to development
   pnpm run db:migrate:deploy:test   # Apply to test
   ```

**Best Practices**:

- **Never rollback in production** unless absolutely necessary - prefer forward-only migrations
- **Test rollback locally first** - Always test on development/test databases before production
- **Data loss warning** - Rollbacks that drop columns/tables will permanently delete data
- **Migration naming** - Name rollback migrations clearly: `20251104_rollback_health_check`
- **Version control** - Commit rollback migrations to git like any other migration
- **Database backups** - Always backup production database before applying any migration or rollback

**Emergency Rollback** (Production):

If a production migration causes critical issues:

1. **Backup the database immediately**:
   ```bash
   # Via Supabase dashboard: Database > Backups > Create backup
   ```

2. **Create and test rollback migration locally**:
   ```bash
   # On local dev database
   pnpm run db:migrate:dev  # Create rollback migration
   # Edit migration.sql to reverse changes
   pnpm run db:migrate:deploy:dev  # Test locally
   ```

3. **Apply to test database**:
   ```bash
   pnpm run db:migrate:deploy:test  # Verify on test
   ```

4. **Apply to production** (only after local + test verification):
   ```bash
   pnpm run db:migrate:deploy:prod
   ```

### Applies To

All environments (development, test, production) and all Prisma-managed databases

### Rationale

**Why `migrate deploy` instead of `migrate dev`:**
- `migrate deploy` is production-safe (non-interactive, fails on conflicts)
- `migrate dev` is interactive and can make assumptions (not safe for CI/CD)
- Aligns with Prisma's recommended deployment workflow

**Why manual rollback process:**
- Prisma philosophy: forward-only migrations are safer
- Rollbacks risk data loss and schema inconsistencies
- Manual process forces deliberate review of rollback safety
- Industry standard: Django, Rails, Laravel all use manual rollbacks

**Why document emergency procedures:**
- Production incidents require clear, tested procedures
- Reduces panic-driven mistakes during outages
- Ensures rollbacks are tested before production application

### When Adding New Migrations

**⚠️ Common migration pitfalls:**
- Forgetting to test rollback procedures locally
- Not considering data migration during rollback
- Applying migrations directly to production without testing
- Not backing up production database before migrations

**Required workflow:**
1. Create migration on development database
2. Test forward migration on dev/test
3. Create and test rollback migration on dev/test
4. Verify data integrity after rollback
5. Only then apply to production (if applicable)

### Last Validated

2025-11-04 (Prisma 6.17.1, Supabase PostgreSQL 15)

**References**:
- [Prisma Migration Deployment Guide](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-troubleshooting)
- [Prisma Migrate Deploy Documentation](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)
- docs/environment-setup.md - Environment-specific migration commands
- Pattern 13 (this document) - Database environment management

---
