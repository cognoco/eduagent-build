# Adopted Patterns – Core Summary

## TL;DR
- Repository-specific standards override any generator defaults; consult modules before accepting scaffolded code.
- Focus areas: test placement, TypeScript resolution, Jest setup, Express routing, OpenAPI pipeline, Prisma usage, testing tooling, and database hygiene.
- When editing or generating code, load only the modules relevant to the task (see links below) to avoid context overload.

## Critical Rules
- Always align new projects with the documented patterns; if a generator disagrees, fix it immediately.
- Prefer co-located tests, `moduleResolution: bundler` for app code, and path-agnostic Express routers.
- Prisma configuration (schema, client lifecycle, migrations, env management) must follow the shared conventions to avoid drift.
- Each new pattern must cite the governing `docs/` artefact (document + section) and note why the pattern is consistent with it.

## Module Index
- [Pattern 1: Test File Location](module-01-pattern-1-test-file-location.md)
- [Pattern 2: TypeScript Module Resolution](module-02-pattern-2-typescript-module-resolution.md)
- [Pattern 3: Jest Configuration](module-03-pattern-3-jest-configuration.md)
- [Pattern 4: TypeScript Configuration for Applications](module-04-pattern-4-typescript-configuration-for-applications.md)
- [Pattern 5: Express Route Organization](module-05-pattern-5-express-route-organization-path-agnostic-routers.md)
- [Pattern 6: OpenAPI Spec Generation](module-06-pattern-6-openapi-spec-generation.md)
- [Pattern 7: OpenAPI Type Generation](module-07-pattern-7-openapi-type-generation.md)
- [How to Update This Document](module-08-how-to-update-this-document.md)
- [Pattern 8: Prisma Schema Conventions](module-09-pattern-8-prisma-schema-conventions.md)
- [Pattern 9: Prisma Client Singleton](module-10-pattern-9-prisma-client-singleton.md)
- [Pattern 10: Testing Enhancement Libraries](module-11-pattern-10-testing-enhancement-libraries-mandatory.md)
- [Pattern 11: Format Check Target Configuration](module-12-pattern-11-format-check-target-configuration.md)
- [Pattern 12: Windows Jest Hanging Fix](module-13-pattern-12-windows-jest-hanging-per-project-environment-variables.md)
- [Pattern 13: Database Environment Management](module-14-pattern-13-database-environment-management.md)
- [Pattern 14: Migration Management & Rollback](module-15-pattern-14-migration-management-and-rollback.md)
- [Pattern 15: Per-Project Jest Setup Files](module-16-pattern-15-per-project-jest-setup-files-principle-of-least-privilege.md)
- [Pattern Template](module-17-pattern-template.md)
- [Pattern Template Example](module-18-pattern-n-pattern-name.md)

## Usage Notes
- Load the relevant module(s) only; the core file should stay within the default context window.
- When documenting new patterns, copy the template module, update metadata in the manifest, and refresh the workspace index.
- Keep this core summary scannable—use it for overview notes and links, not exhaustive guidance.

## Module vs. Core Authoring Guidance
- Add brief (<50 line) clarifications or high-level principles directly here when immediate visibility matters.
- Create a new `module-XX-topic.md` when the pattern needs detailed steps, code samples, or exceeds roughly 50 lines.
- Split patterns into numbered variants (e.g. Pattern 5.1/5.2) when an entry grows beyond ~100 lines or covers independent scenarios; give each its own module and manifest entry.

