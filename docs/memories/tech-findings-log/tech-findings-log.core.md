# Technical Findings Log – Core Summary

## TL;DR
- This log captures non-obvious decisions, constraints, and empirical findings; review relevant entries before proposing architectural or tooling changes.
- Entries are organized by category and date—load only the modules matching your topic to keep context light.
- Always add new findings using the entry template module and update the manifest afterwards.

## Critical Rules
- Search the log before suggesting deviations from adopted patterns or introducing new tooling.
- When you discover a repeatable issue or workaround, document it via the template; include context, alternatives, and warning signs.
- Tag your additions appropriately so Cogno manifests and future tooling surface precise snippets.
- Every new entry must cite the governing `docs/` artefact (document + section) and include a short justification for alignment.

## Module Index
- [Entry Template](module-01-entry-template.md)
- [Example Entry Structure](module-02-category-topic-date.md)
- [Decisions Log Overview](module-03-decisions-log.md)
- [Testing: Jest Workspace Package Resolution (2025-10-25)](module-04-testing-jest-workspace-package-resolution-esm-commonjs-2025-10-25.md)
- [Platform Compatibility: Prisma Client on Windows ARM64 (2025-10-27)](module-05-platform-compatibility-prisma-client-on-windows-arm64-2025-10-27.md)
- [Build Configuration: Library Package Module Resolution for Next.js Imports (2025-10-27)](module-06-build-configuration-library-package-module-resolution-for-next-js-imports-2025-10-27.md)
- [Git Configuration: Husky Hook Line Endings on Windows (2025-10-28)](module-07-git-configuration-husky-hook-line-endings-on-windows-2025-10-28.md)
- [Related Documentation](module-08-related-documentation.md)
- [Testing: Jest Hanging on Windows in Pre-commit Hooks (2025-10-28)](module-09-testing-jest-hanging-on-windows-in-pre-commit-hooks-2025-10-28.md)
- [TypeScript Configuration: Nx Modern Pattern (2025-11-01)](module-10-typescript-configuration-nx-modern-pattern-workspaces-project-references-not-manual-paths-2025-11-01.md)
- [Database Configuration: Supabase PostgreSQL Connection URL Encoding (2025-11-01)](module-11-database-configuration-supabase-postgresql-connection-url-encoding-2025-11-01.md)
- [Nx Configuration: dependsOn Syntax (2025-11-02)](module-12-nx-configuration-nx-dependson-syntax-string-form-vs-object-form-2025-11-02.md)
- [Web App Configuration: API URL Overrides (2025-11-02)](module-13-web-app-configuration-api-url-configuration-rewrites-environment-variable-override-2025-11-02.md)
- [Server Configuration: Express CORS (2025-11-03)](module-14-server-configuration-express-cors-configuration-2025-11-03.md)
- [Database Configuration: Supabase Pooler Hostname Discovery (2025-11-04)](module-15-database-configuration-supabase-pooler-hostname-discovery-2025-11-04.md)
- [Database Configuration: IPv6 Requirement & Free Tier Workaround (2025-11-04)](module-16-database-configuration-ipv6-requirement-and-free-tier-workaround-2025-11-04.md)
- [Phase 5 Completion – Multi-environment Migration Synchronization](module-17-phase-5-completion-multi-environment-migration-synchronization.md)
- [Environment Validation: Optional Variables Allowlist (Issue #23, 2025-11-05)](module-18-environment-validation-optional-variables-allowlist-issue-23-2025-11-05.md)
- [Future Entries Placeholder](module-19-future-entries.md)

## Usage Notes
- Use tags from the manifest (e.g., `database`, `testing`) when filtering within Cogno or downstream tooling.
- Record outcomes of experiments and rejected alternatives to prevent repeated investigations.
- Keep this core summary lean—add high-level cataloguing notes here, and move deep dives into dedicated modules.

## Module vs. Core Authoring Guidance
- Add short (<50 line) clarifications or cross-reference notes here; place full findings in `module-XX-*.md`.
- Create a new module when documenting troubleshooting timelines, reproducible steps, or any narrative that exceeds ~50 lines.
- Split or supersede modules when a finding grows beyond ~100 lines or diverges into multiple independent scenarios; ensure manifests capture each new entry.

