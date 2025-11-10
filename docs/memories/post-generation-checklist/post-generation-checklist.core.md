# Post-Generation Checklist – Core Summary

## TL;DR
- Every Nx generator output must be normalized immediately; refer to the relevant module based on the generator used.
- Priorities: align Jest + TypeScript configs, enforce bundler choices, wire Next.js/Node apps to workspace standards, and handle Prisma migrations properly.
- Always execute the checklist before committing generated code to avoid pattern drift.

## Critical Rules
- Determine which generator ran and open the matching module; never assume the output is compliant.
- Apply UI testing enhancements, TS config fixes, and project targets before running tests or building.
- Prisma artifacts require the documented migration workflow—do not shortcut the process.

## Module Index
- [After: `nx g @nx/jest:configuration <project>`](module-01-after-nx-g-nx-jest-configuration-project.md)
- [After: `nx g @nx/js:lib <name>` or `nx g @nx/react:app <name>`](module-02-after-nx-g-nx-js-lib-name-or-nx-g-nx-react-app-name.md)
- [After: `nx g @nx/js:lib <name> --bundler=none` (Prisma packages)](module-03-after-nx-g-nx-js-lib-name-bundler-none-prisma-packages.md)
- [After: `prisma migrate dev --create-only` (migration generation)](module-04-after-prisma-migrate-dev-create-only-prisma-migration-generation.md)
- [After: `nx g @nx/node:app <name>`](module-05-after-nx-g-nx-node-app-name.md)
- [After: `nx g @nx/next:app <name>` (Next.js applications)](module-06-after-nx-g-nx-next-app-name-next-js-applications.md)
- [After: `nx g @nx/react:app <name>` (future mobile apps)](module-07-after-nx-g-nx-react-app-name-future-mobile-apps.md)
- [After: Any project generation (apps or libraries)](module-08-after-any-project-generation-apps-or-libraries.md)
- [How to Use This Checklist](module-09-how-to-use-this-checklist.md)
- [How to Update This Document](module-10-how-to-update-this-document.md)
- [Checklist Template](module-11-checklist-template.md)
- [After: `nx g <generator> --options`](module-12-after-nx-g-generator-options.md)
- [Related Documentation](module-13-related-documentation.md)

## Usage Notes
- Load only the module matching the generator/action performed; combine modules if multiple generators were used.
- Record completion in run logs and update manifest metadata when new generators or fixes are added.
- Keep this core file focused on navigation—reserve detailed fix procedures for modules.

## Module vs. Core Authoring Guidance
- Capture quick reminders or global checklist notes here when they stay under ~50 lines.
- Create/extend a `module-XX-*.md` when documenting step-by-step fixes, commands, or generator-specific quirks that exceed ~50 lines.
- Split modules when a single checklist grows past ~100 lines or when different generators require independent workflows; ensure each has its own manifest entry.

